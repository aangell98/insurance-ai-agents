"""Verify an export manifest before an operator imports it into an authorized store."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("bundle", type=Path); args = parser.parse_args()
    manifest = json.loads((args.bundle / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("format") != "insurance-ai-agents-export" or manifest.get("version") != 1: raise SystemExit("Unsupported export format")
    for item in manifest["files"]:
        actual = hashlib.sha256((args.bundle / item["path"]).read_bytes()).hexdigest()
        if actual != item["sha256"]: raise SystemExit(f"Checksum mismatch: {item['path']}")
    print("Manifest verified. Import application-state.json only with an authorized data-plane identity.")
if __name__ == "__main__": main()
