from __future__ import annotations
"""
Push out/weights.json into a live database over PostgREST.

    set -a && . ./.env && set +a && python3 scripts/spec-weights/apply_weights.py
    set -a && . ./.env && set +a && python3 scripts/spec-weights/apply_weights.py --write

Dry run unless `--write` is given. Idempotent: re-running it changes nothing.

WHY NOT THE MIGRATION, OR THE SEED LOADER
-----------------------------------------
`supabase/migrations/0013_spec_point_weights.sql` says the same thing and is the
right artefact for a fresh environment. This exists because neither route
reaches an already-loaded database from here: the CLI is signed into the other
Supabase account, and the MCP connector would have to carry 2,965 rows of SQL
through a model's context to run it.

`scripts/curriculum/load_seed.py` does reach it, but it upserts WHOLE ROWS from
`spec_points.json` — and that file has no `video_url`, because the parsers never
produce one. Upserting through it would blank every video a tutor has attached
to a spec point. So this PATCHes one column and touches nothing else.

Grouped by value rather than sent per row: there are ~175 distinct weights
across 2,965 points, so this is ~175 requests instead of 2,965.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
#: PostgREST puts the id list in the URL, so the chunk has to stay well inside
#: any server or proxy URL limit. 36-char uuids plus quoting is ~40 bytes each.
CHUNK = 120


def request(url: str, key: str, path: str, method="GET", body=None, extra=None):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    headers.update(extra or {})
    req = urllib.request.Request(
        f"{url}/rest/v1/{path}",
        data=json.dumps(body).encode("utf-8") if body is not None else None,
        method=method,
        headers=headers,
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        print(f"  FAILED: HTTP {e.code} {detail}")
        raise SystemExit(1)


def live_weights(url: str, key: str) -> dict[str, float]:
    out, offset = {}, 0
    while True:
        rows = request(url, key, f"spec_points?select=id,weight&limit=1000&offset={offset}")
        if not rows:
            return out
        for r in rows:
            out[r["id"]] = float(r["weight"])
        offset += len(rows)


def main() -> None:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (source .env first).")
        raise SystemExit(2)

    weights = {k: float(v) for k, v in json.load(open(os.path.join(HERE, "out", "weights.json"))).items()}
    live = live_weights(url, key)
    print(f"{len(weights)} scored points | {len(live)} rows in the database")

    # A weight for a point that is not there means the seed and the database
    # have diverged, and writing the rest would leave a half-weighted course.
    missing = sorted(set(weights) - set(live))
    if missing:
        print(f"REFUSING: {len(missing)} scored points have no row. Reload the seed first.")
        print("  " + ", ".join(missing[:5]) + (" …" if len(missing) > 5 else ""))
        raise SystemExit(1)

    unscored = set(live) - set(weights)
    if unscored:
        print(f"note: {len(unscored)} rows have no score and keep the weight they have")

    todo = defaultdict(list)
    for pid, w in weights.items():
        if abs(live[pid] - w) > 1e-9:
            todo[w].append(pid)
    changing = sum(len(v) for v in todo.values())

    print(f"{changing} rows would change, across {len(todo)} distinct weights")
    if changing:
        lo, hi = min(todo), max(todo)
        print(f"  new weights run {lo} … {hi}")
    if "--write" not in sys.argv:
        print("\nDry run. Re-run with --write to apply.")
        return
    if not changing:
        print("Nothing to do.")
        return

    done = 0
    for w, ids in sorted(todo.items()):
        for i in range(0, len(ids), CHUNK):
            chunk = ids[i : i + CHUNK]
            lst = ",".join(f'"{x}"' for x in chunk)
            request(
                url, key, f"spec_points?id=in.({lst})",
                method="PATCH", body={"weight": w},
                extra={"Prefer": "return=minimal"},
            )
            done += len(chunk)
            print(f"  {done}/{changing}", end="\r", flush=True)
    print(f"  {done}/{changing} written." + " " * 12)

    after = live_weights(url, key)
    wrong = [p for p, w in weights.items() if abs(after[p] - w) > 1e-9]
    if wrong:
        print(f"VERIFY FAILED: {len(wrong)} rows do not match. Re-run.")
        raise SystemExit(1)
    vals = sorted(after.values())
    print(
        f"Verified {len(weights)} weights. Live spread: min {vals[0]}, "
        f"median {vals[len(vals) // 2]}, max {vals[-1]}."
    )


if __name__ == "__main__":
    main()
