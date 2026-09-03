from __future__ import annotations
"""
Turn the parsed specifications into seed SQL.

One file per qualification, deliberately. Two of these specifications collide:
Edexcel A-Level Biology A (Salters-Nuffield) and Biology B are both
(alevel, edexcel, biology) as far as the schema is concerned, because there is
no syllabus-variant column. Loading both would give a Biology student the union
of two different courses to sort. Separate files put that choice where it
belongs rather than resolving it silently.

UUIDs are derived (uuid5) from board|level|subject|code, so re-running a file
is a no-op instead of a duplicate curriculum, and a spec point keeps its id
across reloads — which matters because student cards reference it.
"""
import json
import os
import uuid
import parse_edexcel_gcse as G
import parse_edexcel_alevel as A
import parse_ocr as O
import parse_ocr_gcse as OG
import parse_aqa as Q

NS = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")

#: Per-point workload, keyed by the same derived id the rows carry. Produced by
#: `scripts/spec-weights/score.py` and reviewed before it lands; see that
#: folder's README. Missing means 1, which is what every point was before the
#: weights existed and what an unscored course still plans as.
WEIGHTS = {}
_weights_path = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "spec-weights", "out", "weights.json"
)
if os.path.exists(_weights_path):
    WEIGHTS = json.load(open(_weights_path))


def weight_of(point_id):
    return WEIGHTS.get(point_id, 1)

# The board's own qualification code, stored on every topic as `syllabus`.
# This is what keeps Edexcel A-Level Biology A and B apart now that the schema
# has a column for it — so topic titles are back to the board's exact wording,
# with no disambiguating prefix bolted on.
SYLLABUS = {
    "edexcel-gcse-biology-1BI0": "1BI0",
    "edexcel-gcse-chemistry-1CH0": "1CH0",
    "edexcel-gcse-physics-1PH0": "1PH0",
    "edexcel-alevel-biology-A-salters-nuffield-9BN0": "9BN0",
    "edexcel-alevel-biology-B-9BI0": "9BI0",
    "edexcel-alevel-chemistry-9CH0": "9CH0",
    "ocr-alevel-biology-A-H420": "H420",
    "ocr-alevel-chemistry-A-H432": "H432",
    "ocr-gcse-biology-A-J247": "J247",
    "ocr-gcse-chemistry-A-J248": "J248",
    "ocr-gcse-physics-A-J249": "J249",
    "aqa-gcse-biology-8461": "8461",
    "aqa-gcse-chemistry-8462": "8462",
    "aqa-gcse-physics-8463": "8463",
    "aqa-alevel-biology-7402": "7402",
    "aqa-alevel-chemistry-7405": "7405",
    "aqa-alevel-physics-7408": "7408",
}


def topic_title(stem, kind, key, title):
    # OCR and AQA both number their own sections, so the number is part of how
    # a student sees the heading. Edexcel does not, so its topic numbers are
    # restored in the form the specification's contents page uses.
    if kind in ("ocr", "ocr_gcse", "aqa"):
        return f"{key} {title}"
    return f"Topic {key}: {title}"

