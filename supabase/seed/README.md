# Curriculum seed

Generated from the PDFs in `specs/` by `scripts/curriculum/generate_seed.py`.
Every topic title and spec point is transcribed from the board's own
specification — nothing here is authored or paraphrased.

Regenerate with:

    cd scripts/curriculum && python3 generate_seed.py

## Loading

**Already loaded** into project `ojrkuvtsreamgymkulwj` (2026-09-02), all
seventeen specifications, via the REST loader:

    set -a && . ./.env && set +a && python3 scripts/curriculum/load_seed.py --prune

`--prune` deletes rows the current seed no longer produces, which upserting
alone cannot do — it refuses to run if any student card or review exists, since
deleting a spec point cascades to them.

The `.sql` files are the same data for the Supabase SQL editor if you would
rather not use the service key. Ids are derived (uuid5) from
`spec|board|level|subject|code`, so re-running either route is safe.

Derived ids matter beyond idempotency — a spec point keeps the same id across
regenerations, so reloading after students have started does not orphan their
FSRS cards.

| File                                                 | Topics  | Points    |
| ---------------------------------------------------- | ------- | --------- |
| `edexcel-gcse-biology-1BI0.sql`                      | 9       | 165       |
| `edexcel-gcse-chemistry-1CH0.sql`                    | 9       | 237       |
| `edexcel-gcse-physics-1PH0.sql`                      | 15      | 296       |
| `edexcel-alevel-biology-A-salters-nuffield-9BN0.sql` | 8       | 137       |
| `edexcel-alevel-biology-B-9BI0.sql`                  | 10      | 220       |
| `edexcel-alevel-chemistry-9CH0.sql`                  | 19      | 325       |
| `ocr-alevel-biology-A-H420.sql`                      | 31      | 244       |
| `ocr-alevel-chemistry-A-H432.sql`                    | 45      | 288       |
| `ocr-gcse-biology-A-J247.sql`                        | 15      | 129       |
| `ocr-gcse-chemistry-A-J248.sql`                      | 17      | 149       |
| `ocr-gcse-physics-A-J249.sql`                        | 20      | 182       |
| `aqa-gcse-biology-8461.sql`                          | 7       | 97        |
| `aqa-gcse-chemistry-8462.sql`                        | 10      | 124       |
| `aqa-gcse-physics-8463.sql`                          | 8       | 81        |
| `aqa-alevel-biology-7402.sql`                        | 8       | 53        |
| `aqa-alevel-chemistry-7405.sql`                      | 3       | 91        |
| `aqa-alevel-physics-7408.sql`                        | 13      | 147       |
| **Total**                                            | **247** | **2,965** |

## AQA points are subsections, not statements

AQA is the one board here that does not number its assessable statements. Its
finest published reference is the subsection heading — 3.3.2 Gas exchange,
4.1.1.5 Microscopy — under which content runs as unnumbered prose. So an AQA
spec point is that subsection, carrying AQA's own code and heading.

That is deliberate, and it follows the rule in `specs/README.md`: splitting the
prose into per-paragraph points would mean minting codes AQA has never
published, and a student's confidence rating would then be keyed to a reference
their exam board does not recognise.

The cost is granularity. AQA A-Level Biology has 53 points where OCR Biology A
has 244, so an AQA rating covers noticeably more content per card. If that
proves too coarse in practice, the fix is a sub-point table with AQA text and
an explicit "not a board reference" flag — not fabricated codes.

## Load Biology A or Biology B, not both

The schema keys curriculum on `(level, board, subject)` and has no column for
which syllabus a student follows. Edexcel A-Level Biology A (Salters-Nuffield)
and Biology B are both `alevel / edexcel / biology`, so loading both gives an
Edexcel A-Level Biology student 18 topics drawn from two different courses to
sort through.

Load the one your student actually sits. Supporting both at once needs a
syllabus column on `topics` and a matching field on `student_enrolments`.

## Verifying a load

    select level, board, subject, count(distinct t.id) as topics, count(sp.id) as points
    from public.topics t
    left join public.spec_points sp on sp.topic_id = t.id
    group by 1, 2, 3 order by 1, 2, 3;

## Known limitations

- **Equations are degraded.** Formulae are drawn as positioned glyphs, so text
  extraction loses them. Statements keep their wording ("Recall and use the
  equation: energy transferred (joule, J) = charge moved (coulomb, C) × …") but
  a rendered equation may arrive as a short trailing fragment. Edexcel GCSE
  Physics is worst affected.
- **OCR GCSE pages are rotated**, and pypdf's layout mode refuses them
  outright. `parse_ocr_gcse.py` calls `transfer_rotation_to_content()` first;
  without it the extraction returns page numbers and nothing else.
- **Two OCR A-Level points carry guidance-column text**, both `6.3.2(e)`
  (Biology A and Chemistry A). The column split is geometric and these two rows sit on pages
  where it misfires. Worth fixing by hand after loading.
- Diagrams, tables and images referenced by a statement are not captured.
