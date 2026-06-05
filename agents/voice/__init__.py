"""Voice IVR built on top of Azure OpenAI gpt-realtime-mini.

Architecture
------------
The customer dashboard opens a WebSocket against the backend at
``/ws/voice/{session_id}``. The backend, in turn, opens a second WebSocket
against the Azure OpenAI realtime endpoint and acts as a *stateful bridge*
between the two:

  Browser <─PCM16─> Backend (this module) <─PCM16─> AOAI gpt-realtime-mini

The bridge does three jobs the browser cannot:

  1. Holds Azure credentials (Managed Identity / az CLI) so the model URL
     and bearer never leave the server.
  2. Configures the realtime session on connect — instructions in Spanish
     plus the two tools the agent needs (`lookup_customer`, `submit_claim`).
  3. Executes function calls server-side. ``lookup_customer`` resolves a
     DNI against ``CUSTOMER_HISTORY`` and returns name + policy info. When
     ``submit_claim`` is invoked the bridge:
        - Tells the frontend to start hold music (`type=hold_music_start`)
        - Runs the full multi-agent pipeline (process_claim)
        - Tells the frontend to stop hold music
        - Pushes the JSON result back into the realtime session so the
          model can read it out loud in Spanish in the proper register
          (approved / rejected / human_review).

The browser only sees raw audio (sent + received) and a small set of
control events. All business logic lives here.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import time
import uuid
from typing import Any, Callable, Awaitable

import websockets
from azure.identity.aio import DefaultAzureCredential

logger = logging.getLogger(__name__)

DEFAULT_DEPLOYMENT = os.environ.get("AZURE_OPENAI_VOICE_DEPLOYMENT", "gpt-realtime-mini")
DEFAULT_API_VERSION = "2025-04-01-preview"
DEFAULT_VOICE = os.environ.get("VOICE_AGENT_VOICE", "marin")  # marin = warm Spanish female

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """Eres Lola, asistente telefónica de Santander Insurance. Hablas español de España con un tono cercano, profesional y empático. Tu trabajo es atender por voz a un cliente que llama para abrir un parte de siniestro de coche.

Sigue ESTRICTAMENTE este guion:

PASO 1 · Saludo
   - Saluda brevemente: "Hola, soy Lola, asistente virtual de Santander Insurance. ¿En qué puedo ayudarle?"
   - Espera a que el cliente confirme que quiere abrir un parte.

PASO 2 · Identificación
   - Pide el nombre completo y el DNI del cliente.
   - Cuando tengas el DNI (8 cifras + 1 letra), llama a la función `lookup_customer(dni)`.
   - Si la función devuelve "found": false, di "Lo siento, no encuentro su póliza con ese DNI. ¿Me lo puede repetir?" y reintenta.
   - Si devuelve "found": true, saluda al cliente por su nombre y confirma la póliza: "Perfecto {nombre}, veo que tiene póliza {coverage_type} para un {vehicle}. ¿Qué ha ocurrido?"

PASO 3 · Recogida del siniestro
   - Deja que el cliente describa lo ocurrido sin interrumpir.
   - Si la descripción es muy corta (menos de 15 palabras) pregunta cortésmente por más detalles: fecha, lugar, daños, otras partes implicadas.
   - Cuando tengas suficiente información, di: "Gracias, voy a procesar su caso. Le pongo en espera unos segundos por favor." y llama a `submit_claim(customer_id, policy_id, incident_type, description, estimated_amount)`.

PASO 4 · Comunicación del resultado
   Cuando recibas el resultado de `submit_claim`, lee EXACTAMENTE el campo `spoken_response` que viene en la respuesta. No improvises, no añadas información extra. Cuelga después educadamente: "¿Necesita algo más? Si no, le deseo un buen día."

Reglas:
 - Habla SIEMPRE en español.
 - Frases cortas, naturales, sin tecnicismos.
 - Si el cliente se desvía del tema, redirígelo amablemente.
 - Si te piden hablar con un humano, di que tomarás nota y un agente le llamará.
 - Nunca inventes información sobre la póliza o el siniestro.
