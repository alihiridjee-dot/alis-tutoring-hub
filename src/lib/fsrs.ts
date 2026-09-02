/**
 * The spaced-repetition engine, client side.
 *
 * The database owns the ledger and the cards (see 0004 and
 * `record_reviews_atomic`); this module owns the maths that decides what a card
 * becomes. Callers fold a batch of grades in memory here and send the finished
 * cards to the RPC in ONE call — never a ledger write followed by a card write,
 * which can strand a ledger row whose card never advanced.
 *
 * Four rules carried over from the model this is ported from, all load-bearing:
 *
 *   1. Retention is 0.9. Not tuned per student — there is nowhere near enough
 *      review volume in one-to-one tutoring to fit a personal curve, and a
 *      half-fitted curve is worse than the default.
 *   2. This is a WEEKLY engine, not a flashcard one. See `enable_short_term`
 *      and {@link MIN_INTERVAL_DAYS} below.
 *   3. Strength is read off STABILITY, never off the due date — because rule 2
 *      floors every due date a week out, so "not due yet" stops meaning
 *      anything. See {@link STRONG_STABILITY_DAYS}.
 *   4. What the student SAID anchors mastery; the card adjusts it. See
 *      {@link pointMastery}.
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";

import type { Database } from "@/integrations/supabase/types";

export type ScheduleRow = Database["public"]["Tables"]["student_spec_point_schedule"]["Row"];
export type ReviewSource = "homework" | "confidence";

/**
 * Deterministic, weekly, exam-horizon scheduling.
 *
 * `enable_short_term: false` is what makes this a planner rather than a
 * flashcard app. Out of the box FSRS has learning steps of 1 and 10 MINUTES: a
 * student who rated a topic "Getting there" got it back seven minutes later,
 * which is right for someone drilling cards all afternoon and wrong for someone
 * who opens their plan once a week. With short-term off there are no sub-day
 * steps at all and a card goes straight into review with an interval in days.
 *
 * `enable_fuzz: false` so the same history always produces the same due date —
 * the plan has to be reproducible for tests and previews. `maximum_interval:
 * 365` so nothing is ever scheduled past the exam horizon.
 */
const params = generatorParameters({
  request_retention: 0.9,
  enable_fuzz: false,
  maximum_interval: 365,
  enable_short_term: false,
});
const engine = fsrs(params);

/**
 * Nothing is due sooner than the student's next visit.
 *
 * Even without minute-level steps FSRS thinks in days, and a shaky point wants
 * to come back in one or two. That is correct memory science and useless here:
 * the plan is a weekly grid seen once a week, so a card due on Wednesday is
 * simply "overdue" by the time anyone looks and the whole course piles into one
 * week. Flooring at a week aligns the engine's cadence with the product's. It
 * only ever pushes a due date LATER, so a mature card's long interval is
 * untouched, and stability/difficulty are never altered — FSRS still computes
 * those from the real elapsed time at the next review.
 */
export const MIN_INTERVAL_DAYS = 7;

/**
 * How long a card must hold before it reads as genuinely strong.
 *
 * This exists because of the floor above. Once every card is pushed at least a
 * week out, "not due yet" is true of a point the student has just flagged as
 * hopeless and of one they have aced four times alike — so anything derived
 * from the due date calls both of them strong. Stability is the honest measure:
 * it is how many days FSRS thinks the memory survives, and the flooring never
 * touches it. Two weeks is the bar — one full cycle beyond the cadence we
 * schedule on.
 */
export const STRONG_STABILITY_DAYS = 2 * MIN_INTERVAL_DAYS;

/** The shape `record_reviews_atomic` expects, one per graded event. */
export type ReviewPayload = {
  student_id: string;
  spec_point_id: string;
  rating: number;
  source: ReviewSource;
  score_pct: number | null;
  /** Submission id for homework; NULL for confidence, which must always insert. */
  source_id: string | null;
  reviewed_at: string;
  card: SerialCard;
  due: string;
};

/** `card` is stored as jsonb, so Dates have to survive a round trip as strings. */
export type SerialCard = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
};

export function serializeCard(card: Card): SerialCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : undefined,
  };
}

export function deserializeCard(raw: unknown): Card {
  const c = raw as SerialCard | null;
  if (!c || typeof c !== "object" || !("due" in c)) return createEmptyCard<Card>(new Date());
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps ?? 0,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as State,
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  };
}

