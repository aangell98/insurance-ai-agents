/**
 * Voice IVR audio client.
 *
 * Wraps the WebSocket session against `/ws/voice/{id}` plus all the audio
 * plumbing the browser needs to talk to Azure OpenAI gpt-realtime:
 *
 *  - Mic capture via getUserMedia → AudioContext → ScriptProcessor
 *  - Resampling from the browser's native 48 kHz down to 24 kHz mono PCM16
 *  - Base64 encoding & streaming chunks to the backend
 *  - Receiving audio chunks back, queue + low-latency playback through a
 *    second AudioContext sink
 *  - Hold-music synthesis (a soft chord progression) for the wait while the
 *    multi-agent pipeline processes the claim
 *
 * Public surface is intentionally tiny — the React component (VoiceCallModal)
 * only deals with high-level events.
 */

export type VoiceEvent =
  | { type: 'connecting' }
  | { type: 'connected' }
  | { type: 'transcript.user'; text: string }
  | { type: 'transcript.assistant.delta'; text: string }
  | { type: 'transcript.assistant.done'; text: string }
  | { type: 'tool.result'; name: string; result: unknown }
  | { type: 'hold_music_start' }
  | { type: 'hold_music_stop' }
  | { type: 'speech_started' }
  | { type: 'speech_stopped' }
  | { type: 'error'; message: string }
  | { type: 'closed' };

type Listener = (e: VoiceEvent) => void;

const TARGET_SR = 24_000;
const CHUNK_MS = 100;

export class VoiceAudioClient {
  private ws: WebSocket | null = null;
  private audioCtxIn: AudioContext | null = null;
  private audioCtxOut: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private srcNode: MediaStreamAudioSourceNode | null = null;
  private playQueueTimeSec = 0;
  private listeners: Listener[] = [];
  private holdMusic: HoldMusicSynth | null = null;
  private playMuted = false;

  constructor(private readonly sessionId: string, private readonly wsBaseUrl: string) {}

  on(listener: Listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(e: VoiceEvent) {
    for (const l of this.listeners) l(e);
  }

  async start() {
    this.emit({ type: 'connecting' });
    // 1) Mic
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 48_000, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (e) {
      this.emit({ type: 'error', message: `No se ha podido acceder al micrófono: ${(e as Error).message}` });
      throw e;
    }
    // 2) Output sink
    this.audioCtxOut = new AudioContext({ sampleRate: TARGET_SR });
    this.playQueueTimeSec = this.audioCtxOut.currentTime;
    // 3) Input pipeline
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.audioCtxIn = new Ctx({ sampleRate: 48_000 });
    this.srcNode = this.audioCtxIn!.createMediaStreamSource(this.mediaStream);
    const bufferSize = Math.max(2048, Math.round((48_000 * CHUNK_MS) / 1000 / 256) * 256);
    this.processor = this.audioCtxIn!.createScriptProcessor(bufferSize, 1, 1);
    this.srcNode.connect(this.processor);
    // Need to connect to destination otherwise some browsers don't run the processor
    this.processor.connect(this.audioCtxIn!.destination);
    this.processor.onaudioprocess = (ev) => this.handleMicChunk(ev);
    // 4) Open WS
    const url = `${this.wsBaseUrl}/ws/voice/${this.sessionId}`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => this.emit({ type: 'connected' });
    this.ws.onclose = () => this.emit({ type: 'closed' });
    this.ws.onerror = () => this.emit({ type: 'error', message: 'Conexión perdida con el asistente' });
    this.ws.onmessage = (msg) => this.handleServerMessage(msg);
  }

  async stop() {
    this.playMuted = true;
    this.processor?.disconnect();
    this.srcNode?.disconnect();
    this.audioCtxIn?.close().catch(() => undefined);
    this.audioCtxOut?.close().catch(() => undefined);
    this.audioCtxIn = null;
    this.audioCtxOut = null;
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
    if (this.holdMusic) {
      this.holdMusic.stop();
      this.holdMusic = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  /** Send text input (debug / fallback for muted mic). */
  sendText(text: string) {
    this.ws?.send(JSON.stringify({ type: 'text', text }));
  }

  /** Cancel the assistant's current speech (barge-in). */
  interrupt() {
    this.ws?.send(JSON.stringify({ type: 'interrupt' }));
  }

  // ---------------------------------------------------------------- audio in
  private handleMicChunk(ev: AudioProcessingEvent) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const inputBuf = ev.inputBuffer.getChannelData(0); // Float32 mono @ 48 kHz
    const downsampled = downsampleBuffer(inputBuf, 48_000, TARGET_SR);
    const pcm16 = floatTo16BitPCM(downsampled);
    // Always allocate a real ArrayBuffer (SharedArrayBuffer subviews don't
    // satisfy arrayBufferToBase64's signature in strict TS).
    const copy = new ArrayBuffer(pcm16.byteLength);
    new Uint8Array(copy).set(new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength));
    const b64 = arrayBufferToBase64(copy);
    this.ws.send(JSON.stringify({ type: 'audio.append', audio: b64 }));
  }

  // --------------------------------------------------------------- audio out
  private handleServerMessage(msg: MessageEvent) {
    let event: { type: string; [k: string]: unknown };
    try {
      event = JSON.parse(typeof msg.data === 'string' ? msg.data : '{}');
    } catch {
      return;
    }
    switch (event.type) {
      case 'audio.delta':
        this.enqueueAudio(String(event.audio || ''));
        break;
      case 'transcript.user':
        this.emit({ type: 'transcript.user', text: String(event.text || '') });
        break;
      case 'transcript.assistant.delta':
        this.emit({ type: 'transcript.assistant.delta', text: String(event.text || '') });
        break;
      case 'transcript.assistant.done':
        this.emit({ type: 'transcript.assistant.done', text: String(event.text || '') });
        break;
      case 'tool.result':
        this.emit({ type: 'tool.result', name: String(event.name || ''), result: event.result });
        break;
      case 'hold_music_start':
        this.startHoldMusic();
        this.emit({ type: 'hold_music_start' });
        break;
      case 'hold_music_stop':
        this.stopHoldMusic();
        this.emit({ type: 'hold_music_stop' });
        break;
      case 'input_audio_buffer.speech_started':
        this.emit({ type: 'speech_started' });
        break;
      case 'input_audio_buffer.speech_stopped':
        this.emit({ type: 'speech_stopped' });
        break;
      case 'error':
        this.emit({ type: 'error', message: String(event.message || 'Error desconocido') });
        break;
      default:
        break;
    }
  }

  private enqueueAudio(b64: string) {
    if (!b64 || !this.audioCtxOut || this.playMuted) return;
    const raw = base64ToArrayBuffer(b64);
    const samples = new Int16Array(raw);
    const float = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) float[i] = samples[i] / 0x7fff;
    const buf = this.audioCtxOut.createBuffer(1, float.length, TARGET_SR);
    buf.getChannelData(0).set(float);
    const src = this.audioCtxOut.createBufferSource();
    src.buffer = buf;
    src.connect(this.audioCtxOut.destination);
    // Schedule sequentially so chunks play back-to-back without gaps
    const startAt = Math.max(this.audioCtxOut.currentTime, this.playQueueTimeSec);
    src.start(startAt);
    this.playQueueTimeSec = startAt + buf.duration;
  }

