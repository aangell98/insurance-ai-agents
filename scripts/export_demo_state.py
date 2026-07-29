"""Create a versioned, redacted export bundle from JSON application state.

This tool intentionally has no cloud SDK and never reads credentials. Export a
Cosmos query through an authorized operational process, then provide its JSON
file to this tool.
"""
from __future__ import annotations
import argparse, hashlib, json, re
from datetime import datetime, timezone
from pathlib import Path

SECRET_KEY_PARTS = {"authorization", "token", "secret", "password", "apikey", "connectionstring", "privatekey", "clientsecret", "accesskey", "sharedkey"}

def is_secret_key(key: str) -> bool:
    words = re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+", re.sub(r"[^A-Za-z0-9]", " ", key))
    tokens = [word.lower() for word in words]
    normalized = "".join(tokens)
    return bool(set(tokens) & {"key", "token", "secret", "password", "authorization"}) or any(part in normalized for part in SECRET_KEY_PARTS)

def redact(value):
    if isinstance(value, dict):
        return {key: "[REDACTED]" if is_secret_key(key) else redact(item) for key, item in value.items()}
    if isinstance(value, list): return [redact(item) for item in value]
    return value

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True, help="Authorized JSON export; no cloud access is performed.")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    payload = redact(json.loads(args.input.read_text(encoding="utf-8")))
    args.output.mkdir(parents=True, exist_ok=False)
    state = args.output / "application-state.json"
    state.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    manifest = {"format": "insurance-ai-agents-export", "version": 1, "created_at": datetime.now(timezone.utc).isoformat(), "redacted": True, "files": [{"path": state.name, "sha256": digest(state)}]}
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Created {args.output}; encrypt it before leaving approved storage.")

if __name__ == "__main__": main()