/**
 * Confidence (0–100) → an FSRS grade.
 *
 * The bands are wide on purpose. A self-rating is a coarse signal — a student
 * saying "60" does not mean anything finer than "middling" — so mapping it onto
 * four buckets is as much precision as the input actually carries.
 */
export function confidenceToRating(confidence: number): Grade {
  if (confidence < 25) return Rating.Again;
  if (confidence < 50) return Rating.Hard;
  if (confidence < 80) return Rating.Good;
  return Rating.Easy;
}

/**
 * A homework percentage → an FSRS grade.
 *
 * Below 40% is a genuine lapse: the card goes back to relearning rather than
 * merely being scheduled sooner, because the student did not have the material.
 */
export function scoreToRating(scorePct: number): Grade {
  if (scorePct < 40) return Rating.Again;
  if (scorePct < 60) return Rating.Hard;
  if (scorePct < 85) return Rating.Good;
  return Rating.Easy;
}

/**
 * Apply one grade to a card (or to a fresh card, if this point has never been
 * seen), with the due date floored to {@link MIN_INTERVAL_DAYS}.
 *
 * `countsAsLapse: false` leaves the lapse counter where it was. A lapse is meant
 * to mean "knew it, then got it wrong" — evidence from a mark. A student
 * dragging a topic into "Needs work" is being honest, and that already shortens
 * the interval on its own (FSRS schedules from stability, difficulty and
 * retrievability — never the lapse count, which is only bookkeeping). Charging
 * a lapse on top of it taxes honesty, permanently.
 */
export function gradeCard(
  existing: Card | null,
  grade: Grade,
  when: Date,
  { countsAsLapse = true }: { countsAsLapse?: boolean } = {},
): Card {
  // createEmptyCard is generic in its return type, so without pinning it here
  // TypeScript infers it from the union and hands back `Card | null`.
  const base: Card = existing ?? createEmptyCard<Card>(when);
  const next = engine.next(base, when, grade).card;
  const floor = when.getTime() + MIN_INTERVAL_DAYS * 86_400_000;
  return {
    ...next,
    due: next.due.getTime() >= floor ? next.due : new Date(floor),
    lapses: countsAsLapse ? next.lapses : base.lapses,
  };
}

/** Build the RPC payload for a single graded event. */
export function buildReview(input: {
  studentId: string;
  specPointId: string;
  existing: Card | null;
  grade: Grade;
  source: ReviewSource;
  scorePct?: number | null;
  sourceId?: string | null;
  when?: Date;
}): ReviewPayload {
  const when = input.when ?? new Date();
  // A self-rating is not a failed recall, so it never counts as a lapse.
  const card = gradeCard(input.existing, input.grade, when, {
    countsAsLapse: input.source !== "confidence",
  });
  return {
    student_id: input.studentId,
    spec_point_id: input.specPointId,
    rating: input.grade,
    source: input.source,
    score_pct: input.scorePct ?? null,
    source_id: input.sourceId ?? null,
    reviewed_at: when.toISOString(),
    card: serializeCard(card),
    due: card.due.toISOString(),
  };
}

/**
 * Where a spec point sits on its learning curve.
 *
 *  • `new`      — never touched (no card yet).
 *  • `due`      — practised, but due or overdue for another look; a flop lands here.
 *  • `learning` — bedding in: the memory does not hold for
 *                 {@link STRONG_STABILITY_DAYS} yet, so a freshly rated point
 *                 sits here whatever its due date says.
 *  • `strong`   — holds for a fortnight or more and is not due. It is sticking.
 */
export type PointStatus = "new" | "due" | "learning" | "strong";

export function pointStatus(card: Card | null, now: Date = new Date()): PointStatus {
  if (!card || card.state === State.New) return "new";
  if (card.due.getTime() <= now.getTime()) return "due"; // overdue trumps the raw state
  // Strength is what the card holds, not when we happened to schedule it.
  if (
    card.state === State.Learning ||
    card.state === State.Relearning ||
    card.stability < STRONG_STABILITY_DAYS
  )
    return "learning";
  return "strong";
}

/**
 * How much a due point loses per week it sits unreviewed, and the most it can
 * lose that way. Being due is a prompt to look again, not evidence of
 * ignorance — so a point that came due yesterday is barely marked down, while
 * one ignored for six weeks slides a full band.
 */
