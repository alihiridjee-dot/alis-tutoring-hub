from __future__ import annotations
"""
Pearson Edexcel A-Level: Biology A (9BN0), Biology B (9BI0), Chemistry (9CH0).

Three variants of one house style, differing in how the smallest coded
statement is written:

  9BN0  Topic N: Title   then  `N.M  statement`
  9BI0  Topic N: Title   then  `N.M Sub-heading`  then  roman `i/ii/iii`
        -> code "N.M(i)", which is how Edexcel itself references them
  9CH0  Topic N: Title   (with 'Topic NA:' sub-headings that do NOT restart
        numbering) then a plain integer list -> code "N.n"

All three repeat their topic headings in an appendix, so collection stops as
soon as a topic number fails to advance.
"""
import re
from extract import doc_lines, clean, BLEED

TOPIC = re.compile(r"^\s*Topic\s+(\d+)\s*:\s*(.+?)\s*$")
SUBTOPIC_HEAD = re.compile(r"^\s*Topic\s+\d+[A-Z]\s*:\s*(.+?)\s*$")

P_DOTTED = re.compile(r"^\s*(\d+\.\d+)\s+(.+)$")          # 9BN0
# 9BI0 sub-heading. Discriminated from a statement by containing no full stop
# rather than by length: a 60-character cap silently rejected "4.6 Transfer of
# materials between the circulatory system and cells", and its items then
# inherited 4.5's code as duplicates.
P_SUBHEAD = re.compile(r"^\s*(\d+\.\d+)\s+([A-Z][^.]{2,110})$")
P_ROMAN = re.compile(r"^\s*(x{0,3}(?:ix|iv|v?i{1,3}|v))\s+(.+)$")  # 9BI0 items
_ROMAN_ORDER = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
                "xi", "xii", "xiii", "xiv", "xv"]
# The period is optional because the Chemistry spec is inconsistent: item 20 of
# topic 1 prints as "20 know that..." with no dot. Requiring it stalled the
# sequence counter, and every item from 20 onwards was appended to 1.19 instead
# — one topic lost a third of its content. Loosening this is safe because the
# expect_n check, not the punctuation, is what identifies a genuine item.
P_INT = re.compile(r"^\s*(\d{1,3})[.)]?\s+(.+)$")            # 9CH0

FOOTER = re.compile(
    r"^\s*(?:Pearson Edexcel Level|Specification\s*[–-]\s*Issue|Issue \d|©|"
    r"Students should:?\s*$|\d{1,3}\s*$)", re.I
)
NOISE = re.compile(
    r"^\s*(?:Students should|Core practical|Practical \d|Maths skills|"
    r"Use of mathematics|Suggested practical|What students need to learn)\b", re.I
)
BULLET = re.compile(r"^\s*[●•]")
# Deliberately narrow. An earlier version also stopped on "Appendix N", which
# every topic's own intro prose cross-references — so Biology B parsed to zero
# topics. Leaving the appendices to the monotonic topic-number rule is both
# safer and sufficient, since they always reprint topic 1 first.
# The LAST topic has no successor heading to close it, so without an explicit
# end-of-content marker it runs on into whatever follows. In Chemistry that was
# the Science Practical Endorsement and a standard-electrode-potential table,
# which arrived as 22 bogus spec points on Topic 19.
STOP = re.compile(
    r"^\s*(?:Assessment Objectives|Paper \d \(Paper code|"
    r"(?:Science )?Practical Endorsement|Appendix \d+:\s*$)\s*$", re.I
)
GLYPH = re.compile(r"^\s*(?:\S{18,}|.{1,2})\s*$")

# No real statement runs this long. The cap stops a parser that has lost its
# place from swallowing the rest of the document into one spec point.
MAX_STATEMENT = 2600