"""

# ---------------------------------------------------------------------------
# Tools (function-calling) — schemas the realtime model can invoke.
# ---------------------------------------------------------------------------
TOOLS = [
    {
        "type": "function",
        "name": "lookup_customer",
        "description": (
            "Resuelve un DNI español (8 dígitos + 1 letra) contra el sistema "
            "de pólizas. Devuelve nombre, id de cliente y póliza asociada."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "dni": {
                    "type": "string",
                    "description": "DNI en formato 12345678A (sin guiones ni espacios)",
                }
            },
            "required": ["dni"],
        },
    },
    {
        "type": "function",
        "name": "submit_claim",
        "description": (
            "Envía el parte de siniestro al pipeline multi-agente para "
            "evaluación. Devuelve la decisión final (approve, reject, "
            "human_review) y un texto listo para leer al cliente."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "string"},
                "policy_id": {"type": "string"},
                "incident_type": {
                    "type": "string",
                    "enum": ["collision", "theft", "fire", "vandalism", "weather", "other"],
                },
                "description": {
                    "type": "string",
                    "description": "Descripción libre del siniestro tal como la contó el cliente",
                },
                "estimated_amount": {
                    "type": "number",
                    "description": "Importe estimado en euros. Si no se conoce, usar 0.",
                },
            },
            "required": ["customer_id", "policy_id", "incident_type", "description"],
        },
    },
]

# ---------------------------------------------------------------------------
# Token + URL helpers
# ---------------------------------------------------------------------------
_cred: DefaultAzureCredential | None = None
_token: str | None = None
_token_expiry: float = 0


async def _get_token() -> str:
    global _cred, _token, _token_expiry
    if _token and time.time() < _token_expiry - 60:
        return _token
    if _cred is None:
        _cred = DefaultAzureCredential(exclude_interactive_browser_credential=True)
    access = await _cred.get_token("https://cognitiveservices.azure.com/.default")
    _token = access.token
    _token_expiry = access.expires_on
    return _token


def _realtime_url() -> str:
    endpoint = os.environ["AZURE_OPENAI_ENDPOINT"].rstrip("/")
    # https -> wss
    endpoint = endpoint.replace("https://", "wss://").replace("http://", "ws://")
    return (
        f"{endpoint}/openai/realtime"
        f"?api-version={DEFAULT_API_VERSION}"
        f"&deployment={DEFAULT_DEPLOYMENT}"
    )


# ---------------------------------------------------------------------------
# The bridge
# ---------------------------------------------------------------------------
ToolFn = Callable[[dict], Awaitable[dict]]


class VoiceBridge:
    """Bridges one browser <-> one AOAI realtime session.

    Caller responsibility:
      - Provide a ``send_to_client`` coroutine that ships JSON events back
        to the browser WebSocket.
      - Provide tool implementations via ``tools`` (a dict of name -> coro).
      - Call ``run()`` to start the upstream connection.
      - Forward incoming browser messages to ``handle_client_event``.
      - Call ``close()`` on disconnect.
    """

    def __init__(
        self,
        session_id: str,
        tools: dict[str, ToolFn],
        send_to_client: Callable[[dict], Awaitable[None]],
    ) -> None:
        self.session_id = session_id
        self.tools = tools
        self.send_to_client = send_to_client
        self._upstream: websockets.WebSocketClientProtocol | None = None
        self._upstream_reader_task: asyncio.Task | None = None
        self._closed = False
        # Per-session state remembered between tool calls (e.g. the customer
        # identity once we have looked it up).
        self.state: dict[str, Any] = {}

    # ------------------------------------------------------------------ life
    async def run(self) -> None:
        """Open upstream WS and start the receive loop. Returns once the
        connection is established. The receive loop continues in the
        background until ``close()`` is called.
        """
        token = await _get_token()
        url = _realtime_url()
        headers = {
            "Authorization": f"Bearer {token}",
            "openai-beta": "realtime=v1",
        }
        logger.info("[%s] connecting to %s", self.session_id, url)
        self._upstream = await websockets.connect(url, additional_headers=headers, max_size=16 * 1024 * 1024)
        # Configure the session
        await self._send_upstream({
            "type": "session.update",
            "session": {
                "modalities": ["audio", "text"],
                "voice": DEFAULT_VOICE,
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {"model": "whisper-1"},
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 700,
                },
                "instructions": SYSTEM_PROMPT,
                "tools": TOOLS,
                "tool_choice": "auto",
                "temperature": 0.7,
            },
        })
        # Greet the user immediately so they hear something on connect
        await self._send_upstream({
            "type": "response.create",
            "response": {"modalities": ["audio", "text"]},
        })
        self._upstream_reader_task = asyncio.create_task(self._upstream_reader())

    async def close(self) -> None:
        self._closed = True
        if self._upstream_reader_task:
            self._upstream_reader_task.cancel()
        if self._upstream:
            try:
                await self._upstream.close()
            except Exception:  # noqa: BLE001
                pass
            self._upstream = None

    # ----------------------------------------------------------------- send
    async def _send_upstream(self, payload: dict) -> None:
        if self._upstream is None:
            return
        try:
            await self._upstream.send(json.dumps(payload))
        except Exception as e:  # noqa: BLE001
            logger.warning("[%s] upstream send failed: %s", self.session_id, e)

    async def handle_client_event(self, raw: str | bytes) -> None:
        """Receive a JSON event from the browser and forward to upstream."""
        try:
            event = json.loads(raw) if isinstance(raw, (str, bytes, bytearray)) else raw
        except Exception:
            logger.warning("[%s] bad client event: %r", self.session_id, raw[:80])
            return
        kind = event.get("type", "")
        if kind == "audio.append":
            # Browser sends base64 PCM16 chunks
            await self._send_upstream({
                "type": "input_audio_buffer.append",
                "audio": event.get("audio", ""),
            })
        elif kind == "audio.commit":
            await self._send_upstream({"type": "input_audio_buffer.commit"})
            await self._send_upstream({
                "type": "response.create",
                "response": {"modalities": ["audio", "text"]},
            })
        elif kind == "text":
            # Text input (fallback for testing without mic)
            await self._send_upstream({
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": event.get("text", "")}],
                },
            })
            await self._send_upstream({
                "type": "response.create",
                "response": {"modalities": ["audio", "text"]},
            })
        elif kind == "ping":
            await self.send_to_client({"type": "pong"})
        elif kind == "interrupt":
            await self._send_upstream({"type": "response.cancel"})
        else:
            logger.debug("[%s] unknown client event %s", self.session_id, kind)

    # ----------------------------------------------------------------- recv
    async def _upstream_reader(self) -> None:
        """Pump events from AOAI realtime to the client, intercepting tool
        calls and executing them server-side.
        """
        assert self._upstream is not None
        try:
            async for msg in self._upstream:
                if self._closed:
                    break
                try:
                    event = json.loads(msg)
                except Exception:
                    continue
                etype = event.get("type", "")

                # 1) Audio out — forward verbatim
                if etype == "response.audio.delta":
                    await self.send_to_client({
                        "type": "audio.delta",
                        "audio": event.get("delta", ""),
                    })
                    continue

                # 2) Audio transcript (what the AI just said)
                if etype == "response.audio_transcript.delta":
                    await self.send_to_client({
                        "type": "transcript.assistant.delta",
                        "text": event.get("delta", ""),
                    })
                    continue
                if etype == "response.audio_transcript.done":
                    await self.send_to_client({
                        "type": "transcript.assistant.done",
                        "text": event.get("transcript", ""),
                    })
                    continue

                # 3) User transcript (what the user said)
                if etype == "conversation.item.input_audio_transcription.completed":
                    await self.send_to_client({
                        "type": "transcript.user",
                        "text": event.get("transcript", ""),
                    })
                    continue

                # 4) Tool calls — execute then send the result back upstream
                if etype == "response.function_call_arguments.done":
                    await self._handle_tool_call(event)
                    continue

                # 5) Speech detection events — useful for UI
                if etype in (
                    "input_audio_buffer.speech_started",
                    "input_audio_buffer.speech_stopped",
                    "response.created",
                    "response.done",
                ):
                    await self.send_to_client({"type": etype})
                    continue

                if etype == "error":
                    logger.error("[%s] upstream error: %s", self.session_id, event)
                    await self.send_to_client({"type": "error", "message": event.get("error", {}).get("message", "?")})
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            logger.exception("[%s] upstream reader crashed: %s", self.session_id, e)
            await self.send_to_client({"type": "error", "message": str(e)})

    # ----------------------------------------------------------------- tools
    async def _handle_tool_call(self, event: dict) -> None:
        name = event.get("name", "")
        call_id = event.get("call_id", "")
        raw_args = event.get("arguments", "{}")
        try:
            args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
        except Exception:
            args = {}
        logger.info("[%s] tool call %s args=%s", self.session_id, name, args)
        fn = self.tools.get(name)
        if not fn:
            result: dict[str, Any] = {"error": f"unknown tool {name}"}
        else:
            # Hold-music for the long-running submit_claim
            if name == "submit_claim":
                await self.send_to_client({"type": "hold_music_start"})
            try:
                result = await fn(args)
            except Exception as e:  # noqa: BLE001
                logger.exception("[%s] tool %s failed", self.session_id, name)
                result = {"error": str(e)}
            finally:
                if name == "submit_claim":
                    await self.send_to_client({"type": "hold_music_stop"})
        # Notify the UI so the transcript pane can show "agent looking up
        # your DNI..." style hints.
        await self.send_to_client({
            "type": "tool.result",
            "name": name,
            "result": result,
        })
        # Push the result back to the realtime conversation
        await self._send_upstream({
            "type": "conversation.item.create",
            "item": {
                "type": "function_call_output",
                "call_id": call_id,
                "output": json.dumps(result, ensure_ascii=False),
            },
        })
        # Tell the model to continue speaking
        await self._send_upstream({
            "type": "response.create",
            "response": {"modalities": ["audio", "text"]},
        })


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------
def build_tools(*, lookup_customer_impl: Callable[[str], dict | None],
                submit_claim_impl: Callable[[dict], Awaitable[dict]]) -> dict[str, ToolFn]:
    """Factory that wires the realtime tools to concrete implementations.

    Allows the backend to pass in its own customer store and pipeline
    function (so this module stays decoupled from FastAPI / claims_store).
    """

    async def lookup_customer(args: dict) -> dict:
        dni = (args.get("dni") or "").upper().replace("-", "").replace(" ", "")
        found = lookup_customer_impl(dni)
        if not found:
            return {"found": False, "dni": dni}
        return {
            "found": True,
            "dni": dni,
            "customer_id": found.get("customer_id"),
            "name": found.get("name"),
            "policy_id": found.get("policy_id"),
            "vehicle": found.get("vehicle"),
            "coverage_type": found.get("coverage_type"),
        }

    async def submit_claim(args: dict) -> dict:
        return await submit_claim_impl(args)

    return {
        "lookup_customer": lookup_customer,
        "submit_claim": submit_claim,
    }


def format_spoken_decision(decision_dict: dict) -> str:
    """Compose the natural-language line the model will read out."""
    decision = (decision_dict.get("decision") or "").lower()
    reasoning = decision_dict.get("reasoning") or ""
    if decision == "approve":
        return (
            "Su parte ha sido aprobado automáticamente. "
            "Recibirá una notificación por email en los próximos minutos con "
            "el desglose del pago y los siguientes pasos."
        )
    if decision == "reject":
        return (
            "Lo siento, su parte ha sido rechazado. "
            f"Motivo: {reasoning[:160]}. "
            "Si considera que es un error, puede contactar con el equipo "
            "de asistencia al cliente para una revisión manual."
        )
    if decision == "human_review":
        return (
            "Su caso requiere una revisión adicional por parte de un "
            "agente humano. Un especialista le contactará en menos de "
            "24 horas para revisar el caso en detalle."
        )
    return "Hemos registrado su parte y estamos procesándolo. Le contactaremos pronto."
