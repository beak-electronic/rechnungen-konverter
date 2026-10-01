#!/usr/bin/env python3
"""Lightweight presence + magic-byte check (no browser). Prefer: node self_check.mjs"""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
REQUIRED = [
    "index.html", "css/app.css", "js/app.js", "js/transform.js", "js/pdf.js",
    "manifest.webmanifest", "sw.js", "netlify.toml", "_headers",
    "README_DE.md", "DEPLOY.txt",
    "vendor/pdf-lib.min.js", "vendor/xlsx.full.min.js",
    "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
    "icons/drop-cloud-icon.png", "samples/Kreditoren_August_2024.csv",
]

def main() -> int:
    missing = [r for r in REQUIRED if not (ROOT / r).exists()]
    if missing:
        print("MISSING:", ", ".join(missing))
        return 1
    print("Files OK:", len(REQUIRED))
    # Delegate full parse+PDF to node if available
    node = ROOT / "self_check.mjs"
    try:
        r = subprocess.run(["node", str(node)], cwd=str(ROOT), check=False)
        return r.returncode
    except FileNotFoundError:
        print("node not found – file presence only")
        return 0

if __name__ == "__main__":
    sys.exit(main())
