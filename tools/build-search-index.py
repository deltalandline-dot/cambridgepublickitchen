#!/usr/bin/env python3
"""Rebuilds search-index.json from the current recipes/*.html files.

Run from the repo root: python3 tools/build-search-index.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECIPES_DIR = ROOT / "recipes"
OUT_PATH = ROOT / "search-index.json"

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
H1_RE = re.compile(r"<h1>(.*?)</h1>", re.DOTALL)
BODY_RE = re.compile(r"<body>(.*?)</body>", re.DOTALL)


def strip_tags(html):
    text = TAG_RE.sub(" ", html)
    text = text.replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'")
    return WS_RE.sub(" ", text).strip()


def build():
    entries = []
    for path in sorted(RECIPES_DIR.glob("*.html")):
        html = path.read_text(encoding="utf-8")
        h1_match = H1_RE.search(html)
        title = strip_tags(h1_match.group(1)) if h1_match else path.stem
        body_match = BODY_RE.search(html)
        text = strip_tags(body_match.group(1)) if body_match else strip_tags(html)
        entries.append({
            "title": title,
            "url": f"recipes/{path.name}",
            "text": text.lower(),
        })
    OUT_PATH.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(entries)} recipes to {OUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
