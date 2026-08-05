#!/usr/bin/env python3
"""md2pdf.py — render a factory Markdown doc (e.g. a kit's
browser-demo-walkthrough.md) to its distribution PDF.

Usage: python3 tools/md2pdf.py <in.md> <out.pdf>

Plain python3 (3.6+), stdlib only; the PDF is printed by headless
Chrome/Chromium. The Markdown file is the source of truth — never edit a
generated PDF; edit the md and re-render.

Markdown subset: #/##/### headings, bullet (- ) and numbered (N. ) lists,
fenced code blocks, **bold**, `code`, blank-line paragraphs. Soft-wrapped
lines inside a paragraph or list item are unwrapped before rendering so
the PDF reads as flowing prose.
"""

import html
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

CSS = """
@page { size: letter; margin: 18mm; }
body { font-family: sans-serif; color: #0C322C; font-size: 11px;
       line-height: 1.45; max-width: 175mm; }
h1 { font-size: 20px; border-bottom: 3px solid #30BA78; padding-bottom: 6px; }
h2 { font-size: 15px; margin-top: 22px; }
h3 { font-size: 12px; margin-top: 14px; }
ul, ol { padding-left: 18px; }
li { margin-bottom: 4px; }
code { font-family: monospace; background: #EFEFEF; padding: 1px 4px;
       border-radius: 3px; font-size: 10px; }
pre { background: #0C322C; color: #90EBCD; padding: 12px; border-radius: 6px;
      white-space: pre-wrap; font-size: 10px; line-height: 1.4; }
pre code { background: none; color: inherit; padding: 0; }
"""


def unwrap(text):
    """Join soft-wrapped lines inside paragraphs and list items."""
    out_blocks = []
    for block in text.split("\n\n"):
        lines = block.split("\n")
        if not lines or lines[0].lstrip().startswith("#") \
                or block.strip().startswith("```"):
            out_blocks.append(block)
            continue
        items = []
        for ln in lines:
            if re.match(r"^\s*([-*]\s|\d+\.\s)", ln) or not items:
                items.append(ln.rstrip())
            else:
                items[-1] = items[-1] + " " + ln.strip()
        out_blocks.append("\n".join(items))
    return "\n\n".join(out_blocks)


def inline(s):
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    return s


def md_to_html(md):
    out, in_ul, in_code, code_buf = [], False, False, []
    for line in md.splitlines():
        if line.strip().startswith("```"):
            if in_code:
                out.append("<pre><code>%s</code></pre>"
                           % html.escape("\n".join(code_buf)))
                code_buf, in_code = [], False
            else:
                if in_ul:
                    out.append("</ul>")
                    in_ul = False
                in_code = True
            continue
        if in_code:
            code_buf.append(line)
            continue
        stripped = line.strip()
        if stripped.startswith("- "):
            if not in_ul:
                out.append("<ul>")
                in_ul = True
            out.append("<li>%s</li>" % inline(stripped[2:]))
            continue
        if in_ul:
            out.append("</ul>")
            in_ul = False
        m = re.match(r"^(#{1,3})\s+(.*)$", stripped)
        if m:
            level = len(m.group(1))
            out.append("<h%d>%s</h%d>" % (level, inline(m.group(2)), level))
        elif stripped:
            out.append("<p>%s</p>" % inline(stripped))
    if in_ul:
        out.append("</ul>")
    if in_code:
        out.append("<pre><code>%s</code></pre>"
                   % html.escape("\n".join(code_buf)))
    return "\n".join(out)


def main():
    if len(sys.argv) != 3:
        print("usage: md2pdf.py <in.md> <out.pdf>", file=sys.stderr)
        sys.exit(2)
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    body = md_to_html(unwrap(src.read_text()))
    page = ("<!doctype html><html><head><meta charset='utf-8'>"
            "<style>%s</style></head><body>%s</body></html>") % (CSS, body)
    chrome = (shutil.which("google-chrome")
              or shutil.which("google-chrome-stable")
              or shutil.which("chromium"))
    if not chrome:
        print("no Chrome/Chromium binary found", file=sys.stderr)
        sys.exit(1)
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(page)
        tmp = f.name
    subprocess.run(
        [chrome, "--headless", "--disable-gpu", "--no-pdf-header-footer",
         "--print-to-pdf=%s" % dst, "file://%s" % tmp],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    Path(tmp).unlink()
    print("wrote %s" % dst)


if __name__ == "__main__":
    main()