SPECS = [
    # (file stem, parser, args, subject, board, level, label)
    ("edexcel-gcse-biology-1BI0", "gcse", None, "biology", "edexcel", "gcse", "Edexcel GCSE Biology (1BI0)"),
    ("edexcel-gcse-chemistry-1CH0", "gcse", None, "chemistry", "edexcel", "gcse", "Edexcel GCSE Chemistry (1CH0)"),
    ("edexcel-gcse-physics-1PH0", "gcse", None, "physics", "edexcel", "gcse", "Edexcel GCSE Physics (1PH0)"),
    ("edexcel-alevel-biology-A-salters-nuffield-9BN0", "alevel", "bioa", "biology", "edexcel", "alevel", "Edexcel A-Level Biology A Salters-Nuffield (9BN0)"),
    ("edexcel-alevel-biology-B-9BI0", "alevel", "biob", "biology", "edexcel", "alevel", "Edexcel A-Level Biology B (9BI0)"),
    ("edexcel-alevel-chemistry-9CH0", "alevel", "chem", "chemistry", "edexcel", "alevel", "Edexcel A-Level Chemistry (9CH0)"),
    ("ocr-alevel-biology-A-H420", "ocr", None, "biology", "ocr", "alevel", "OCR A-Level Biology A (H420)"),
    ("ocr-alevel-chemistry-A-H432", "ocr", None, "chemistry", "ocr", "alevel", "OCR A-Level Chemistry A (H432)"),
    ("ocr-gcse-biology-A-J247", "ocr_gcse", None, "biology", "ocr", "gcse", "OCR GCSE Biology A Gateway (J247)"),
    ("ocr-gcse-chemistry-A-J248", "ocr_gcse", None, "chemistry", "ocr", "gcse", "OCR GCSE Chemistry A Gateway (J248)"),
    ("ocr-gcse-physics-A-J249", "ocr_gcse", None, "physics", "ocr", "gcse", "OCR GCSE Physics A Gateway (J249)"),
    ("aqa-gcse-biology-8461", "aqa", None, "biology", "aqa", "gcse", "AQA GCSE Biology (8461)"),
    ("aqa-gcse-chemistry-8462", "aqa", None, "chemistry", "aqa", "gcse", "AQA GCSE Chemistry (8462)"),
    ("aqa-gcse-physics-8463", "aqa", None, "physics", "aqa", "gcse", "AQA GCSE Physics (8463)"),
    ("aqa-alevel-biology-7402", "aqa", None, "biology", "aqa", "alevel", "AQA A-Level Biology (7402)"),
    ("aqa-alevel-chemistry-7405", "aqa", None, "chemistry", "aqa", "alevel", "AQA A-Level Chemistry (7405)"),
    ("aqa-alevel-physics-7408", "aqa", None, "physics", "aqa", "alevel", "AQA A-Level Physics (7408)"),
]


def lit(v):
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def det_id(*parts):
    """
    Derived id, scoped by SPECIFICATION not just by board/level/subject.

    Edexcel A-Level Biology A and B both number their topics from 1, so keying
    on board|level|subject alone made "Topic 1: Lifestyle, Health and Risk" and
    "Topic 1: Biological Molecules" the same row — silently dropping eight of
    Biology B's topics and re-parenting its spec points onto Biology A's.
    """
    return str(uuid.uuid5(NS, "|".join(str(p) for p in parts)))


def load(stem, kind, arg):
    path = f"../../specs/{stem}.pdf"
    if kind == "gcse":
        a, b = G.content_range(path)
        ts = G.parse(path, a, b)
        return [{"key": str(t["number"]), "title": t["title"], "points": t["points"]} for t in ts], G.validate(stem, ts)
    if kind == "alevel":
        ts = A.parse(path, arg)
        return [{"key": str(t["number"]), "title": t["title"], "points": t["points"]} for t in ts], A.validate(stem, ts)
    if kind == "ocr_gcse":
        ss = OG.parse(path)
        return [{"key": s["code"], "title": s["title"], "points": s["points"]} for s in ss], OG.validate(stem, ss)
    if kind == "aqa":
        ss = Q.parse(path)
        return [{"key": s["code"], "title": s["title"], "points": s["points"]} for s in ss], Q.validate(stem, ss)
    ss = O.parse(path)
    return [{"key": s["code"], "title": s["title"], "points": s["points"]} for s in ss], O.validate(stem, ss)


