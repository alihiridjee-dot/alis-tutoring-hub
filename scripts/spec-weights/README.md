# Spec point weights

Offline sizing of every spec point, so the planner can divide a topic into weeks
by **workload** rather than by counting rows.

## The problem this solves

`computePacing` sized a topic's band by `pointCount` and `splitEvenly` cut it
into equal *counts*. Both assume spec points are interchangeable units. On a
real specification they are not — "recall that like charges repel and unlike
charges attract" and "Core Practical: investigate the densities of solids and
liquids" are one point each in Edexcel GCSE Physics.

Every point shipped at `weight = 1`, so the column existed but carried no
information. These scripts fill it in.

## What a weight is

The relative teaching-and-learning load of one spec point **within its own
course**. Only ratios matter — the planner uses them to divide that course's
fixed number of weeks — so each course is normalised to a **mean of 1.0**.

That keeps the old numbers readable: `FOCUS_BUDGET = 6` still means "about six
average points", and a course with no weights at all plans exactly as it did
before. It also means weights are **not comparable across courses**, and are
**not minutes** — converting to clock time would need a guided-learning-hours
figure per qualification, and none of these PDFs states one.

## Running it

Needs `pypdf` (already required by `scripts/curriculum/`).

```bash
python3 scripts/spec-weights/score.py                       # all 17 courses
python3 scripts/spec-weights/score.py --only aqa-gcse-biology-8461
```

Writes a reviewable CSV per course to `out/` — code, final weight, raw score,
source, title, word count — plus `out/weights.json` keyed by spec point id.

Then get them into the database:

```bash
# the seed files, for a fresh load
python3 scripts/curriculum/generate_seed.py
python3 -c "import sys; sys.path.insert(0,'scripts/curriculum'); \
  import generate_seed as g; g.emit_json('supabase/seed')"

# an existing database — the seeds are `on conflict do nothing` and cannot
# deliver a changed title or weight to a row that already exists
python3 scripts/spec-weights/emit_migration.py > supabase/migrations/0013_spec_point_weights.sql

# …or push straight to a live database, titles and weights, over PostgREST.
# Never `load_seed.py` for this: it upserts whole rows and would blank
# `video_url`, which the parsers never produce.
set -a && . ./.env && set +a
python3 scripts/spec-weights/apply_spec_points.py          # dry run
python3 scripts/spec-weights/apply_spec_points.py --write
```

## Two shapes of specification

**Statement** (Edexcel, OCR — 11 courses, 2372 points). The board numbers every
assessable outcome and `scripts/curriculum/` stores that outcome as the spec
point's title, so the statement is already in `supabase/seed/spec_points.json`.
These are scored without opening a PDF.

**Section** (AQA — 6 courses, 593 points). AQA's finest *numbered* unit is the
subsection heading, with content running underneath as prose and bullets;
`parse_aqa.py` deliberately reads only headings, so the title carries no signal
and the body has to be pulled from the PDF. Our codes are AQA's codes, so each
section is found by its code — none of the fuzzy alignment AQA usually forces.

## How a point gets its weight

| Signal | Effect |
| --- | --- |
| Command verb (`state`/`know` → `evaluate`/`investigate`) | 1.0 → 2.2 |
| The point **is** a practical (required / core / PAG) | +2.0 |
| Each additional "students should be able to…" (AQA) | +0.35 |
| Each bulleted item | +0.22 |
| Each `a`/`b`/`c` or `i)`/`ii)`/`iii)` sub-item | +0.22 |
| Maths (`MS`/`M`) and apparatus (`AT`) skill tags | +0.25 / +0.15 each, capped |
| Higher tier only | +0.3 |
| Contains an equation | +0.4 |
| Content volume (word count) | up to +1.6 |

Scope markers are deliberately **not** scored: AQA's "(biology only)",
Edexcel's `P`/`B` code suffix and OCR's separate-science glyph all mean
"separate science, not combined", which says nothing about how long the content
takes.

## What reads them

- `spec_points.weight` (migration `0002_curriculum.sql`, values in `0013`).
- `computePacing` in `src/lib/pacing.ts` sizes each topic's band by the sum of
  its points' weights instead of counting rows.
- `splitAcrossWeeks` cuts a topic into weeks of equal *work* — an exact min-max
  partition — instead of equal counts.
- `selectWeekPoints` budgets the teaching spine by this week's weight.
- `focusDemand` charges each revisit at its point's own size, so the revision
  lane's weekly allowance is in work rather than slots.
