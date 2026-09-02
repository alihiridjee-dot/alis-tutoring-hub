/**
 * The weekly plan builder.
 *
 * Deterministic, not AI. Given a student's spec points, their cards and their
 * confidence, it decides what next week should lead with. The same inputs
 * always give the same plan, which matters because a student who reloads on
 * Wednesday must not be shown a different week from the one they started.
 *
 * Two lanes, and the distinction is the whole point:
 *
 *   CORE  — first contact. No FSRS card exists, so the student has never been
 *           taught this. It is teaching time.
 *   FOCUS — a point coming back round. A card exists and is due or nearly due.
 *           It is revision.
 *
 * Getting that backwards tells a student they are "revisiting" something they
 * were never taught, which is the fastest way to lose their trust in the plan.
 * The test is the existence of a card, never the due date.
 */
import type { Database } from "@/integrations/supabase/types";
import { deserializeCard, masteryFromCard, type ScheduleRow } from "@/lib/fsrs";

type SpecPoint = Database["public"]["Tables"]["spec_points"]["Row"];

export type PlannerInput = {
  /** Every spec point on the student's course, in teaching order. */
  specPoints: SpecPoint[];
  /** Their existing cards, keyed by spec point. */
  schedule: Map<string, ScheduleRow>;
  /** Self-rated confidence 0–100 by spec point, seeded by the first-login sort. */
  confidence: Map<string, number>;
  /** Points already covered by an earlier week that were never completed. */
  carriedOver?: string[];
  /** How much work a week holds, in weight units. */
  capacity?: number;
  now?: Date;
};

export type PlannedPoint = {
  spec_point_id: string;
  lane: "core" | "focus";
  origin: "planned" | "carried_over";
  sort_order: number;
};

/**
 * Default weekly capacity, in `spec_points.weight` units.
 *
 * One-to-one tutoring is typically a single lesson plus homework, so a week
 * realistically carries a handful of points. Weight — not a raw count — because
 * one dense point should not be paced the same as one trivial one.
 */
export const DEFAULT_CAPACITY = 6;

/** How overdue a card must be before it outranks first-contact teaching. */
const URGENT_DAYS = 3;

/**
 * Below this confidence, the student is telling us they have not been taught it.
 *
 * The lane test cannot be "does a card exist" alone. The first-login sort seeds
 * a card for EVERY spec point on the course, so by the time the first plan is
 * built nothing is card-less and the CORE lane would always be empty — every
 * point, including ones the student put in "Not covered yet", would be labelled
 * "coming back round". That is precisely the mislabelling the lanes exist to
 * avoid, and it showed up on the very first real plan.
 *
 * 25 sits between the sort's "Not covered yet" (10) and "Shaky" (35), so a
 * point only leaves the teaching lane once the student says they have met it.
 */
const NEVER_TAUGHT_BELOW = 25;

export function buildWeeklyPlan(input: PlannerInput): PlannedPoint[] {
  const now = input.now ?? new Date();
  const capacity = input.capacity ?? DEFAULT_CAPACITY;
  const carried = new Set(input.carriedOver ?? []);

  const scored = input.specPoints.map((sp) => {
    const row = input.schedule.get(sp.id);
    const card = row ? deserializeCard(row.card) : null;
    const confidence = input.confidence.get(sp.id) ?? 50;
    // "Taught" rather than "has a card" — see NEVER_TAUGHT_BELOW.
    const hasCard = Boolean(row) && confidence >= NEVER_TAUGHT_BELOW;
    const dueInDays = row
      ? Math.round((new Date(row.due).getTime() - now.getTime()) / 86_400_000)
      : Number.POSITIVE_INFINITY;

    return {
      sp,
      hasCard,
      dueInDays,
      mastery: masteryFromCard(card),
      confidence,
      carried: carried.has(sp.id),
    };
  });

  // Anything overdue by more than a few days is a genuine gap and jumps the
  // queue. Below that threshold, teaching new material wins: a student who only
  // ever revises never gets through the specification.
  const urgent = scored
    .filter((s) => s.hasCard && s.dueInDays <= -URGENT_DAYS)
    .sort((a, b) => a.dueInDays - b.dueInDays || a.mastery - b.mastery);

  const core = scored
    .filter((s) => !s.hasCard)
    .sort(
      (a, b) =>
        // Carried-over work first, then the student's own weakest areas, then
        // the board's teaching order as the tie-break.
        Number(b.carried) - Number(a.carried) ||
        a.confidence - b.confidence ||
        a.sp.sort_order - b.sp.sort_order,
    );

  const focus = scored
    .filter((s) => s.hasCard && s.dueInDays > -URGENT_DAYS && s.dueInDays <= 7)
    .sort((a, b) => a.dueInDays - b.dueInDays || a.mastery - b.mastery);

  const picked: PlannedPoint[] = [];
  let used = 0;

  const take = (s: (typeof scored)[number], lane: "core" | "focus") => {
    const weight = Number(s.sp.weight) || 1;
    if (used + weight > capacity && picked.length > 0) return false;
    picked.push({
      spec_point_id: s.sp.id,
      lane,
      origin: s.carried ? "carried_over" : "planned",
      sort_order: picked.length,
    });
    used += weight;
    return true;
  };

  for (const s of urgent) if (!take(s, "focus")) break;

  // Interleave the rest: alternate new material and revision so a week is never
  // all teaching or all recall. Whichever list runs dry, the other fills up.
  let i = 0;
  let j = 0;
  while (used < capacity && (i < core.length || j < focus.length)) {
    const before = used;
    if (i < core.length) take(core[i++], "core");
    if (used < capacity && j < focus.length) take(focus[j++], "focus");
    if (used === before) break; // nothing fitted; stop rather than spin
  }

  return picked;
}

/**
 * Which points from last week were never reviewed, and so should carry over.
 *
 * "Completed" means a card exists AND it moved after the week began. A point
 * that was planned and taught but never graded has not actually landed, so it
 * comes back round rather than being quietly dropped.
 */
export function carryOver(
  lastWeekPoints: string[],
  schedule: Map<string, ScheduleRow>,
  weekStart: string,
): string[] {
  const boundary = new Date(`${weekStart}T00:00:00`).getTime();
  return lastWeekPoints.filter((id) => {
    const row = schedule.get(id);
    if (!row?.last_review) return true;
    return new Date(row.last_review).getTime() < boundary;
  });
}
