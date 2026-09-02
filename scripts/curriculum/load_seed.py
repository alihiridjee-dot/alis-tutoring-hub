from __future__ import annotations
"""
Load the generated curriculum into Supabase over PostgREST.

    set -a && . ./.env && set +a && python3 scripts/curriculum/load_seed.py

Reads the service role key from the environment and never prints it. The key is
required because `topics` and `spec_points` are tutor-write-only under RLS, and
this runs as a script with no signed-in tutor.

Rows are sent with `resolution=merge-duplicates`, so a reload CORRECTS existing
rows rather than skipping them. That matters because the parsers get fixed:
ids are derived from the spec point's code and stay stable, so a corrected
title lands on the same row and students' FSRS cards keep pointing at it.

The trade-off: a spec point edited by hand in the database will be overwritten
by the next load. Fix the parser and regenerate rather than editing rows.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BATCH = 200
HERE = os.path.dirname(os.path.abspath(__file__))
SEED = os.path.join(HERE, "..", "..", "supabase", "seed")


def post(url: str, key: str, table: str, rows: list) -> int:
    sent = 0
    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        body = json.dumps(chunk, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            f"{url}/rest/v1/{table}?on_conflict=id",
            data=body,
            method="POST",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(req) as resp:
                resp.read()
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:400]
            print(f"  FAILED at rows {i}-{i + len(chunk)}: HTTP {e.code} {detail}")
            raise SystemExit(1)
        sent += len(chunk)
        print(f"  {table}: {sent}/{len(rows)}", flush=True)
    return sent


def get_ids(url: str, key: str, table: str) -> set:
    ids, offset = set(), 0
    while True:
        req = urllib.request.Request(
            f"{url}/rest/v1/{table}?select=id&limit=1000&offset={offset}",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
        with urllib.request.urlopen(req) as resp:
            batch = json.loads(resp.read().decode("utf-8"))
        if not batch:
            return ids
        ids.update(r["id"] for r in batch)
        offset += len(batch)


def prune(url: str, key: str, table: str, keep: set) -> None:
    """
    Delete rows the current seed no longer produces.

    Needed because fixing a parser can REMOVE spec points as well as add them —
    Chemistry Topic 19 had 22 rows scraped out of an electrode-potential table.
    An upsert cannot remove those; only a diff can.

    Deleting a spec point cascades to student cards and reviews, so this refuses
    to run if anything would be taken with it.
    """
    stale = sorted(get_ids(url, key, table) - keep)
    if not stale:
        print(f"  {table}: nothing to prune")
        return
    print(f"  {table}: {len(stale)} stale rows to delete")
    for i in range(0, len(stale), 100):
        chunk = stale[i : i + 100]
        lst = ",".join(f'"{x}"' for x in chunk)
        req = urllib.request.Request(
            f"{url}/rest/v1/{table}?id=in.({lst})",
            method="DELETE",
            headers={"apikey": key, "Authorization": f"Bearer {key}",
                     "Prefer": "return=minimal"},
        )
        with urllib.request.urlopen(req) as resp:
            resp.read()
    print(f"  {table}: pruned {len(stale)}")


def count(url: str, key: str, table: str) -> int:
    # select=* not select=id: student_spec_point_schedule has a composite
    # primary key (student_id, spec_point_id) and no id column at all.
    req = urllib.request.Request(
        f"{url}/rest/v1/{table}?select=*",
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Prefer": "count=exact", "Range": "0-0"},
    )
    with urllib.request.urlopen(req) as resp:
        resp.read()
        cr = resp.headers.get("content-range", "0/0")
    return int(cr.split("/")[-1]) if cr.split("/")[-1].isdigit() else 0


def main() -> None:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (source .env first).")
        raise SystemExit(2)

    topics = json.load(open(os.path.join(SEED, "topics.json"), encoding="utf-8"))
    points = json.load(open(os.path.join(SEED, "spec_points.json"), encoding="utf-8"))

    # Topics first: spec_points.topic_id is a foreign key onto them.
    print(f"Loading {len(topics)} topics and {len(points)} spec points…")
    post(url, key, "topics", topics)
    post(url, key, "spec_points", points)

    if "--prune" in sys.argv:
        # Check what is actually stale BEFORE worrying about student data: a
        # reload that removes nothing is the common case, and refusing on the
        # mere existence of cards would block it for no reason.
        keep_points = {p["id"] for p in points}
        stale = get_ids(url, key, "spec_points") - keep_points
        if stale:
            cards = count(url, key, "student_spec_point_schedule")
            reviews = count(url, key, "student_spec_point_reviews")
            if cards or reviews:
                print(f"REFUSING to prune {len(stale)} stale spec points: {cards} cards "
                      f"and {reviews} reviews exist and deletion cascades to them. "
                      "Remove the stale rows by hand once you have checked what they take.")
                raise SystemExit(1)
        prune(url, key, "spec_points", keep_points)
        prune(url, key, "topics", {t["id"] for t in topics})

    print("Done.")


if __name__ == "__main__":
    main()
