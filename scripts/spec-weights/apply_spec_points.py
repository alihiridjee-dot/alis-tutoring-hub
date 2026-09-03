from __future__ import annotations
"""
Push the spec points' TITLE and WEIGHT into a live database over PostgREST.

    set -a && . ./.env && set +a && python3 scripts/spec-weights/apply_spec_points.py
    set -a && . ./.env && set +a && python3 scripts/spec-weights/apply_spec_points.py --write

Dry run unless `--write` is given. Idempotent: re-running it changes nothing.

Titles as well as weights because the two move together: fixing a parser changes
what a spec point SAYS, and a statement's wording is what its weight is scored
from. Shipping one without the other leaves the database disagreeing with itself.

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
to a spec point. So this PATCHes named columns and touches nothing else.

Weights are grouped by value rather than sent per row: there are ~175 distinct
weights across 2,965 points, so that is ~175 requests instead of 2,965. Titles
are unique, so they go one at a time — but only the handful that actually
changed, which is the point of diffing first.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
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


def live_rows(url: str, key: str) -> dict[str, dict]:
    out, offset = {}, 0
    while True:
        rows = request(url, key, f"spec_points?select=id,title,weight&limit=1000&offset={offset}")
        if not rows:
            return out
        for r in rows:
            out[r["id"]] = {"title": r["title"], "weight": float(r["weight"])}
        offset += len(rows)


def main() -> None:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (source .env first).")
        raise SystemExit(2)

    seed = json.load(
        open(os.path.join(ROOT, "supabase", "seed", "spec_points.json"), encoding="utf-8")
    )
    want = {p["id"]: p for p in seed}
    live = live_rows(url, key)
    print(f"{len(want)} spec points in the seed | {len(live)} rows in the database")

    # A seeded point that is not there means the seed and the database have
    # diverged, and writing the rest would leave a half-updated course.
    missing = sorted(set(want) - set(live))
    if missing:
        print(f"REFUSING: {len(missing)} seeded points have no row. Load the seed first.")
        print("  " + ", ".join(missing[:5]) + (" …" if len(missing) > 5 else ""))
        raise SystemExit(1)

    extra = set(live) - set(want)
    if extra:
        print(f"note: {len(extra)} rows are not in the seed and are left alone")

    by_weight = defaultdict(list)
    titles: list[tuple[str, str]] = []
    for pid, p in want.items():
        if abs(live[pid]["weight"] - float(p["weight"])) > 1e-9:
            by_weight[float(p["weight"])].append(pid)
        if live[pid]["title"] != p["title"]:
            titles.append((pid, p["title"]))
    n_weights = sum(len(v) for v in by_weight.values())

    print(f"{n_weights} weights and {len(titles)} titles would change")
    for pid, t in titles[:8]:
        print(f"  {want[pid]['code']}: {live[pid]['title'][:52]}…  ->  {t[:52]}…")
    if len(titles) > 8:
        print(f"  … and {len(titles) - 8} more")
    if "--write" not in sys.argv:
        print("\nDry run. Re-run with --write to apply.")
        return
    if not n_weights and not titles:
        print("Nothing to do.")
        return

    done = 0
    for w, ids in sorted(by_weight.items()):
        for i in range(0, len(ids), CHUNK):
            chunk = ids[i : i + CHUNK]
            lst = ",".join(f'"{x}"' for x in chunk)
            request(
                url, key, f"spec_points?id=in.({lst})",
                method="PATCH", body={"weight": w},
                extra={"Prefer": "return=minimal"},
            )
            done += len(chunk)
            print(f"  weights {done}/{n_weights}", end="\r", flush=True)
    if n_weights:
        print(f"  weights {done}/{n_weights} written." + " " * 12)

    for n, (pid, t) in enumerate(titles, 1):
        request(
            url, key, f"spec_points?id=eq.{pid}",
            method="PATCH", body={"title": t},
            extra={"Prefer": "return=minimal"},
        )
        print(f"  titles {n}/{len(titles)}", end="\r", flush=True)
    if titles:
        print(f"  titles {len(titles)}/{len(titles)} written." + " " * 12)

    after = live_rows(url, key)
    wrong = [
        p["code"]
        for pid, p in want.items()
        if after[pid]["title"] != p["title"]
        or abs(after[pid]["weight"] - float(p["weight"])) > 1e-9
    ]
    if wrong:
        print(f"VERIFY FAILED: {len(wrong)} rows do not match ({', '.join(wrong[:5])}). Re-run.")
        raise SystemExit(1)
    vals = sorted(r["weight"] for r in after.values())
    print(
        f"Verified {len(want)} spec points. Live weights: min {vals[0]}, "
        f"median {vals[len(vals) // 2]}, max {vals[-1]}."
    )


if __name__ == "__main__":
    main()
