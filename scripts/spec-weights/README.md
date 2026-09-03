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
# deliver a changed weight to a row that already exists
python3 scripts/spec-weights/emit_migration.py > supabase/migrations/0013_spec_point_weights.sql
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
series, less three revision weeks), **13 of 17 courses levelled out**:

| Course | Points | Before | After |
| --- | --- | --- | --- |
| AQA A-Level Biology (7402) | 53 | 8.6x | **3.8x** |
| AQA GCSE Physics (8463) | 81 | 5.5x | **2.4x** |
| OCR GCSE Chemistry (J248) | 149 | 4.7x | **3.6x** |
| AQA GCSE Chemistry (8462) | 124 | 3.6x | **2.1x** |
| OCR GCSE Physics (J249) | 182 | 3.5x | **3.0x** |
| AQA A-Level Chemistry (7405) | 91 | 3.1x | **1.8x** |
| AQA GCSE Biology (8461) | 97 | 3.0x | **2.3x** |
| AQA A-Level Physics (7408) | 147 | 2.7x | **1.9x** |
| Edexcel A-Level Biology B (9BI0) | 220 | 2.3x | **1.9x** |
| Edexcel A-Level Biology A (9BN0) | 137 | 2.2x | **1.6x** |
| Edexcel GCSE Chemistry (1CH0) | 237 | 2.2x | **2.1x** |
| Edexcel GCSE Biology (1BI0) | 165 | 2.1x | **1.8x** |

The four that did not move are limited by the calendar, not by the weights.
**`distributeWeeks` gives every topic at least one week**, so once a course has
nearly as many topics as there are weeks, every band is one week long and there
is nothing left for `splitAcrossWeeks` to cut:

| Course | Topics | One-week bands | Before | After |
| --- | --- | --- | --- | --- |
| OCR A-Level Chemistry (H432) | 45 | **all 45** | 15.2x | 15.2x |
| OCR A-Level Biology (H420) | 31 | 28 | 4.8x | 4.8x |
| Edexcel A-Level Chemistry (9CH0) | 19 | 6 | 4.6x | 4.6x |
| Edexcel GCSE Physics (1PH0) | 15 | 1 | 4.4x | 4.5x |

H432 asks for 45 weeks of a 34-week year — `overrunWeeks` already reports that
to the tutor, and no amount of weighting fixes a course that does not fit. The
remaining variation on the other three is a two-point topic holding a whole week
next to a thirty-nine-point one; letting small adjacent topics share a week
would address it, and is a separate change to how a band works.

Two courses moved slightly the wrong way (1PH0 4.4x→4.5x, J247 2.3x→2.8x). Both
have a tiny topic pinned at one week that sets the denominator either way, and
weighting the *other* topics' bands changed how thinly they spread. It is noise
around a floor, not the split misbehaving.

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
