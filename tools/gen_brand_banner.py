"""Generate brand-banner.svg: Microsoft logo × Santander logo + text that works on light & dark backgrounds."""
from __future__ import annotations

import base64
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SAN_PNG = ROOT / "images" / "SAN.png"
OUT = ROOT / "images" / "brand-banner.svg"

san_b64 = base64.b64encode(SAN_PNG.read_bytes()).decode("ascii")

# Banner uses neutral mid-tone colors that work on both light and dark GitHub README backgrounds.
SVG = f"""<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 720 120\" width=\"720\" height=\"120\" role=\"img\" aria-label=\"Microsoft × Santander\">
  <title>Microsoft × Santander</title>

  <!-- Microsoft 4-square logo (vibrant colors visible on any background) -->
  <g transform=\"translate(40, 30)\">
    <rect x=\"0\"  y=\"0\"  width=\"28\" height=\"28\" fill=\"#F25022\"/>
    <rect x=\"32\" y=\"0\"  width=\"28\" height=\"28\" fill=\"#7FBA00\"/>
    <rect x=\"0\"  y=\"32\" width=\"28\" height=\"28\" fill=\"#00A4EF\"/>
    <rect x=\"32\" y=\"32\" width=\"28\" height=\"28\" fill=\"#FFB900\"/>
  </g>

  <!-- Microsoft text (mid-gray, readable on both light and dark bg) -->
  <text x=\"148\" y=\"70\" font-family=\"'Segoe UI', system-ui, sans-serif\" font-size=\"34\" font-weight=\"600\" fill=\"#737373\">Microsoft</text>

  <!-- Separator -->
  <text x=\"332\" y=\"76\" font-family=\"'Segoe UI', system-ui, sans-serif\" font-size=\"42\" font-weight=\"200\" fill=\"#A0A0A0\">×</text>

  <!-- Santander SAN flame (red on transparent — visible on any bg) -->
  <image href=\"data:image/png;base64,{san_b64}\" x=\"380\" y=\"22\" width=\"76\" height=\"76\" preserveAspectRatio=\"xMidYMid meet\"/>

  <!-- Santander text (red — Santander brand color, distinctive on any bg) -->
  <text x=\"470\" y=\"70\" font-family=\"'Segoe UI', system-ui, sans-serif\" font-size=\"34\" font-weight=\"600\" fill=\"#EC0000\">Santander</text>
</svg>
"""

OUT.write_text(SVG, encoding="utf-8")
print(f"Wrote {OUT.relative_to(ROOT)} - {len(SVG):,} chars")
