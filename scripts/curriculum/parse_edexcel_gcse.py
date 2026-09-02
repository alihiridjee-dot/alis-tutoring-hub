from __future__ import annotations
"""
Pearson Edexcel GCSE (9-1) separate sciences: 1BI0, 1CH0, 1PH0.

Layout: `Topic N - Title`, then statements numbered `N.M`, wrapping over several
lines, with a maths-skills column on the right.

Column splitting is deliberately NOT used here. Edexcel's skills column is
narrow enough that geometric gutter detection cuts inside the statement text
instead of beside it — it was truncating points mid-word. In plain extraction
order those codes land on lines of their own ("1d", "2a, 2h"), so filtering
whole lines that are nothing but codes removes the column exactly and loses
nothing. OCR's much wider guidance column does need the geometric split.
"""
import re
from extract import doc_lines, clean, BLEED

TOPIC = re.compile(r"^\s*Topic\s+(\d+)\s*[–-]\s*(.+?)\s*$")
# The trailing letter matters: Edexcel suffixes B/C/P on every statement that is
# separate-science-only (i.e. not in Combined Science). Requiring a space after
# the number silently dropped 210 of those across the three specs, including two
# whole topics per subject.
POINT = re.compile(r"^\s*(\d+\.\d+[A-Z]?)\s+(.*)$")
# Right-column maths codes that can still land in the left column on narrow rows.
SKILL_ONLY = re.compile(r"^\s*(?:\d[a-z](?:\s*,\s*\d[a-z])*\s*,?\s*)+$")
FOOTER = re.compile(
    r"^\s*(?:Specification\s*[–-]\s*Issue|Pearson Edexcel Level|©|\d{1,3}\s*$)", re.I
)
# Paper headings sit between topics and must not be swallowed into a statement.
# Headings and per-topic footers. Without these the "Use of mathematics" and
# "Suggested practicals" blocks printed after each topic get appended to that
# topic's LAST statement, quietly corrupting one point per topic.
NOISE = re.compile(
    r"^\s*(?:Students should:?|Maths skills|Topics? (?:common|only)|Paper \d|"
    r"Overview of content|Assessment information|Use of mathematics|"
    r"Suggested practicals?|Working scientifically|Core practicals?|"
    r"Mathematics|Practical skills)\b", re.I
)
# Bulleted lines only ever appear in those footers, never inside a statement.
BULLET = re.compile(r"^\s*[●•\uf0b7]")

# Equations are drawn as positioned glyphs, so text extraction returns them as
# single letters and word-salad ("coilprimaryinturnsofnumber", "N", "V", "=").
# These lines are dropped: they carry no meaning once the layout is gone, and
# leaving them in makes a statement look corrupted. The equation itself is lost
# either way — see EQUATION_HINT, which flags the affected points.
GLYPH_NOISE = re.compile(r"^\s*(?:\S{16,}|.{1,2}|[\W\d]+)\s*$")
EQUATION_HINT = re.compile(r"(?:equation|formula)", re.I)
MAX_STATEMENT = 2600

# Where the assessable content stops and the administrative sections begin.
STOP = re.compile(r"^\s*(?:Paper \d \(Paper code|Assessment Objectives|Appendix \d)", re.I)


def content_range(path):
    """
    First page carrying a topic heading, to the page where assessment info starts.

    Detected rather than hardcoded: the same three specs differ by a few pages,
    and the appendices repeat every core-practical code, so parsing past the end
    produces duplicate spec points rather than an obvious error.
    """
    from extract import doc_lines
    start = None
    for i, line in doc_lines(path, 0, None, split_columns=False, layout=False):
        if start is None and TOPIC.match(line):
            start = i
        elif start is not None and i > start and STOP.match(line):
            return start, i
    return (start or 0), None


def parse(path: str, first_page: int, last_page: int):
    topics = []
    current = None
    point_code = None
    buf = []

    def rank(code):
        """(major, minor) for ordering; the B/C/P suffix is not part of it."""
        major, minor = code.rstrip("ABCP").split(".")
        return int(major), int(minor)

    def flush():
        nonlocal point_code, buf
        if current is not None and point_code and buf:
            title = clean(" ".join(buf))
            if title:
                current["points"].append({"code": point_code, "title": title})
        point_code, buf = None, []

    for _, raw in doc_lines(path, first_page, last_page, split_columns=False, layout=False):
        line = raw.rstrip()
        if not line.strip() or FOOTER.match(line) or SKILL_ONLY.match(line):
            continue
        if BULLET.match(line):
            flush()
            continue
        if " " not in line.strip() and GLYPH_NOISE.match(line):
            continue

        m = TOPIC.match(line)
        if m:
            flush()
            current = {"number": int(m.group(1)), "title": clean(m.group(2)), "points": []}
            topics.append(current)
            continue

        if NOISE.match(line):
            flush()
            continue

        m = POINT.match(line)
        if m:
            # A statement's number must belong to the topic it sits under;
            # anything else is a cross-reference bleeding in from elsewhere.
            # A statement's number must belong to its topic AND advance. Specs
            # cross-reference other points mid-sentence ("...using the equations
            # in 10.29, 10.31, 13.7P and 13.10"), and a wrapped line starting
            # with such a reference is otherwise read as a new statement.
            code = m.group(1)
            if (
                current
                and code.rstrip("ABCP").split(".")[0] == str(current["number"])
                and (not current["points"] or rank(code) > rank(current["points"][-1]["code"]))
            ):
                flush()
                point_code, buf = code, [m.group(2)]
                continue
            if point_code:
                buf.append(line)
            continue

        if point_code and sum(len(x) for x in buf) < MAX_STATEMENT:
            buf.append(line)

    flush()
    return [t for t in topics if t["points"]]


def validate(name: str, topics: list[dict]) -> list[str]:
    problems = []
    for t in topics:
        seen = set()
        for p in t["points"]:
            if BLEED.search(p["title"]):
                problems.append(f"{name} {p['code']}: guidance-column bleed -> {p['title'][:70]}")
            if EQUATION_HINT.search(p["title"]) and p["title"].rstrip().endswith(":"):
                problems.append(f"{name} {p['code']}: equation lost in extraction")
            if len(p["title"]) > 1500:
                problems.append(f"{name} {p['code']}: runaway title ({len(p['title'])} chars)")
            if len(p["title"]) < 12:
                problems.append(f"{name} {p['code']}: suspiciously short -> {p['title']!r}")
            if p["code"] in seen:
                problems.append(f"{name} {p['code']}: duplicate code")
            seen.add(p["code"])
    return problems


if __name__ == "__main__":
    import sys, json
    path = sys.argv[1]
    first, last = content_range(path)
    print(f"content pages {first}..{last}")
    topics = parse(path, first, last)
    print(json.dumps(topics, indent=1)[:1500])
    print(f"\n{len(topics)} topics, {sum(len(t['points']) for t in topics)} points")
    for p in validate(path, topics)[:10]:
        print("  !", p)