def parse(path: str, variant: str):
    topics: list = []
    current = None
    max_topic = 0
    code = None
    buf: list = []
    subcode = None
    sub_seen = -1
    stopped = False
    # Chemistry's statements are a plain 1,2,3... list per topic. Tracking the
    # NEXT expected number rejects stray digits in prose, and must be a counter
    # rather than a look-back at the last stored point — the previous statement
    # is still buffered and unflushed at the moment the check runs.
    expect_n = 1

    def flush():
        nonlocal code, buf
        if current is not None and code and buf:
            title = clean(" ".join(buf))
            if title and len(title) > 8:
                current["points"].append({"code": code, "title": title})
        code, buf = None, []

    for _, raw in doc_lines(path, 0, None, split_columns=False, layout=False):
        line = raw.rstrip()
        if stopped or not line.strip():
            continue
        if FOOTER.match(line) or NOISE.match(line):
            flush()
            continue
        if BULLET.match(line):
            flush()
            continue
        if " " not in line.strip() and GLYPH.match(line):
            continue

        m = TOPIC.match(line)
        if m:
            n = int(m.group(1))
            # An appendix reprints the topic list; once numbering stops
            # advancing we have left the assessable content behind.
            if n <= max_topic:
                flush()
                stopped = True
                continue
            flush()
            max_topic = n
            current = {"number": n, "title": clean(m.group(2)), "points": []}
            topics.append(current)
            subcode = None
            sub_seen = -1
            expect_n = 1
            continue

        if current is None:
            continue
        if STOP.match(line):
            flush()
            stopped = True
            continue
        if SUBTOPIC_HEAD.match(line):
            flush()
            continue

        if variant == "bioa":
            m = P_DOTTED.match(line)
            if m and m.group(1).split(".")[0] == str(current["number"]):
                if not current["points"] or _rank(m.group(1)) > _rank(current["points"][-1]["code"]):
                    flush()
                    code, buf = m.group(1), [m.group(2)]
                    continue
        elif variant == "biob":
            m = P_SUBHEAD.match(line)
            if m and m.group(1).split(".")[0] == str(current["number"]):
                flush()
                subcode = m.group(1)
                sub_seen = -1
                continue
            m = P_ROMAN.match(line)
            if m and subcode:
                # Roman numerals must advance within a sub-topic; a wrapped line
                # that happens to begin "i " or "v " is text, not a new item.
                idx = _ROMAN_ORDER.index(m.group(1).lower()) if m.group(1).lower() in _ROMAN_ORDER else -1
                if idx > sub_seen:
                    flush()
                    sub_seen = idx
                    code, buf = f"{subcode}({m.group(1).lower()})", [m.group(2)]
                    continue
        elif variant == "chem":
            m = P_INT.match(line)
            if m and int(m.group(1)) == expect_n:
                flush()
                code, buf = f"{current['number']}.{expect_n}", [m.group(2)]
                expect_n += 1
                continue

        if code and sum(len(x) for x in buf) < MAX_STATEMENT:
            buf.append(line)

    flush()
    return [t for t in topics if t["points"]]


def _rank(c):
    a, b = c.split(".")
    return int(a), int(b)


def validate(name, topics):
    out = []
    for t in topics:
        seen = set()
        for p in t["points"]:
            if BLEED.search(p["title"]):
                out.append(f"{name} {p['code']}: column bleed -> {p['title'][:60]}")
            if len(p["title"]) > 1500:
                out.append(f"{name} {p['code']}: runaway title ({len(p['title'])} chars)")
            if len(p["title"]) < 15:
                out.append(f"{name} {p['code']}: short -> {p['title']!r}")
            if p["code"] in seen:
                out.append(f"{name} {p['code']}: duplicate")
            seen.add(p["code"])
    return out


if __name__ == "__main__":
    import sys
    path, variant = sys.argv[1], sys.argv[2]
    ts = parse(path, variant)
    print(f"{len(ts)} topics, {sum(len(t['points']) for t in ts)} points")
    for t in ts:
        print(f"  T{t['number']:2d} {len(t['points']):3d}  {t['title'][:44]}")
    for x in validate(variant, ts)[:8]:
        print("   !", x)
