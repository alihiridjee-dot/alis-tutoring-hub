#!/usr/bin/env python3
"""
Guard the parsers against the exam boards moving under them.

The parsers read the boards' own PDFs, and boards reissue those: a new version
number, a retitled column, a table that wraps differently. None of that raises
an error. The parser simply returns fewer statements, or truncated ones, and
the next seed load quietly installs a worse curriculum — which surfaces weeks
later as a student's confidence board missing half its topics.

So this asserts the one thing that catches all of it: parsing the PDFs today
must reproduce the seed that is committed, byte for byte.

Counts are checked first and reported on their own, because a count change is
the failure that actually happens and "129 points, expected 149" says more than
a diff of two thousand SQL lines. The exact-text check that follows catches the
subtler half — a title truncated at a column boundary, a marker glyph surviving
into a statement — where the count is unchanged and only the wording rots.

When a parser is deliberately improved this test SHOULD fail. The fix is to
regenerate and commit the new seed, not to relax the assertion:

    cd scripts/curriculum && python3 generate_seed.py
"""
from __future__ import annotations

import os
import sys

import generate_seed as G

SEED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "supabase", "seed")


def counts(sql: str) -> tuple[int, int]:
    return (
        sql.count("insert into public.topics "),
        sql.count("insert into public.spec_points "),
    )


def main() -> int:
    failures: list[str] = []
    checked = 0

    for stem, kind, arg, subject, board, level, label in G.SPECS:
        path = os.path.join(SEED_DIR, f"{stem}.sql")
        if not os.path.exists(path):
            failures.append(f"{label}: {stem}.sql is missing — run generate_seed.py")
            continue

        committed = open(path, encoding="utf-8").read()
        fresh, n_topics, n_points, problems = G.emit(stem, kind, arg, subject, board, level, label)

        want_t, want_p = counts(committed)
        if (n_topics, n_points) != (want_t, want_p):
            failures.append(
                f"{label}: parsed {n_topics} topics / {n_points} points, "
                f"committed seed has {want_t} / {want_p}"
            )
        elif fresh != committed:
            failures.append(
                f"{label}: counts match ({n_topics}/{n_points}) but the text differs — "
                "a statement's wording changed"
            )

        # The parsers' own validators: guidance-column bleed, runaway titles,
        # duplicate codes. Clean at the last regeneration, so any of these is new.
        for p in problems:
            failures.append(f"{label}: {p}")

        checked += 1
        print(f"  {label:52s} {n_topics:3d} topics {n_points:5d} points")

    print(f"\n{checked}/{len(G.SPECS)} specifications checked")

    if failures:
        print(f"\n{len(failures)} problem(s):\n", file=sys.stderr)
        for f in failures:
            print(f"  ! {f}", file=sys.stderr)
        print(
            "\nIf a parser was changed on purpose, regenerate and commit the seed:\n"
            "    cd scripts/curriculum && python3 generate_seed.py",
            file=sys.stderr,
        )
        return 1

    print("Every parser still reproduces its committed seed exactly.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
