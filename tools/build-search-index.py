#!/usr/bin/env python3
"""Rebuilds search-index.json and ingredients-index.json from the current
recipes/*.html files.

Run from the repo root: python3 tools/build-search-index.py

Ingredient extraction is a heuristic, not a parse of the original source: it
finds every <p> whose text starts with "ingredient" (case-insensitive, so
variant headings like "Ingredients — wet, dairy version" count too) and
reads the <li> items of the <ul> right after it. Each item's leading
quantity+unit ("4 lbs", "~⅓ cup", "1 ½") is stripped before the
comma/paren cut that isolates the ingredient name, since (unlike the old
table layout) quantity and ingredient now share one string. Rows containing
"·" are skipped entirely - that marks a manual per-batch-size breakdown
("4 pans: 2 ½ c · 3 pans: ...") that isn't a single scalable
quantity and would otherwise poison the vocabulary with junk like "4 pans".
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
INGREDIENT_SECTION_RE = re.compile(
    r"<p>\s*ingredient[^<]*</p>\s*<ul>(.*?)</ul>", re.DOTALL | re.IGNORECASE)
ITEM_RE = re.compile(r"<li>(.*?)</li>", re.DOTALL)

FRACTION_CHARS = "¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞"
# Order matters: longer/more-specific patterns must be tried before shorter
# ones that would otherwise match a prefix of them and leave a dangling
# "-5" or "/2" behind (e.g. "4-5 lemons", "1/2 cup").
QTY_PATTERNS = [
    re.compile(r"^~?\s*\d+(?:\.\d+)?\s*[-–—]\s*\d+(?:\.\d+)?"),  # range: 4-5, 6–10
    re.compile(r"^~?\s*\d+\s+\d+/\d+"),                       # mixed ascii: 1 1/2
    re.compile(r"^~?\s*\d+/\d+"),                             # ascii fraction: 1/2
    re.compile(r"^~?\s*\d+\s*[" + FRACTION_CHARS + "]"),      # mixed unicode: 1 ½
    re.compile(r"^~?\s*\d+(?:\.\d+)?"),                       # plain int/decimal
    re.compile(r"^~?\s*[" + FRACTION_CHARS + "]"),            # bare unicode fraction
]

UNITS = {
    "t", "tsp", "tsps", "teaspoon", "teaspoons",
    "T", "tbsp", "tbsps", "tbls", "tablespoon", "tablespoons",
    "c", "cup", "cups", "lb", "lbs", "pound", "pounds",
    "oz", "ounce", "ounces", "qt", "qts", "quart", "quarts",
    "pt", "pts", "pint", "pints", "g", "gram", "grams", "kg",
    "ml", "l", "liter", "liters", "head", "heads", "bunch", "bunches",
    "stalk", "stalks", "clove", "cloves", "can", "cans", "case", "cases",
    "package", "packages", "pinch", "pinches", "dash", "dashes",
}

# First word alone marks the whole item as a note/instruction rather than an
# ingredient (e.g. "cover & store in fridge", "rinse herbs") - no real
# ingredient in this book starts with any of these.
NOTE_STARTS = {"note", "if", "taste", "cover", "store", "divide", "rinse", "adjust"}


def clean(html):
    text = TAG_RE.sub(" ", html)
    text = (text.replace("&amp;", "&").replace("&quot;", '"')
            .replace("&#39;", "'").replace("&rsquo;", "'")
            .replace("&lt;", "<").replace("&gt;", ">"))
    return WS_RE.sub(" ", text).strip()


def strip_leading_quantity(text):
    """Strips one or more leading quantity+unit segments, including
    "+"-joined additions ("5 Tbsp + 2 tsp cumin" -> "cumin")."""
    text = text.strip()
    first = True
    while True:
        candidate = text[1:].strip() if not first and text.startswith("+") else text
        matched = None
        for pattern in QTY_PATTERNS:
            m = pattern.match(candidate)
            if m:
                matched = m
                break
        if not matched:
            return text
        rest = candidate[matched.end():].strip()
        parts = rest.split(None, 1)
        if parts and parts[0].strip(".").lower() in UNITS:
            rest = parts[1] if len(parts) > 1 else ""
        text = rest.strip()
        first = False


def ingredient_term(item_text):
    text = clean(item_text)
    if "·" in text:
        return None
    text = strip_leading_quantity(text)
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
    terms = []
    for section_match in INGREDIENT_SECTION_RE.finditer(html):
        for item_match in ITEM_RE.finditer(section_match.group(1)):
            term = ingredient_term(item_match.group(1))
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
        counts.update(list(dict.fromkeys(extract_ingredients(body_html))))

    SEARCH_OUT.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(entries)} recipes to {SEARCH_OUT.relative_to(ROOT)}")

    vocab = [term for term, _ in counts.most_common() if len(term) >= 3]
    INGREDIENTS_OUT.write_text(json.dumps(vocab, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(vocab)} ingredient terms to {INGREDIENTS_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
