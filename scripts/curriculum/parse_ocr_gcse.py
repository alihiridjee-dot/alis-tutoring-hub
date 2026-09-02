from __future__ import annotations
"""
OCR GCSE (9-1) Gateway Science Suite: Biology A (J247), Chemistry A (J248),
Physics A (J249).

Same shape as the OCR A-Level specs — an assessable statement on the left and
reference columns on the right — but printed landscape on a portrait page, and
five columns wide: `Learning outcomes`, `To include`, `Maths`, `Working
scientifically`, `Practical suggestions`. Only the first is assessable content;
the rest are teaching support and must not end up in a spec point.

Two things make this file different from parse_ocr.py:

* The pages are rotated. pypdf's layout mode refuses them outright ("Rotated
  text discovered. Output will be incomplete.") and returns a bare page number.
  `transfer_rotation_to_content()` bakes the /Rotate into the content stream
  first, after which layout extraction produces exactly the clean five-column
  grid the cut below relies on. Without that call there is nothing to parse.
* Layout mode welds the words of a heading together ("Cellstructures"), because
  the headings are set with kerned spacing rather than space glyphs. So
  headings are read from plain extraction, where the spacing survives as tabs,
  and only the statement grid is read from layout mode.

Structure: `B1.2 What happens in cells` subtopics, statements lettered a, b, c
within them, referenced by the board as `B1.2a`.
"""
import re
import pypdf
from extract import clean, BLEED

SUBTOPIC = re.compile(r"^\s*([BCP]\d+\.\d+)[\s\t]+(\D.*)$")
# A statement opens with its full code in the leftmost column, then the text.
# Continuation lines carry no code.
STATEMENT = re.compile(r"^\s*([BCP]\d+\.\d+)([a-z])\s+(\S.*)$")
# The overview spread prints every subtopic of a whole chapter on one line, so
# a title read from there runs into the next subtopic's. Cut it at that point.
NEXT_CODE = re.compile(r"\s[BCP]\d+\.\d+\s")

DROP = re.compile(
    r"^\s*(?:Version \d|©\s*(?:Cambridge )?OCR|Cambridge OCR Level|"
    r"Learning\s*outcomes|Topic content|To include|Maths|Practical\s*suggestions|"
    r"Working\s*scientifically|Opportunities\s*to\s*cover|Summary|Tiering|"
    r"Underlying\s*knowledge|Common\s*misconceptions|Reference|"
    r"Mathematical\s*learning\s*outcomes|Statements shown in bold|"
    r"Learners should|\d{1,3}\s*$)", re.I
)

# The Learning outcomes column is the leftmost of five and never runs past
# layout column ~58 on a content page; `To include` starts at ~58. Anchoring
# the search short of that and taking the first real gap keeps a wrapped
# statement intact while never reaching the neighbouring column.
# OCR marks tiering and "practical activity" rows with glyphs from a symbol
# font, which extract as a thorn or a private-use codepoint rather than as an
# icon. They are typography, not content, so they are stripped rather than
# left sitting at the front of a statement.
MARKER = re.compile("[\u00fe\uf000-\uf0ff]")
THIN_SPACE = re.compile("[\u2000-\u200a]")

GUTTER_ANCHOR = 48
MAX_STATEMENT = 1200

# The last statement of the last subtopic has nothing after it to close the
# run, so it swallowed the practical-skills appendix that follows. These end it
# explicitly; MAX_STATEMENT is only the backstop.
TAIL = re.compile(
    r"^\s*(?:\d[a-z]\.\s|Topic\s*[BCP]\d|Practical\s*skills|Compliance\s*with|"
    r"Appendix|Assessment\s*of|Summary\s*of\s*updates|www\.ocr\.org\.uk|"
    r"Mathematical\s*skills|Prior\s*knowledge)", re.I
)


def _plain_titles(path):
    """Subtopic code -> title, from plain extraction where spacing survives."""
    titles: dict[str, str] = {}
    reader = pypdf.PdfReader(path)
    for page in reader.pages:
        for line in (page.extract_text() or "").split("\n"):
            m = SUBTOPIC.match(line.replace("\t", " "))
            if not m:
                continue
            title = m.group(2)
            cut = NEXT_CODE.search(title)
            if cut:
                title = title[: cut.start()]
            title = clean(re.sub(r"\s+\d{1,3}$", "", title))
            if len(title) > 4 and len(title) > len(titles.get(m.group(1), "")):
                titles[m.group(1)] = title
    return titles


def _cut(line: str) -> str:
    line = line.rstrip()
    if len(line) <= GUTTER_ANCHOR:
        return line
    m = re.search(r"\s{3,}", line[GUTTER_ANCHOR:])
    return line[: GUTTER_ANCHOR + m.start()].rstrip() if m else line


def parse(path: str):
    titles = _plain_titles(path)
    reader = pypdf.PdfReader(path)

    topics: list = []
    by_code: dict[str, dict] = {}
    current = None
    code = None
    buf: list[str] = []

    def flush():
        nonlocal code, buf
        if current is not None and code and buf:
            title = clean(THIN_SPACE.sub(" ", MARKER.sub("", " ".join(buf))))
            if len(title) > 8:
                current["points"].append({"code": code, "title": title})
        code, buf = None, []

    for page in reader.pages:
        # Must happen before layout extraction; see the module docstring.
        page.transfer_rotation_to_content()
        for raw in page.extract_text(extraction_mode="layout").split("\n"):
            line = _cut(raw).replace("\t", " ")
            if not line.strip() or DROP.match(line):
                continue

            if TAIL.match(line) or TAIL.match(line.replace(" ", "")):
                flush()
                current = None
                continue

            m = STATEMENT.match(line)
            if m:
                sub = m.group(1)
                if sub not in titles:
                    continue
                flush()
                if sub not in by_code:
                    by_code[sub] = {"code": sub, "title": titles[sub], "points": []}
                    topics.append(by_code[sub])
                current = by_code[sub]
                code, buf = f"{sub}{m.group(2)}", [m.group(3)]
                continue

            # A bare subtopic code with no letter is the section heading; it
            # opens the section but carries no statement of its own.
            m = SUBTOPIC.match(line)
            if m and m.group(1) in titles and not STATEMENT.match(line):
                flush()
                continue

            if code and sum(len(x) for x in buf) < MAX_STATEMENT:
                buf.append(line)

    flush()
    return [t for t in topics if t["points"]]


def validate(name, topics):
    out = []
    seen = set()
    for t in topics:
        for p in t["points"]:
            if MARKER.search(p["title"]):
                out.append(f"{name} {p['code']}: marker glyph survived -> {p['title'][:60]}")
            if BLEED.search(p["title"]) or re.search(r"\b(?:PAG [BCP]\d|WS\d\.\d|M\d[a-z])\b", p["title"]):
                out.append(f"{name} {p['code']}: support-column bleed -> {p['title'][:70]}")
            if len(p["title"]) > 600:
                out.append(f"{name} {p['code']}: runaway title ({len(p['title'])} chars)")
            if len(p["title"]) < 12:
                out.append(f"{name} {p['code']}: short -> {p['title']!r}")
            if p["code"] in seen:
                out.append(f"{name} {p['code']}: duplicate")
            seen.add(p["code"])
    return out


if __name__ == "__main__":
    import sys
    ts = parse(sys.argv[1])
    print(f"{len(ts)} subtopics, {sum(len(t['points']) for t in ts)} points")
    for t in ts:
        print(f"  {t['code']:6s} {len(t['points']):3d}  {t['title'][:56]}")
    for x in validate("ocrg", ts):
        print("   !", x)