  // ------------------------------------------------------------ hold music
  private startHoldMusic() {
    if (this.holdMusic || !this.audioCtxOut) return;
    this.holdMusic = new HoldMusicSynth(this.audioCtxOut);
    this.holdMusic.start();
  }

  private stopHoldMusic() {
    if (!this.holdMusic) return;
    this.holdMusic.stop();
    this.holdMusic = null;
  }
}

// ---------------------------------------------------------------------------
// Audio utilities
// ---------------------------------------------------------------------------
function downsampleBuffer(buffer: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return buffer;
  const ratio = srcRate / dstRate;
  const newLen = Math.round(buffer.length / ratio);
  const out = new Float32Array(newLen);
  let pos = 0;
  let i = 0;
  while (pos < newLen) {
    const next = Math.round((pos + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (; i < next && i < buffer.length; i++) {
      sum += buffer[i];
      count++;
    }
    out[pos] = count ? sum / count : 0;
    pos++;
  }
  return out;
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = window.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ---------------------------------------------------------------------------
// Hold music synthesizer — gentle ambient chord progression
// ---------------------------------------------------------------------------
// We don't want to ship an MP3 file just for a hold-music cue, so synthesize
// a quiet, slow chord progression with the Web Audio API. It loops every
// ~12 seconds while the multi-agent pipeline is running.
class HoldMusicSynth {
  private gain: GainNode;
  private oscillators: OscillatorNode[] = [];
  private intervalHandle: number | null = null;
  private chordIdx = 0;
  private chords: number[][] = [
    [220, 277.18, 329.63], // A minor
    [196, 246.94, 293.66], // G major
    [174.61, 220, 261.63], // F major
    [261.63, 329.63, 392.0], // C major
  ];

  constructor(private ctx: AudioContext) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(ctx.destination);
  }

  start() {
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.gain.gain.linearRampToValueAtTime(0.06, this.ctx.currentTime + 0.4);
    this.playChord();
    // Switch chord every 3 seconds
    this.intervalHandle = window.setInterval(() => this.playChord(), 3000);
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(this.gain.gain.value, t);
    this.gain.gain.linearRampToValueAtTime(0, t + 0.4);
    setTimeout(() => {
      this.oscillators.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* ignore */
        }
      });
      this.oscillators = [];
    }, 500);
  }

  private playChord() {
    // Stop previous chord oscillators
    this.oscillators.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* */
      }
    });
    this.oscillators = [];
    const chord = this.chords[this.chordIdx % this.chords.length];
    this.chordIdx++;
    for (const freq of chord) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(this.gain);
      osc.start();
      this.oscillators.push(osc);
    }
  }
}
