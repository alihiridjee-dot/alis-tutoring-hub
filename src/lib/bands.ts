import { useState } from "react";

/**
 * The four bands, and the confidence each records.
 *
 * Values sit in the middle of `confidenceToRating`'s bands so a student's
 * answer survives the trip to an FSRS grade without landing on a boundary.
 * The same four are used everywhere — sort, board, spec point — so the scale
 * never changes meaning between screens.
 *
 * `new` is the odd one out and is rendered differently: it is where every topic
 * starts, so on the board it is the tray across the top rather than a fourth
 * column. Three columns is what the sort actually asks — "of the things you HAVE
 * covered, how do they sit?" — and a tray reads as a queue to be emptied, which
 * is the job. See {@link COLUMNS}.
 */
export const BANDS = [
  {
    id: "new",
    label: "Not covered yet",
    confidence: 10,
    hint: "We haven't done this",
    accent: "text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
  {
    id: "shaky",
    label: "Needs work",
    confidence: 35,
    hint: "Covered it, don't trust it",
    accent: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  {
    id: "ok",
    label: "Getting there",
    confidence: 65,
    hint: "Mostly fine",
    accent: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  {
    id: "strong",
    label: "Confident",
    confidence: 90,
    hint: "Could answer on this now",
    accent: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
] as const;

export type BandId = (typeof BANDS)[number]["id"];
export type BandMeta = (typeof BANDS)[number];

/**
 * The three sortable columns, most confident first — that is how the board reads
 * left to right, so the strongest work is where the eye lands and the pile that
 * needs attention sits at the end rather than leading with failure.
 */
export const COLUMNS: BandMeta[] = [
  BANDS.find((b) => b.id === "strong")!,
  BANDS.find((b) => b.id === "ok")!,
  BANDS.find((b) => b.id === "shaky")!,
];

export const UNSORTED: BandMeta = BANDS.find((b) => b.id === "new")!;

export function bandById(id: BandId): BandMeta {
  return BANDS.find((b) => b.id === id) ?? UNSORTED;
}

export function bandOf(confidence: number | undefined): BandId {
  if (confidence === undefined) return "new";
  let best: BandId = "new";
  for (const b of BANDS) if (confidence >= b.confidence) best = b.id;
  return best;
}

/**
 * A colour ramp for a raw 0–100 value, used by the rings.
 *
 * Hard-coded hexes rather than theme tokens because an SVG stroke cannot take a
 * Tailwind class, and these three are the same red/amber/green the dots and
 * mastery pills use. Thresholds match {@link BANDS}' midpoints, so a card
 * dropped in a column is drawn in that column's colour.
 */
export function confidenceColor(value: number): string {
  if (value >= 67) return "#10b981"; // emerald-500
  if (value >= 34) return "#f59e0b"; // amber-500
  return "#f43f5e"; // rose-500
}

/** Shared band-placement state, so seed and live modes behave identically. */
export function useBoardState(initial: Record<string, BandId> = {}) {
  const [placement, setPlacement] = useState<Record<string, BandId>>(initial);
  const [order, setOrder] = useState<Record<BandId, string[]>>({
    new: [],
    shaky: [],
    ok: [],
    strong: [],
  });

  const move = (topicId: string, to: BandId) => {
    setPlacement((p) => ({ ...p, [topicId]: to }));
    setOrder((o) => {
      const next: Record<BandId, string[]> = {
        new: o.new.filter((id) => id !== topicId),
        shaky: o.shaky.filter((id) => id !== topicId),
        ok: o.ok.filter((id) => id !== topicId),
        strong: o.strong.filter((id) => id !== topicId),
      };
      next[to] = [...next[to], topicId];
      return next;
    });
  };

  // No reordering inside a column: a column is a set, not a ranking. `order`
  // survives only because the sort's commit writes it as `sort_index`, which is
  // a tie-break, not something the student is asked to curate.
  return { placement, setPlacement, order, setOrder, move };
}