def emit(stem, kind, arg, subject, board, level, label):
    topics, problems = load(stem, kind, arg)
    lines = [
        f"-- {label}",
        f"-- Generated from specs/{stem}.pdf by scripts/curriculum/generate_seed.py.",
        "-- Transcribed from the board's own specification. Do not hand-edit:",
        "-- regenerate instead, or the ids stop matching students' FSRS cards.",
        "-- Safe to re-run — every insert is `on conflict (id) do nothing`.",
        "begin;",
        "",
    ]
    n_points = 0
    for ti, t in enumerate(topics):
        tid = det_id(stem, board, level, subject, "topic", t["key"])
        # OCR numbers its sections (3.1.2); Edexcel does not, so its topic
        # titles get the number restored to match how students see them.
        title = topic_title(stem, kind, t["key"], t["title"])
        lines.append(
            "insert into public.topics (id, subject, board, level, syllabus, title, sort_order) "
            f"values ({lit(tid)}, {lit(subject)}::public.subject, {lit(board)}::public.board, "
            f"{lit(level)}::public.level, {lit(SYLLABUS[stem])}, {lit(title)}, {ti}) "
            "on conflict (id) do nothing;"
        )
        for pi, p in enumerate(t["points"]):
            pid = det_id(stem, board, level, subject, "point", p["code"])
            lines.append(
                "insert into public.spec_points (id, topic_id, code, title, sort_order, weight) values ("
                f"{lit(pid)}, {lit(tid)}, {lit(p['code'])}, {lit(p['title'])}, {pi}, {weight_of(pid)}) "
                "on conflict (id) do nothing;"
            )
            n_points += 1
        lines.append("")
    lines += ["commit;", ""]
    return "\n".join(lines), len(topics), n_points, problems


if __name__ == "__main__":
    import os
    out_dir = "../../supabase/seed"
    os.makedirs(out_dir, exist_ok=True)
    grand_t = grand_p = 0
    all_problems = []
    for stem, kind, arg, subject, board, level, label in SPECS:
        sql, nt, npt, problems = emit(stem, kind, arg, subject, board, level, label)
        with open(f"{out_dir}/{stem}.sql", "w", encoding="utf-8") as fh:
            fh.write(sql)
        grand_t += nt
        grand_p += npt
        all_problems += problems
        print(f"{label:52s} {nt:3d} topics {npt:5d} points  {len(problems)} flagged")
    print(f"\nTOTAL {grand_t} topics, {grand_p} spec points, {len(all_problems)} flagged")
    for p in all_problems:
        print("  !", p[:130])


def emit_json(out_dir):
    """
    Same rows as the SQL, as JSON for the PostgREST loader.

    Both Edexcel A-Level Biology syllabuses are included: Ali chose to load both
    and add a syllabus column later. Until that column exists an Edexcel A-Level
    Biology student sees the union of the two courses.
    """
    import json

    topics, points = [], []
    for stem, kind, arg, subject, board, level, label in SPECS:
        parsed, _ = load(stem, kind, arg)
        for ti, t in enumerate(parsed):
            tid = det_id(stem, board, level, subject, "topic", t["key"])
            title = topic_title(stem, kind, t["key"], t["title"])
            topics.append({
                "id": tid, "subject": subject, "board": board, "level": level,
                "syllabus": SYLLABUS[stem], "title": title, "sort_order": ti,
            })
            for pi, p in enumerate(t["points"]):
                pid = det_id(stem, board, level, subject, "point", p["code"])
                points.append({
                    "id": pid, "topic_id": tid, "code": p["code"], "title": p["title"],
                    "sort_order": pi, "weight": weight_of(pid),
                })

    # A derived id can only collide if two specs share board|level|subject|code.
    # Edexcel A-Level Biology A and B do exactly that, so dedupe rather than
    # letting the loader fail halfway through a batch.
    def dedupe(rows):
        seen, out = set(), []
        for r in rows:
            if r["id"] in seen:
                continue
            seen.add(r["id"])
            out.append(r)
        return out

    t2, p2 = dedupe(topics), dedupe(points)
    json.dump(t2, open(f"{out_dir}/topics.json", "w"), ensure_ascii=False)
    json.dump(p2, open(f"{out_dir}/spec_points.json", "w"), ensure_ascii=False)
    print(f"json: {len(t2)} topics ({len(topics)-len(t2)} dupes dropped), "
          f"{len(p2)} points ({len(points)-len(p2)} dupes dropped)")
