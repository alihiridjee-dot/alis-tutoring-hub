from __future__ import annotations
"""
Size every spec point in every specification, offline.

The planner divides a topic's band into weeks. Until now it divided by COUNTING
spec points, which assumes they are interchangeable units. They are not: "recall
that the unit of force is the newton" and "investigate how enzyme activity is
affected by pH" are one point each, and across a real spec the heaviest point is
several times the lightest. A "three points this week" slice was anywhere
between twenty minutes and three hours.

This produces a per-point weight in *study units* so the planner can divide by
workload instead. Run once per specification, not per request. The output is
reviewed by a tutor and then loaded into `spec_points.weight`.

    python3 scripts/spec-weights/score.py            # every course
    python3 scripts/spec-weights/score.py --only aqa-gcse-biology-8461

Writes one reviewable CSV per course to out/, plus out/weights.json, which
`scripts/curriculum/generate_seed.py` reads when it regenerates the seed.

WHAT A WEIGHT IS
----------------
The relative teaching-and-learning load of one spec point *within its own
course*. Only ratios matter — the planner uses them to divide a fixed number of
weeks — so weights are normalised per course to a mean of 1.0. That keeps the
old behaviour readable: a budget of six is still "about six average points", and
a course with no weights at all (every weight 1) plans exactly as it did before.

They are NOT minutes. Converting to clock time would need a guided-learning-hours
figure per qualification, and none of these PDFs states one.

TWO SHAPES OF SPECIFICATION
---------------------------
STATEMENT (Edexcel, OCR) — the board numbers every assessable outcome and our
tree stores that outcome as the spec point's title. The statement is already in
`spec_points.json`, so these courses are scored without opening the PDF at all.

SECTION (AQA) — AQA's finest numbered unit is the subsection heading, and the
content runs underneath it as prose and bullets. `scripts/curriculum/parse_aqa.py`
deliberately reads only headings, so the title carries no signal and the body has
to be pulled from the PDF. Our codes ARE AQA's codes, so each section is found by
its code — there is no fuzzy alignment step of the kind AQA usually forces.
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, "out")
sys.path.insert(0, os.path.join(ROOT, "scripts", "curriculum"))

# ─────────────────────────────────────────────────────────── scoring signals

#: Roughly Bloom order. What the spec asks the student to *do* with the content
#: is the best single predictor of how long it takes to teach and to learn.
#: Only the boards' actual command words are listed; anything else scores
#: NEUTRAL_VERB, which sits at about "describe".
VERB = {
    "state": 1.0, "name": 1.0, "know": 1.05, "recall": 1.1, "recognise": 1.1,
    "list": 1.1, "identify": 1.2, "select": 1.2, "describe": 1.3, "label": 1.3,
    "define": 1.3, "demonstrate": 1.4, "understand": 1.4, "draw": 1.5,
    "measure": 1.5, "use": 1.5, "estimate": 1.6, "extract": 1.6, "sketch": 1.6,
    "interpret": 1.6, "plot": 1.6, "determine": 1.7, "apply": 1.7,
    "explain": 1.7, "derive": 1.8, "calculate": 1.8, "compare": 1.8,
    "translate": 1.8, "construct": 1.8, "discuss": 1.9, "predict": 1.9,
    "analyse": 2.0, "assess": 2.0, "evaluate": 2.1, "investigate": 2.2,
    "design": 2.2,
}
NEUTRAL_VERB = 1.4

PRACTICAL = 2.0        # a practical is its own lesson, whatever else is present
PER_EXTRA_ASK = 0.35   # each additional "students should be able to…" (AQA)
PER_BULLET = 0.22      # each enumerated thing to learn
PER_SUB_ITEM = 0.22    # each a/b/c or i/ii/iii item — Edexcel's bullet
PER_MATHS_TAG = 0.25
MATHS_TAG_CAP = 4
PER_APPARATUS_TAG = 0.15
APPARATUS_TAG_CAP = 3
HT_ONLY = 0.3
EQUATION = 0.4         # an equation to hold, rearrange and use

#: Residual content mass: how much there simply *is* of a point, over and above
#: what the spec asks the student to do with it. Capped so one wordy point
#: cannot dominate a topic.
#:
#: There is deliberately no free allowance. An earlier version gave each shape
#: one — 110 words for a section, 25 for a statement — on the theory that the
#: opening words are boilerplate. What that actually did was zero the term for
#: every point shorter than the allowance, so a third of AQA A-Level Physics and
#: 79% of OCR A-Level Biology landed on one identical weight. A signal has to
#: vary from the first word to be a signal at all.
#:
#: The divisor differs by shape because the units do: an AQA section is a block
#: of prose with a table of skills beside it, a board statement is one sentence.
VOLUME_CAP = 1.6
VOLUME_WORDS_PER_UNIT = {"section": 150, "statement": 30}

#: A practical, however each board words it. Scope markers are deliberately NOT
#: scored anywhere in this file: AQA's "(biology only)", Edexcel's `P`/`B`
#: suffix and OCR's separate-science glyph all mean "separate science, not
#: combined", which says nothing about how long the content takes.
IS_PRACTICAL = re.compile(
    r"required practical|core practical|practical activity|"
    r"\bPAG\s*\d|^\s*investigate\b|^\s*practical\b",
    re.I | re.M,
)
HIGHER_TIER = re.compile(r"\(\s*HT only\s*\)|higher tier only", re.I)
MATHS_TAG = re.compile(r"\bM[S]?\s?\d+[a-z]?\b")
APPARATUS_TAG = re.compile(r"\bAT\s?\d+[a-z]?\b|\bAT [a-z]\b")
#: Written-out equations, which every physics and chemistry spec is full of.
HAS_EQUATION = re.compile(r"=|\bequation\b", re.I)


def lettered_items(text: str) -> int:
    """
    How many items an `a … b … c …` list has, or 0 if there is no list.

    Edexcel writes sub-lists as bare letters rather than bullets ("including:
    a radio waves … b microwaves … c infrared"), and those items are the real
    content of the point. Matching a lone letter would catch the English
    article "a" constantly, so we follow the chain: `a`, then `b` after it, then
    `c` after that. A run has to reach three before it counts as a list — two is
    an article and a coincidence.
    """
    pos, n = 0, 0
    for ch in "abcdefghijklmn":
        m = re.compile(r"(?<![A-Za-z])" + ch + r"(?![A-Za-z])").search(text, pos)
        if not m:
            break
        pos, n = m.end(), n + 1
    return n if n >= 3 else 0


ROMANS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]


def roman_items(text: str) -> int:
    """How many items an `i) ii) iii)` list has — Edexcel A-Level's sub-lists."""
    pos, n = 0, 0
    for r in ROMANS:
        m = re.compile(r"(?<![A-Za-z])" + r + r"\)").search(text, pos)
        if not m:
            break
        pos, n = m.end(), n + 1
    return n if n >= 2 else 0


def score(text: str, shape: str) -> float:
    """One spec point, in study units, before per-course normalisation."""
    low = text.lower()

    if shape == "section":
        # AQA states the demand explicitly, once per thing it wants doing.
        asks = re.findall(r"students should be able to\s*:?\s*(?:•\s*)?([a-z]+)", low)
        scores = [VERB.get(v, NEUTRAL_VERB) for v in asks]
        # Content with no explicit ask is exposition — about "describe".
        weight = max(scores) if scores else 1.3
        weight += PER_EXTRA_ASK * max(0, len(scores) - 1)
    else:
        # The statement opens on its own command word. Edexcel A-Level prefixes
        # roman numerals ("i) Understand…"), so step over those first.
        head = re.sub(r"^\s*(?:[ivx]+\)|\d+\.?)\s*", "", low)
        first = re.match(r"\s*([a-z]+)", head)
        weight = VERB.get(first.group(1) if first else "", NEUTRAL_VERB)

    if IS_PRACTICAL.search(text):
        weight += PRACTICAL

    weight += PER_BULLET * text.count("•")
    weight += PER_SUB_ITEM * (lettered_items(text) + roman_items(text))

    # Numeracy and apparatus need practice, not just exposition.
    weight += PER_MATHS_TAG * min(len(set(MATHS_TAG.findall(text))), MATHS_TAG_CAP)
    weight += PER_APPARATUS_TAG * min(len(set(APPARATUS_TAG.findall(text))), APPARATUS_TAG_CAP)

    if HIGHER_TIER.search(text):
        weight += HT_ONLY
    if HAS_EQUATION.search(text):
        weight += EQUATION

    weight += min(VOLUME_CAP, len(text.split()) / VOLUME_WORDS_PER_UNIT[shape])

    return weight


# ───────────────────────────────────────────────────── AQA body extraction

#: Where the taught content stops. Everything past it — the assessment chapter,
#: and crucially the appendix that RE-LISTS every required practical in the
#: course — would otherwise be absorbed by the final section, scoring it as
#: though it contained the whole specification.
CONTENT_END = re.compile(
    r"\n\s*\d+(?:\.\d+)?\s+(?:Scheme of assessment|Practical assessment|Key ideas|"
    r"General administration|Mathematical requirements|Use of apparatus|"
    r"Working scientifically)",
    re.I,
)


def aqa_bodies(pdf_path: str, leaf_codes: list[str]) -> dict[str, str]:
    """
    Each AQA leaf section's full content text, keyed by the board's own code.

    The heading regex is pinned to the chapter the content lives in (3 for
    A-Level, 4 for GCSE), read off the codes themselves. Without that pin it
    also matches the assessment chapter's own numbering — "4.1 Aims" looks
    exactly like a content heading — and the cut-off above then lands past the
    end of the document instead of at the end of the content.
    """
    import pypdf
    from parse_aqa import FOOTER

    chapter = leaf_codes[0].split(".")[0]
    head = re.compile(rf"\n\s*({chapter}(?:\.\d+){{1,3}})\s+[^\s\d]")

    raw = "\n".join(p.extract_text() or "" for p in pypdf.PdfReader(pdf_path).pages)
    # Running footers and bare page numbers are word count that is not content.
    body = "\n".join(
        l for l in raw.split("\n")
        if not FOOTER.search(l) and not re.fullmatch(r"\s*\d{1,3}\s*", l)
    )

    hits = list(head.finditer(body))
    if not hits:
        raise SystemExit(f"no content headings found in {pdf_path}")
    cut = CONTENT_END.search(body, hits[-1].end())
    if cut:
        body = body[: cut.start()]
        hits = list(head.finditer(body))

    out: dict[str, str] = defaultdict(str)
    for i, m in enumerate(hits):
        end = hits[i + 1].start() if i + 1 < len(hits) else len(body)
        chunk = body[m.end() : end]
        # A section can still run into the assessment chapter when that chapter
        # opens without a heading the cut above recognises.
        tail = CONTENT_END.search(chunk)
        if tail:
            chunk = chunk[: tail.start()]
        text = " ".join(chunk.split())
        # Codes recur in contents lists and cross-references; keep the longest
        # sighting, which is the section itself.
        if len(text) > len(out[m.group(1)]):
            out[m.group(1)] = text
    return out


# ────────────────────────────────────────────────────────────────── courses

#: file stem -> shape. The stems match specs/<stem>.pdf and the seed files.
SHAPE = {
    "aqa-gcse-biology-8461": "section",
    "aqa-gcse-chemistry-8462": "section",
    "aqa-gcse-physics-8463": "section",
    "aqa-alevel-biology-7402": "section",
    "aqa-alevel-chemistry-7405": "section",
    "aqa-alevel-physics-7408": "section",
    "edexcel-gcse-biology-1BI0": "statement",
    "edexcel-gcse-chemistry-1CH0": "statement",
    "edexcel-gcse-physics-1PH0": "statement",
    "edexcel-alevel-biology-A-salters-nuffield-9BN0": "statement",
    "edexcel-alevel-biology-B-9BI0": "statement",
    "edexcel-alevel-chemistry-9CH0": "statement",
    "ocr-gcse-biology-A-J247": "statement",
    "ocr-gcse-chemistry-A-J248": "statement",
    "ocr-gcse-physics-A-J249": "statement",
    "ocr-alevel-biology-A-H420": "statement",
    "ocr-alevel-chemistry-A-H432": "statement",
}

#: Guard rails on the normalised weight. The scorer reads text, and text can be
#: wrong: OCR A-Level Chemistry's statements carry the next module's
#: introduction welded onto the end on a handful of rows, and a mis-split
#: section can come out empty. Clamping keeps one bad parse from swallowing a
#: whole week or vanishing from the plan, and the CSV still shows the raw score
#: so a review can see what happened.
MIN_WEIGHT, MAX_WEIGHT = 0.4, 3.0


def courses():
    """(stem, shape, [point]) per course, in seed order, from the seed JSON."""
    seed = os.path.join(ROOT, "supabase", "seed")
    points = json.load(open(os.path.join(seed, "spec_points.json")))
    topics = {t["id"]: t for t in json.load(open(os.path.join(seed, "topics.json")))}

    # The seed JSON is keyed by board|level|subject|syllabus; the PDFs and the
    # weights file are keyed by stem. `syllabus` is the board's qualification
    # code, which is the tail of every stem.
    by_syllabus = defaultdict(list)
    for p in points:
        by_syllabus[topics[p["topic_id"]]["syllabus"]].append(p)

    out = []
    for stem, shape in SHAPE.items():
        code = stem.split("-")[-1]
        rows = by_syllabus.get(code)
        if not rows:
            print(f"  ! {stem}: no rows in the seed for syllabus {code}")
            continue
        out.append((stem, shape, rows))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", action="append", help="score just this file stem")
    args = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    weights: dict[str, float] = {}
    summary = []

    for stem, shape, rows in courses():
        if args.only and stem not in args.only:
            continue

        texts: dict[str, str] = {}
        flagged = 0
        if shape == "section":
            bodies = aqa_bodies(os.path.join(ROOT, "specs", f"{stem}.pdf"),
                                [r["code"] for r in rows])
            for r in rows:
                texts[r["id"]] = bodies.get(r["code"], "")
        else:
            for r in rows:
                texts[r["id"]] = r["title"]

        raw = {}
        for r in rows:
            t = texts[r["id"]]
            # A missing AQA body means the extraction failed, and an average
            # point is the honest guess — the CSV says so rather than silently
            # scoring it as trivial. A SHORT STATEMENT is the opposite case: it
            # is the board being brief ("define density", "the nature of the
            # genetic code"), which is real evidence that the point is small.
            # Treating those as unreadable rounded 37 of OCR A-Level Biology's
            # lightest statements up to average.
            missing = len(t) < (40 if shape == "section" else 3)
            if missing:
                flagged += 1
                raw[r["id"]] = None
            else:
                raw[r["id"]] = score(t, shape)

        got = [v for v in raw.values() if v is not None]
        mean = sum(got) / len(got) if got else 1.0

        csv_rows = []
        for r in rows:
            v = raw[r["id"]]
            w = 1.0 if v is None else round(
                min(MAX_WEIGHT, max(MIN_WEIGHT, v / mean)), 2
            )
            weights[r["id"]] = w
            csv_rows.append([
                r["code"], w, "" if v is None else round(v, 2),
                "NOT FOUND" if v is None else shape,
                r["title"][:120], len(texts[r["id"]].split()),
            ])

        with open(os.path.join(OUT, f"{stem}.csv"), "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["code", "weight", "raw_score", "source", "title", "words"])
            w.writerows(csv_rows)

        vals = [r[1] for r in csv_rows]
        summary.append((stem, len(rows), flagged, min(vals), max(vals),
                        max(vals) / min(vals)))

    json.dump(weights, open(os.path.join(OUT, "weights.json"), "w"), indent=0)

    print(f"{'course':48} {'pts':>4} {'flag':>4} {'min':>5} {'max':>5} {'spread':>6}")
    for stem, n, flagged, lo, hi, spread in summary:
        print(f"{stem:48} {n:4} {flagged:4} {lo:5.2f} {hi:5.2f} {spread:6.1f}x")
    print(f"\n{len(weights)} weights -> {os.path.join(OUT, 'weights.json')}")


if __name__ == "__main__":
    main()
