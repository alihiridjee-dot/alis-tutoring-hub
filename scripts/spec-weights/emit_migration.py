from __future__ import annotations
"""
Turn out/weights.json into a migration that updates the live curriculum.

The seed files carry the weights too, but every insert in them is
`on conflict (id) do nothing` — deliberately, so re-running a seed never
rewrites a spec point a student's cards already point at. That also means a
re-run cannot deliver a *changed* weight to a database that already has the
row, which is every environment past the first load. Hence a migration.

    python3 scripts/spec-weights/emit_migration.py > \
        supabase/migrations/0013_spec_point_weights.sql

Idempotent, and safe to run against a database missing some of these points:
the update matches on id and simply affects fewer rows.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

HEAD = """\
-- Per-spec-point workload, so the planner can pace a course by how much work
-- it is rather than by how many rows it has.
--
-- Every point shipped at weight 1, which made `spec_points.weight` a column
-- the planner could read but never learn anything from: a topic of twelve
-- one-line recall statements outranked one with eight practicals, and a week
-- was "six points" whether that meant six definitions or six investigations.
--
-- Scored offline from each board's own specification by
-- scripts/spec-weights/score.py, normalised per course to a mean of 1.0 — only
-- the ratios within one course mean anything, since the planner uses them to
-- divide that course's fixed number of weeks. Regenerate with:
--
--   python3 scripts/spec-weights/score.py
--   python3 scripts/spec-weights/emit_migration.py > <this file>
--
-- A point not listed here keeps weight 1 and plans exactly as it did before.

begin;

update public.spec_points as sp
set weight = v.weight
from (values
"""

TAIL = """\
) as v(id, weight)
where sp.id = v.id::uuid and sp.weight is distinct from v.weight;

commit;
"""


def main():
    weights = json.load(open(os.path.join(HERE, "out", "weights.json")))
    rows = ",\n".join(
        f"  ('{pid}', {weight})" for pid, weight in sorted(weights.items())
    )
    print(HEAD + rows + "\n" + TAIL, end="")


if __name__ == "__main__":
    main()