export const DUE_STALENESS_PER_WEEK = 5;
export const DUE_STALENESS_MAX = 25;

/**
 * What a lapse costs, and the most lapses can cost in total.
 *
 * Capped, and deliberately absent from the `strong` branch: a lapse has already
 * collapsed the card's stability, and that branch is *made of* stability, so
 * charging again there would price the same mistake twice. Leaving it out is
 * also the way back — a point re-learned until it reads strong sheds the
 * penalty entirely, which a permanent tax never allowed.
 */
export const LAPSE_PENALTY = 5;
export const LAPSE_PENALTY_MAX = 15;

function lapsePenalty(card: Card): number {
  return Math.min(LAPSE_PENALTY_MAX, (card.lapses ?? 0) * LAPSE_PENALTY);
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Mastery, 0–100, for one spec point.
 *
 * **What the student said is the anchor, not a garnish.** Deriving mastery from
 * stability alone looked principled and made the board unable to agree with the
 * plan: a fresh card graded Easy has ~8 days of stability, so a topic dragged
 * into *Confident* scored 49 — under the 67 settled line. A student could rate
 * the entire course Confident and watch the planner insist nothing was settled,
 * forever, with no way to say otherwise. Confidence now sets the level and the
 * card's state adjusts it, so the two surfaces tell one story.
 *
 * With no self-rating at all — a point only ever touched by homework — we start
 * from neutral rather than zero: the marks have already moved the card, and
 * scoring silence as ignorance would bury it.
 */
export function pointMastery(
  card: Card | null,
  confidence: number | null = null,
  now: Date = new Date(),
): number {
  if (!card || card.state === State.New) return clampScore(confidence ?? 0);
  const penalty = lapsePenalty(card);
  const stated = confidence ?? 50;
  switch (pointStatus(card, now)) {
    case "due": {
      const weeksOverdue = Math.max(0, (now.getTime() - card.due.getTime()) / (7 * 86_400_000));
      const staleness = Math.min(DUE_STALENESS_MAX, weeksOverdue * DUE_STALENESS_PER_WEEK);
      return clampScore(stated - 5 - staleness - penalty);
    }
    case "learning":
      // Bedding in: not due, but not holding either. What the student says is
      // the best evidence there is, so a point they have just called shaky
      // scores shaky.
      return clampScore(stated - 3 - penalty);
    default:
      // Strong. No lapse penalty here on purpose — stability already carries it.
      return clampScore(70 + Math.min(30, card.stability / 2));
  }
}

/** Mastery for a card. Alias of {@link pointMastery}, kept for readability at call sites. */
export function masteryFromCard(
  card: Card | null,
  confidence: number | null = null,
  now: Date = new Date(),
): number {
  return pointMastery(card, confidence, now);
}

/**
 * Mastery straight from a stored row, for list views that never build a Card.
 *
 * `confidence` is optional so surfaces that have not loaded the student's
 * ratings still compile — but pass it wherever it is to hand, or the point
 * falls back to the neutral 50 and the number stops matching the board.
 */
export function masteryFromRow(
  row: Pick<ScheduleRow, "card"> | null | undefined,
  confidence: number | null = null,
  now: Date = new Date(),
): number {
  if (!row) return clampScore(confidence ?? 0);
  return pointMastery(deserializeCard(row.card), confidence, now);
}

/** FSRS retrievability: the chance (0–1) they could recall this right now. */
export function retrievability(card: Card | null, now: Date = new Date()): number | null {
  if (!card || card.state === State.New) return null;
  return engine.get_retrievability(card, now, false);
}

export type MasteryBand = "unseen" | "shaky" | "building" | "secure";

export function masteryBand(mastery: number, hasCard: boolean): MasteryBand {
  if (!hasCard) return "unseen";
  if (mastery < 30) return "shaky";
  if (mastery < 70) return "building";
  return "secure";
}

export const BAND_LABEL: Record<MasteryBand, string> = {
  unseen: "Not started",
  shaky: "Needs work",
  building: "Building",
  secure: "Secure",
};

/** Tailwind classes per band, so every surface colours mastery identically. */
export const BAND_CLASS: Record<MasteryBand, string> = {
  unseen: "bg-muted text-muted-foreground",
  shaky: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
  building: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  secure: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
};

export { Rating, State };
export type { Card, Grade };
