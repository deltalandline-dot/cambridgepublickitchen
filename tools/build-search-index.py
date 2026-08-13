#!/usr/bin/env python3
"""Rebuilds search-index.json and ingredients-index.json from the current
recipes/*.html files.

Run from the repo root: python3 tools/build-search-index.py

Ingredient extraction is a heuristic, not a parse of the original source:
it reads each recipe's HTML table row by row, tracks the most recent bold
section-marker row ("Equipment", "Ingredients", "Instructions", ...), and
only harvests two-cell rows seen *before* the first "Instructions" marker
and while the current section name contains "ingredient". That's needed
because "Ingredients" also gets reused as a step-grouping label inside
Instructions in some recipes (e.g. "Prepare / Ingredients / Locate all
ingredients") — once we've seen a real Instructions marker, we stop, so
those step fragments never get harvested as if they were ingredients.
"""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECIPES_DIR = ROOT / "recipes"
SEARCH_OUT = ROOT / "search-index.json"
INGREDIENTS_OUT = ROOT / "ingredients-index.json"

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
H1_RE = re.compile(r"<h1>(.*?)</h1>", re.DOTALL)
BODY_RE = re.compile(r"<body>(.*?)</body>", re.DOTALL)
ROW_RE = re.compile(r"<tr>(.*?)</tr>", re.DOTALL)
CELL_RE = re.compile(r"<td[^>]*>(.*?)</td>", re.DOTALL)


def clean(html):
    text = TAG_RE.sub(" ", html)
    text = (text.replace("&amp;", "&").replace("&quot;", '"')
            .replace("&#39;", "'").replace("&rsquo;", "'"))
    return WS_RE.sub(" ", text).strip()


# First word alone marks the whole cell as a note/instruction rather than an
# ingredient (e.g. "cover & store in fridge", "rinse herbs") - no real
# ingredient in this book starts with any of these.
NOTE_STARTS = {"note", "if", "taste", "cover", "store", "divide", "rinse", "adjust"}


def ingredient_term(cell_text):
    text = clean(cell_text)
    if text.lower().startswith("optional:"):
        text = text[len("optional:"):].strip()
    if not text:
        return None
    first_word = re.split(r"\W+", text.lower(), 1)[0]
    if first_word in NOTE_STARTS:
        return None
    cut = len(text)
    for sep in (",", "("):
        idx = text.find(sep)
        if idx != -1:
            cut = min(cut, idx)
    term = text[:cut].strip(" .;:\"'")
    if 2 <= len(term) <= 40:
        return term.lower()
    return None


def extract_ingredients(html):
    section = ""
    seen_instructions = False
    terms = []
    for row_match in ROW_RE.finditer(html):
        row_html = row_match.group(1)
        cells = CELL_RE.findall(row_html)
        if len(cells) == 1:
            if "<b>" in cells[0]:
                section = clean(cells[0]).lower()
                if "instruction" in section:
                    seen_instructions = True
            continue
        if len(cells) != 2 or seen_instructions or "ingredient" not in section:
            continue
        second = clean(cells[1])
        if not second:
            continue
        term = ingredient_term(cells[1])
        if term:
            terms.append(term)
    return terms


def build():
    entries = []
    counts = Counter()
    for path in sorted(RECIPES_DIR.glob("*.html")):
        html = path.read_text(encoding="utf-8")
        h1_match = H1_RE.search(html)
        title = clean(h1_match.group(1)) if h1_match else path.stem
        body_match = BODY_RE.search(html)
        body_html = body_match.group(1) if body_match else html
        entries.append({
            "title": title,
            "url": f"recipes/{path.name}",
            "text": clean(body_html).lower(),
        })
        counts.update(set(extract_ingredients(body_html)))

    SEARCH_OUT.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(entries)} recipes to {SEARCH_OUT.relative_to(ROOT)}")

    vocab = [term for term, _ in counts.most_common() if len(term) >= 3]
    INGREDIENTS_OUT.write_text(json.dumps(vocab, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(vocab)} ingredient terms to {INGREDIENTS_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
