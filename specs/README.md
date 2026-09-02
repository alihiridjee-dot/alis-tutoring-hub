# Exam board specifications

Source PDFs for authoring the curriculum. Downloaded 2026-08-23 (Edexcel, OCR
A-Level) and 2026-09-02 (AQA, OCR GCSE) from each
board's own site — never from a mirror, since third-party copies go stale and
this is the document spec point codes are transcribed from.

**Never invent a spec point.** Codes and titles are transcribed from these
files exactly as the board words them; `spec_points.code` is the board's own
reference and students match on it.

## A-Level

| File                                                 | Board           | Qualification                | Code |
| ---------------------------------------------------- | --------------- | ---------------------------- | ---- |
| `edexcel-alevel-biology-A-salters-nuffield-9BN0.pdf` | Pearson Edexcel | Biology A (Salters-Nuffield) | 9BN0 |
| `edexcel-alevel-biology-B-9BI0.pdf`                  | Pearson Edexcel | Biology B                    | 9BI0 |
| `edexcel-alevel-chemistry-9CH0.pdf`                  | Pearson Edexcel | Chemistry                    | 9CH0 |
| `ocr-alevel-biology-A-H420.pdf`                      | OCR             | Biology A                    | H420 |
| `ocr-alevel-chemistry-A-H432.pdf`                    | OCR             | Chemistry A                  | H432 |

## GCSE (9–1)

| File                              | Board           | Qualification | Code |
| --------------------------------- | --------------- | ------------- | ---- |
| `edexcel-gcse-biology-1BI0.pdf`   | Pearson Edexcel | Biology       | 1BI0 |
| `edexcel-gcse-chemistry-1CH0.pdf` | Pearson Edexcel | Chemistry     | 1CH0 |
| `edexcel-gcse-physics-1PH0.pdf`   | Pearson Edexcel | Physics       | 1PH0 |
| `aqa-gcse-biology-8461.pdf`       | AQA             | Biology       | 8461 |
| `aqa-gcse-chemistry-8462.pdf`     | AQA             | Chemistry     | 8462 |
| `aqa-gcse-physics-8463.pdf`       | AQA             | Physics       | 8463 |
| `ocr-gcse-biology-A-J247.pdf`     | OCR             | Biology A (Gateway Science)   | J247 |
| `ocr-gcse-chemistry-A-J248.pdf`   | OCR             | Chemistry A (Gateway Science) | J248 |
| `ocr-gcse-physics-A-J249.pdf`     | OCR             | Physics A (Gateway Science)   | J249 |

## Variants NOT downloaded

Several boards run a second, less common syllabus for a science. They are
genuinely different qualifications with different content — if a student sits
one of these, the spec above is the wrong document:

- OCR A-Level Biology B (Advancing Biology) — **H422**
- OCR A-Level Chemistry B (Salters) — **H433**
- OCR GCSE Twenty First Century Science B — **J257 / J258 / J259**. The GCSE
  files above are the Gateway Science suite (A), which is the more widely
  taught of OCR's two. Both suites key to `gcse / ocr / <subject>`, so loading
  Twenty First Century alongside Gateway would merge two different courses onto
  one confidence board — the same trap the seed README describes for Edexcel
  A-Level Biology A and B.

Edexcel A-Level Chemistry has no second variant; both Edexcel A-Level Biology
variants are here.

Not yet covered at all: Edexcel and OCR A-Level Physics (9PH0, H556), and
nothing for `level = 'igcse'` on any board.

## Mapping to the database

`topics.level` and `topics.board` must match the enum values in migration 0001:

- level: `gcse`, `igcse`, `alevel`
- board: `edexcel`, `aqa`, `ocr`

The GCSE files above are the **separate sciences**, so they are
`level = 'gcse'`. Combined Science (Edexcel 1SC0, AQA 8464, OCR J250) is a
different qualification and is deliberately out of scope — the `gcse_trilogy`
level was removed from the enum in migration 0011.
