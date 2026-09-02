from __future__ import annotations
"""
OCR A-Level Biology A (H420) and Chemistry A (H432).

Genuinely two-column: the assessable "Learning outcomes" on the left, an
"Additional guidance" column on the right carrying prose plus M / PAG / HSW
cross-reference codes. Plain extraction interleaves them, so a statement comes
out with guidance welded into the middle of it. Here we extract in layout mode
and cut every line at a gutter measured from the page itself.

Structure: `N.N.N Section title` headings, then statements lettered `(a)`,
`(b)` with occasional `(i)/(ii)` sub-items that belong to their parent.
Spec point code is `N.N.N(a)`, which is how OCR references them.
"""
import re
from extract import page_layout_lines, clean, BLEED
import pypdf

# Section headings lose their spaces in layout mode ("3.1.2Transportinanimals"),
# so they are read from plain-mode text where the tabs survive.
SECTION_PLAIN = re.compile(r"^\s*(\d+\.\d+\.\d+)[\s\t]+(.+?)\s*$")
SECTION_LAYOUT = re.compile(r"^\s*(\d+\.\d+\.\d+)\s*(.*)$")
# Whitespace inside the parentheses is tolerated: the Chemistry PDF renders
# item (j) of 2.2.2 as "( j)", which an exact "\(([a-z])\)" missed — the item
# was then swallowed into (i) along with everything that followed it.
ITEM = re.compile(r"^\s*\(\s*([a-z])\s*\)\s*(.*)$")
MODULE = re.compile(r"^\s*Module\s+(\d+)\s*[:–-]\s*(.+?)\s*$")
ALPHA = "abcdefghijklmnopqrstuvwxyz"
MAX_STATEMENT = 2600

# 6.3.2 is the last content section in both OCR specs, so nothing downstream
# closes it and it ran on into the appendices — 32,000 characters into a single
# spec point. These end the run explicitly; MAX_STATEMENT is the backstop.
TAIL = re.compile(
    r"^\s*(?:Practical\s*Endorsement|NEA\s*Centre|Summary\s*of\s*updates|"
    r"Appendix|Section\s*5[a-f]|www\.ocr\.org\.uk|"
    r"Mathematical\s*(?:skills|requirements)|"
    # OCR's own non-content section headings ("2d. Prior knowledge…", "5c. …").
    r"\d[a-z]\.\s|"
    r"Prior\s*knowledge|Priorknowledge|"
    r"This\s*component\s*assesses|Component\s*0\d|Learners\s*answer\s*all)", re.I
)

DROP = re.compile(
    r"^\s*(?:Version \d|©\s*OCR|A Level in (?:Biology|Chemistry)|"
    r"Learning\s*outcomes|Additional\s*guidance|"
    r"Learners should be able to demonstrate|apply their knowledge|"
    r"M\d[\d.,\s]*$|HSW[\d,\s]*$|PA\s*G?\s*\d|\d{1,3}\s*$)", re.I
)


def _plain_sections(path):
    """Section number -> title, taken from plain extraction where spacing survives."""
    titles = {}
    reader = pypdf.PdfReader(path)
    for page in reader.pages:
        for line in (page.extract_text() or "").split("\n"):
            m = SECTION_PLAIN.match(line.replace("\t", " "))
            if m:
                title = clean(m.group(2))
                # Contents pages give the same number with a page number glued
                # on; prefer the longest, most complete rendering seen.
                if title and len(title) > len(titles.get(m.group(1), "")):
                    titles[m.group(1)] = title
    return titles


def parse(path: str):
    titles = _plain_sections(path)
    reader = pypdf.PdfReader(path)

    sections: list = []
    by_num = {}
    current = None
    code = None
    buf: list = []

    def flush():
        nonlocal code, buf
        if current is not None and code and buf:
            title = clean(" ".join(buf))
            if title and len(title) > 8:
                current["points"].append({"code": code, "title": title})
        code, buf = None, []

    for page in reader.pages:
        for raw in page_layout_lines(page):
            line = cut_guidance(raw)
            if not line.strip() or DROP.match(line):
                continue
            if TAIL.match(line.replace("\t", " ")):
                flush()
                current = None
                continue

            m = SECTION_LAYOUT.match(line.replace("\t", " "))
            if m and m.group(1) in titles:
                num = m.group(1)
                flush()
                # A section number is seen more than once — on the contents
                # page, and again where the content actually starts. Re-opening
                # the same section rather than skipping repeats is what stops
                # the contents listing from swallowing a section outright.
                if num in by_num:
                    current = by_num[num]
                else:
                    current = {"code": num, "title": titles[num], "points": [], "next": 0}
                    by_num[num] = current
                    sections.append(current)
                continue

            if current is None:
                continue

            m = ITEM.match(line.replace("\t", " "))
            if m:
                letter = m.group(1)
                # Strictly the next letter in sequence, never merely a later
                # one. OCR nests roman sub-items - (i), (ii), (v) - inside a
                # statement, and "(i)" is indistinguishable from an item letter
                # on its own. Requiring a→b→c order makes "(i)" after "(a)"
                # fall through as continuation text, which is what it is; an
                # earlier "must advance" rule instead accepted it and then
                # rejected every genuine item from (b) to (h) that followed.
                if letter == ALPHA[current["next"]]:
                    flush()
                    code, buf = f"{num_of(current)}({letter})", [m.group(2)]
                    current["next"] += 1
                    continue

            if code and sum(len(x) for x in buf) < MAX_STATEMENT:
                buf.append(line.replace("\t", " "))

    flush()
    for sec in sections:
        sec.pop("next", None)
    return [s for s in sections if s["points"]]


# Measured across both OCR specs: the guidance column starts at layout column
# ~84 (median), never before ~75 on a content page. So the cut is the first run
# of blank space at or after this anchor — adaptive per line, which handles the
# left column wrapping at different widths, but anchored so that an ordinary
# gap between words can never be mistaken for the gutter.
GUTTER_ANCHOR = 58


def cut_guidance(raw: str) -> str:
    """Keep only the Learning outcomes column of a two-column row."""
    line = raw.rstrip()
    if len(line) <= GUTTER_ANCHOR:
        return line
    m = re.search(r"\s{3,}", line[GUTTER_ANCHOR:])
    return line[: GUTTER_ANCHOR + m.start()].rstrip() if m else line


def num_of(section):
    return section["code"]


def validate(name, sections):
    out = []
    for s in sections:
        seen = set()
        for p in s["points"]:
            if BLEED.search(p["title"]):
                out.append(f"{name} {p['code']}: guidance bleed -> {p['title'][:60]}")
            if len(p["title"]) > 1500:
                out.append(f"{name} {p['code']}: runaway title ({len(p['title'])} chars)")
            if len(p["title"]) < 12:
                out.append(f"{name} {p['code']}: short -> {p['title']!r}")
            if p["code"] in seen:
                out.append(f"{name} {p['code']}: duplicate")
            seen.add(p["code"])
    return out


if __name__ == "__main__":
    import sys
    ss = parse(sys.argv[1])
    print(f"{len(ss)} sections, {sum(len(s['points']) for s in ss)} points")
    for s in ss[:12]:
        print(f"  {s['code']:8s} {len(s['points']):3d}  {s['title'][:46]}")
    for x in validate("ocr", ss)[:8]:
        print("   !", x)