- `focusLoadFor` compares the two and reports when revision has outgrown the
  teaching it is meant to support.

## Did it work?

```bash
bun run scripts/spec-weights/compare-split.ts
```

Runs the shipped `computePacing` and `splitAcrossWeeks` over every course twice
— sized and cut by row count, then by work — and measures the same thing both
times: the real weight of the points landing in each teaching week. The number
reported is the heaviest week divided by the lightest, which is how much a
student's week varies for reasons that have nothing to do with them.

Over a 34-week year (first Monday of September to the middle of the summer
series, less three revision weeks), **14 of 17 courses levelled out**:

| Course | Points | Before | After |
| --- | --- | --- | --- |
| AQA A-Level Biology (7402) | 53 | 8.6x | **3.8x** |
| AQA GCSE Physics (8463) | 81 | 5.5x | **2.1x** |
| AQA A-Level Physics (7408) | 147 | 4.4x | **2.5x** |
| OCR GCSE Physics (J249) | 182 | 4.4x | **2.0x** |
| Edexcel A-Level Chemistry (9CH0) | 325 | 3.9x | **3.5x** |
| AQA GCSE Chemistry (8462) | 124 | 3.6x | **1.6x** |
| AQA GCSE Biology (8461) | 97 | 3.5x | **2.3x** |
| OCR GCSE Chemistry (J248) | 149 | 3.3x | **2.2x** |
| Edexcel GCSE Chemistry (1CH0) | 237 | 3.1x | **1.4x** |
| AQA A-Level Chemistry (7405) | 91 | 3.1x | **2.1x** |
| Edexcel GCSE Biology (1BI0) | 165 | 2.2x | **1.7x** |
| Edexcel A-Level Biology A (9BN0) | 137 | 2.2x | **1.6x** |
| Edexcel A-Level Biology B (9BI0) | 220 | 1.6x | **1.5x** |

"Before" is the same layout with band sizes and week cuts taken from row counts
instead of work, so the column isolates the weights themselves.

### The topic-count floor, and how it was removed

Three courses barely move: OCR A-Level Chemistry (45 topics), OCR A-Level
Biology (31) and Edexcel A-Level Chemistry (19). They used to be far worse. The
old rule promised **every topic a week of its own**, which is a promise the
calendar cannot keep: H432 asked for 45 weeks of a 34-week year and was
scheduled eleven weeks past its own exam, and on H420 an eleven-point topic and
a three-point topic each got exactly one week.

`distributeWeeks` now lays topics on a continuous work axis and lets **two small
neighbours share a week** so a big topic can have two. Nothing runs past the
revision window any more, and `crowdedWeeks` reports how many weeks had to
double up so the tutor can see the pressure. On H420 that turned the first week
of the year from eleven spec points into five, with Cell structure spanning two
weeks and Planning sharing one with Implementing.

Boundaries are rounded to the **nearest** week, and when there are more topics
than weeks the assignment is handed to `splitAcrossWeeks` instead. Both details
were measured, not guessed:

| Boundary rule | H432 heaviest:lightest | Shared weeks |
| --- | --- | --- |
| Round outwards (floor/ceil) | 5.0x | 31 of 34 — nearly every week |
| Round to nearest | 8.6x | 16 |
| Round to nearest, balanced when topics > weeks | **3.5x** | 10 |

Rounding outwards makes every topic overlap its neighbour wherever a boundary
falls mid-week, which is not sharing, it is smearing. Rounding to the nearest
tiles cleanly but lets the error at each boundary accumulate — hence handing the
crowded case to the exact min-max partition.

## Caveats

- **The weights are a starting point for tutor review, not an authority.** The
  CSVs exist to be read and corrected.
- **OCR A-Level Chemistry has extraction bleed.** A handful of statements carry
  the next module's introduction welded onto the end, which inflates their word
  count. The `MAX_WEIGHT` clamp keeps that from swallowing a week, but those
  rows are wrong in the seed as well as here.
- **OCR higher tier is not detected.** OCR marks HT-only statements in bold
  type, which plain-text extraction cannot see. Every other board's HT marker is
  textual and is picked up.
- **Re-check the parse when a board reissues a spec.** The AQA extractor stops
  at the assessment chapter; if it ever stops too late, the final section
  absorbs the appendix that re-lists every required practical in the course and
  scores as though it contained all of them. `score.py` prints each course's
  point count and weight spread — if either moves, look at why.
