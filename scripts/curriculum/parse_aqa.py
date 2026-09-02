from __future__ import annotations
"""
AQA GCSE (8461/8462/8463) and A-Level (7402/7405/7408) sciences.

AQA is structured differently from the other two boards, and that changes what
a spec point is here.

Edexcel and OCR print a numbered, individually-referenced statement per
assessable outcome ("2.5", "3.1.2(a)"), so a spec point is that statement.
AQA does not. Its finest *numbered* unit is the subsection heading — 3.3.2 Gas
exchange, 4.1.1.5 Microscopy — under which the content runs as unnumbered
prose and bullets. AQA itself references content by that heading number, and so
do its examiner reports and teacher resources.

So a spec point is the numbered leaf subsection, with AQA's own code and AQA's
own heading. Nothing is invented, which is the rule this whole folder runs on:
splitting the prose into per-paragraph "points" would mean minting codes AQA
does not publish, and a student's confidence rating would then be keyed to a
reference their exam board has never heard of. The trade is granularity — AQA
lands around 65-95 points per specification where OCR A-Level Biology has 244.

Only headings are read, never the body. That is a robustness win as well as a
correctness one: AQA's two-column layout interleaves the "Key opportunities for
skills development" column into the content column in reading order, with no
gutter that survives extraction (layout mode fails outright on these files —
they carry rotated text). Headings sit outside that table, so none of it
matters.
"""
import re
import pypdf
from extract import clean

# "4.1.1.5  Microscopy" / "3.3.2 Gas exchange". The leading number is the
# board's own reference; depth varies (GCSE goes four deep, A-level three).
HEADING = re.compile(r"^\s*([34](?:\.\d+){1,3})\s+(\S.*?)\s*$")

# A contents-page line is the same heading with the page number glued on the
# end. Real headings never end in a bare number.
TRAILING_PAGE = re.compile(r"\s+\d{1,3}$")

# AQA's running footer repeats the qualification and version on every page and
# would otherwise be picked up as a heading continuation.
FOOTER = re.compile(
    r"(?:Visit\s+aqa\.org\.uk|for the most up-to-date specification|"
    r"AQA (?:AS and )?A-level|GCSE (?:Biology|Chemistry|Physics|Combined)|"
    r"For exams \d{4}|Version \d)", re.I
)

# Ligature and glyph-name debris pypdf leaves in AQA's text layer.
GLYPH = re.compile(r"/uni[0-9A-F]{4}|/f_?[a-z]{1,3}\b")


def _headings(path):
    """
    code -> title, preferring the occurrence on the page where the section
    actually starts over the one in the contents listing.

    Both render the same code. The contents entry carries a trailing page
    number and frequently wraps mid-title ("Organisms exchange substances with
    their"), so it loses to any later, page-number-free rendering of the same
    code.
    """
    best: dict[str, tuple[int, str]] = {}
    reader = pypdf.PdfReader(path)
    for pi, page in enumerate(reader.pages):
        lines = (page.extract_text() or "").split("\n")
        for li, line in enumerate(lines):
            m = HEADING.match(line.replace("\t", " "))
            if not m:
                continue
            code, title = m.group(1), m.group(2)
            # A long heading wraps, and the wrapped remainder is a line of its
            # own: "Organisms exchange substances with their" / "environment".
            # Body text under a heading always opens on a capital ("Content",
            # "Students should be able to"), so a following line that starts
            # lowercase can only be the rest of the title.
            for nxt in lines[li + 1: li + 3]:
                nxt = nxt.strip()
                if not nxt or not nxt[0].islower() or FOOTER.search(nxt):
                    break
                title = f"{title} {nxt}"
            if FOOTER.search(title):
                continue
            from_contents = bool(TRAILING_PAGE.search(title))
            title = clean(GLYPH.sub("", TRAILING_PAGE.sub("", title)))
            if not title or len(title) < 3 or title[0].isdigit():
                continue
            # rank: a real heading (0) always beats a contents entry (1);
            # among equals the longer, less truncated rendering wins.
            rank = (0 if not from_contents else 1, -len(title), pi)
            if code not in best or rank < best[code][0]:
                best[code] = (rank, title)
    return {k: v[1] for k, v in best.items()}


def parse(path: str):
    """
    -> [{code, title, points: [{code, title}]}], one entry per top-level
    section (3.1, 4.2 …), its points being that section's numbered leaves.
    """
    heads = _headings(path)

    def parts(c):
        return [int(x) for x in c.split(".")]

    codes = sorted(heads, key=parts)
    # A code with any descendant is a container, not a point: 3.1.4 Proteins
    # holds 3.1.4.1 and 3.1.4.2, and rating both the parent and its children
    # would double-count the same content on the confidence board.
    has_child = {c for c in codes for d in codes if d != c and d.startswith(c + ".")}

    topics = []
    by_code = {}
    for c in codes:
        if len(parts(c)) != 2:
            continue
        t = {"code": c, "title": heads[c], "points": []}
        by_code[c] = t
        topics.append(t)

    for c in codes:
        p = parts(c)
        if len(p) < 3 or c in has_child:
            continue
        top = f"{p[0]}.{p[1]}"
        if top in by_code:
            by_code[top]["points"].append({"code": c, "title": heads[c]})

    return [t for t in topics if t["points"]]


def validate(name, topics):
    out = []
    seen = set()
    for t in topics:
        if len(t["title"]) < 5:
            out.append(f"{name} {t['code']}: short topic title -> {t['title']!r}")
        for p in t["points"]:
            if len(p["title"]) < 3:
                out.append(f"{name} {p['code']}: short -> {p['title']!r}")
            if len(p["title"]) > 200:
                out.append(f"{name} {p['code']}: runaway title ({len(p['title'])} chars)")
            if FOOTER.search(p["title"]) or "/uni" in p["title"]:
                out.append(f"{name} {p['code']}: extraction debris -> {p['title'][:60]}")
            if p["code"] in seen:
                out.append(f"{name} {p['code']}: duplicate")
            seen.add(p["code"])
    return out


if __name__ == "__main__":
    import sys
    ts = parse(sys.argv[1])
    print(f"{len(ts)} topics, {sum(len(t['points']) for t in ts)} points")
    for t in ts:
        print(f"  {t['code']:6s} {len(t['points']):3d}  {t['title'][:60]}")
        for p in t["points"][:3]:
            print(f"        {p['code']:10s} {p['title'][:60]}")
    for x in validate("aqa", ts):
        print("   !", x)
