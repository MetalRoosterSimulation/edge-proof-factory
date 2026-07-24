#!/usr/bin/env bash
# render-ra-pdfs.sh — produce print-grade PDF copies of the reference
# architectures in docs/reference-architectures/. Reproducible: markdown ->
# HTML (marked, GFM) -> headless Chrome print-to-PDF. Mermaid diagrams render
# via mermaid.js during the print (needs network for the CDN fetch).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=docs/reference-architectures
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

render() {
  local md="$1" title="$2" pdf="$3"
  npx -y marked --gfm -i "$md" -o "$TMP/body.html"
  cat > "$TMP/doc.html" <<HTML
<!doctype html><html><head><meta charset="utf-8"><title>$title</title>
<style>
  @page { size: A4; margin: 22mm 18mm; }
  html { -webkit-print-color-adjust: exact; }
  body { font: 10.5pt/1.55 "Helvetica Neue", Arial, sans-serif; color:#1a1d21; max-width: 100%; }
  h1 { font: 600 19pt/1.25 Georgia, "Times New Roman", serif; margin: 0 0 4pt;
       padding-bottom: 8pt; border-bottom: 2.5pt solid #0c322c; }
  h2 { font: 600 13.5pt/1.3 Georgia, serif; color:#0c322c; margin: 18pt 0 6pt;
       padding-top: 6pt; border-top: 0.6pt solid #c9ced4; page-break-after: avoid; }
  h3 { font: 600 11pt/1.3 "Helvetica Neue", Arial, sans-serif; margin: 12pt 0 4pt; page-break-after: avoid; }
  p { margin: 5pt 0; }
  strong { color:#0c322c; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 8.8pt; page-break-inside: auto; }
  th { background:#0c322c; color:#fff; text-align:left; padding: 4pt 6pt; font-weight:600; }
  td { border-bottom: 0.5pt solid #d7dbe0; padding: 4pt 6pt; vertical-align: top; }
  tr { page-break-inside: avoid; }
  code { font: 8.6pt "Courier New", monospace; background:#f2f4f6; padding: 0 3pt; }
  pre { background:#f2f4f6; border: 0.5pt solid #d7dbe0; padding: 8pt;
        font: 8.4pt/1.45 "Courier New", monospace; white-space: pre-wrap; page-break-inside: avoid; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 8pt 0; padding: 4pt 10pt; border-left: 3pt solid #0c322c;
               background:#f6f7f8; color:#3a3f46; }
  hr { border: none; border-top: 0.6pt solid #c9ced4; margin: 14pt 0; }
  a { color:#0c322c; text-decoration: none; }
  .mermaid { display:flex; justify-content:center; margin: 10pt 0; page-break-inside: avoid; }
  .mermaid svg { max-width: 100%; height: auto; }
</style></head><body>
$(cat "$TMP/body.html")
<script type="module">
  for (const block of document.querySelectorAll("pre code.language-mermaid")) {
    const div = document.createElement("div");
    div.className = "mermaid";
    div.textContent = block.textContent;
    block.closest("pre").replaceWith(div);
  }
  const m = await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
  m.default.initialize({ startOnLoad: false, theme: "neutral" });
  await m.default.run();
</script></body></html>
HTML
  google-chrome --headless=new --disable-gpu --no-sandbox \
    --virtual-time-budget=15000 --no-pdf-header-footer \
    --print-to-pdf="$pdf" "file://$TMP/doc.html" 2>/dev/null
  echo "wrote $pdf ($(du -h "$pdf" | cut -f1))"
}

render "$OUT/RA-01-on-prem.md"    "RA-01 On-Premises Reference Architecture"  "$OUT/RA-01-on-prem.pdf"
render "$OUT/RA-02-hybrid-aws.md" "RA-02 Hybrid AWS Reference Architecture"   "$OUT/RA-02-hybrid-aws.pdf"
