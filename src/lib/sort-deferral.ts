/**
 * "Let me in anyway."
 *
 * The layout holds an unsorted student on /sort, which is right — until the
 * curriculum tables are empty, when there is genuinely nothing to sort and the
 * redirect becomes a loop with no exit.
 *
 * So /sort offers a way past, recorded here. Session-scoped on purpose: it
 * survives navigation but not a new login, so once the curriculum is seeded the
 * student meets the sort properly next time rather than skipping it forever.
 * `confidence_seeded_at` is never set by this path — nothing was seeded.
 */
const KEY = "hub:sort-deferred";

export function deferSort() {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(KEY, "1");
}

export function isSortDeferred(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(KEY) === "1";
}
