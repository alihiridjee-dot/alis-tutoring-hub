/**
 * The year programme: what gets taught when, anchored on the exam date.
 *
 * Two layers, and keeping them apart is the whole design:
 *
 *   FSRS (`fsrs.ts`) decides WHICH points are weak or urgent. Retention-driven,
 *   knows nothing about the calendar.
 *   Pacing (this file) decides WHEN on the calendar. Exam-anchored, knows
 *   nothing about memory strength.
 *
 * The year plan owns the week. A week is a slice of the programme, never an
 * independently ranked list — two planners over one student is what produced
 * the "why is a healthy topic in Focused?" class of bug before.
 *
 * Everything here is pure and deterministic: the same inputs always give the
 * same bands, so a student who reloads on Wednesday sees the week they started.
 */
import type { Database } from "@/integrations/supabase/types";
import { mondayOf, toDateKey, addWeeks } from "@/lib/week";

type Topic = Database["public"]["Tables"]["topics"]["Row"];

/** Weeks held back before the exam for revision rather than new teaching. */
export const REVISION_WEEKS = 3;

/**
 * How many spec points the revisit lane may carry in one week.
 *
 * FSRS resurfaces everything the moment it is rated, which would flood a single
 * week. This budget caps the REVISIT lane only — never the teaching spine,
 * whose weekly share is added on top. One shared cap starves teaching entirely
 * while any backlog exists.
 */
export const FOCUS_BUDGET = 6;

export type Band = {
  topicId: string;
  title: string;
  /** Monday of the first week this topic is taught. */
  startWeek: string;
  /** Monday of the last week (inclusive). */
  endWeek: string;
  weeks: number;
  pointCount: number;
  kind: "teach" | "revision";
};

export type PacingInput = {
  topics: Topic[];
  pointCountByTopic: Map<string, number>;
  /** Monday teaching began. */
  programStart: string;
  examDate: string;
  /** Topics already settled — locked at their ideal position, not re-flowed. */
  coveredTopicIds?: Set<string>;
  now?: Date;
};

/** Whole weeks from `from` to `to`, never negative. */
function weeksBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / (7 * 86_400_000)));
}

/**
 * Spread topics across the available weeks, proportional to their size.
 *
 * Largest-remainder rather than naive rounding: rounding each share
 * independently loses or invents whole weeks, and the last topic silently
 * absorbs the error — which in practice meant the final topic before the exam
 * got either three weeks or none.
 */
export function distributeWeeks(sizes: number[], totalWeeks: number): number[] {
  const n = sizes.length;
  if (n === 0) return [];
  if (totalWeeks <= n) return sizes.map(() => 1);

  const total = sizes.reduce((a, b) => a + b, 0) || n;
  // Every topic gets at least one week; the rest is shared out by size.
  const spare = totalWeeks - n;
  const exact = sizes.map((s) => (s / total) * spare);
  const base = exact.map(Math.floor);
  let left = spare - base.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  for (const { i } of order) {
    if (left <= 0) break;
    base[i] += 1;
    left -= 1;
  }
  return base.map((b) => b + 1);
}

/**
 * The programme: one band per topic, plus a revision band before the exam.
 *
 * Covered topics keep their ideal slot; everything still pending re-flows from
 * whichever is later, the programme start or today. That is what makes a slip
 * push the rest of the year back rather than quietly compressing it.
 */
export function computePacing(input: PacingInput): Band[] {
  const now = input.now ?? new Date();
  const examMonday = toDateKey(mondayOf(new Date(`${input.examDate}T00:00:00`)));
  const revisionStart = addWeeks(examMonday, -REVISION_WEEKS);

  const topics = input.topics.slice().sort((a, b) => a.sort_order - b.sort_order);
  if (topics.length === 0) return [];

  const covered = input.coveredTopicIds ?? new Set<string>();
  const thisMonday = toDateKey(mondayOf(now));
  // Never plan into the past: a student joining in March does not get October.
  const flowStart = input.programStart > thisMonday ? input.programStart : thisMonday;

  const teachingWeeks = Math.max(topics.length, weeksBetween(flowStart, revisionStart));
  const sizes = topics.map((t) => input.pointCountByTopic.get(t.id) ?? 1);
  const spans = distributeWeeks(sizes, teachingWeeks);

  const bands: Band[] = [];
  let cursor = flowStart;

  topics.forEach((topic, i) => {
    const weeks = spans[i];
    // A settled topic is not re-taught, so it does not consume weeks — but it
    // keeps a band so the roadmap can still show it as done.
    if (covered.has(topic.id)) {
      bands.push({
        topicId: topic.id,
        title: topic.title,
        startWeek: cursor,
        endWeek: cursor,
        weeks: 0,
        pointCount: sizes[i],
        kind: "teach",
      });
      return;
    }
    bands.push({
      topicId: topic.id,
      title: topic.title,
      startWeek: cursor,
      endWeek: addWeeks(cursor, weeks - 1),
      weeks,
      pointCount: sizes[i],
      kind: "teach",
    });
    cursor = addWeeks(cursor, weeks);
  });

  bands.push({
    topicId: "__revision__",
    title: "Revision and past papers",
    startWeek: revisionStart,
    endWeek: examMonday,
    weeks: REVISION_WEEKS,
    pointCount: 0,
    kind: "revision",
  });

  return bands;
}

/**
 * How many weeks the teaching overruns the revision window, if any.
 *
 * Every topic needs at least one week, so a course with more topics than there
 * are weeks before the exam cannot be made to fit. Rather than silently
 * scheduling past the exam date — which is what a naive cursor does — this
 * reports the shortfall so the tutor can see it and act: move the exam, drop
 * the revision reserve, or accept that some topics are self-study.
 */
export function overrunWeeks(bands: Band[], examDate: string): number {
  const teach = bands.filter((b) => b.kind === "teach" && b.weeks > 0);
  if (teach.length === 0) return 0;
  const lastEnd = teach[teach.length - 1].endWeek;
  const examMonday = toDateKey(mondayOf(new Date(`${examDate}T00:00:00`)));
  const revisionStart = addWeeks(examMonday, -REVISION_WEEKS);
  return weeksBetween(revisionStart, lastEnd);
}

/** Which band, if any, owns a given week. */
export function bandForWeek(bands: Band[], weekStart: string): Band | undefined {
  return bands.find((b) => b.weeks > 0 && weekStart >= b.startWeek && weekStart <= b.endWeek);
}

/**
 * A stable signature of the band layout, for change detection.
 *
 * Only the things a student would notice: which topic, which weeks. Point
 * counts move as the tutor edits the curriculum and must not read as "your
 * plan has shifted".
 */
export function signatureOf(bands: Band[]): string {
  return bands.map((b) => `${b.topicId}:${b.startWeek}:${b.endWeek}`).join("|");
}

export type PacingDiff = {
  changed: boolean;
  moved: { title: string; from: string; to: string }[];
};

/**
 * What changed between the plan the student agreed to and the live one.
 *
 * Shown as an explicit "your plan has shifted" prompt rather than applied
 * silently: the roadmap re-flows whenever they fall behind, and a schedule that
 * rearranges itself without saying so is one nobody trusts.
 */
export function diffPacing(baseline: Band[], live: Band[]): PacingDiff {
  if (baseline.length === 0) return { changed: false, moved: [] };
  const before = new Map(baseline.map((b) => [b.topicId, b]));
  const moved: PacingDiff["moved"] = [];

  for (const b of live) {
    const was = before.get(b.topicId);
    if (!was || was.startWeek === b.startWeek) continue;
    moved.push({ title: b.title, from: was.startWeek, to: b.startWeek });
  }
  return { changed: moved.length > 0, moved };
}

// ── Turning the programme into one week ──────────────────────────────────────

export type WeekPoint = {
  spec_point_id: string;
  lane: "core" | "focus";
  origin: "planned" | "carried_over";
  sort_order: number;
};

export type WeekInput = {
  bands: Band[];
  weekStart: string;
  /** Spec points grouped by topic, in teaching order. */
  pointsByTopic: Map<string, { id: string; sort_order: number }[]>;
  /** Confidence 0–100 per spec point, from the sort and any re-rating. */
  confidence: Map<string, number>;
  /** Stability in days per spec point; absent means no card yet. */
  stability: Map<string, number>;
  /** Points already settled and not needing teaching. */
  settled: Set<string>;
  focusBudget?: number;
};

/**
 * Below this confidence the student is telling us they have not been taught it.
 *
 * The lane test cannot be "does a card exist": the first-login sort seeds a card
 * for every point on the course, so nothing is card-less by the time the first
 * plan is built, and every point — including ones just marked "not covered yet"
 * — would be labelled as coming back round.
 */
export const NEVER_TAUGHT_BELOW = 25;

/**
 * Order points weakest-first by STABILITY, not mastery.
 *
 * A student who drags a whole topic into one band gives every point in it an
 * identical confidence, so ranking on mastery degrades silently to spec order.
 * Stability separates them — it is the only signal that reflects what actually
 * happened to each card. No card at all is the most fragile state there is: a
 * self-rating is not evidence.
 */
export function byFragility(
  a: string,
  b: string,
  stability: Map<string, number>,
  confidence: Map<string, number>,
): number {
  const sa = stability.get(a) ?? -1;
  const sb = stability.get(b) ?? -1;
  if (sa !== sb) return sa - sb;
  return (confidence.get(a) ?? 50) - (confidence.get(b) ?? 50);
}

/**
 * The week's work: a slice of the programme, plus what needs revisiting.
 *
 * Two lanes with SEPARATE budgets. The focus budget caps revision only — the
 * teaching spine's share is added on top, because a single shared cap starves
 * teaching entirely for as long as any backlog exists, and the student never
 * gets through the specification.
 */
export function selectWeekPoints(input: WeekInput): WeekPoint[] {
  const budget = input.focusBudget ?? FOCUS_BUDGET;
  const picked: WeekPoint[] = [];
  const taken = new Set<string>();

  // ── Teaching spine ─────────────────────────────────────────────────────────
  // Everything owed up to and including this week that is still unsettled, in
  // curriculum order. Stragglers lead: slicing by week index would shift as
  // points settle and silently step over undone ones.
  const owed: string[] = [];
  for (const band of input.bands) {
    if (band.kind !== "teach" || band.weeks === 0) continue;
    if (band.startWeek > input.weekStart) continue;
    for (const p of input.pointsByTopic.get(band.topicId) ?? []) {
      if (!input.settled.has(p.id)) owed.push(p.id);
    }
  }

  const current = bandForWeek(input.bands, input.weekStart);
  const share = current
    ? Math.max(
        1,
        Math.ceil((input.pointsByTopic.get(current.topicId)?.length ?? 0) / current.weeks),
      )
    : 0;

  for (const id of owed.slice(0, share)) {
    taken.add(id);
    picked.push({
      spec_point_id: id,
      // No rating at all is NOT evidence of teaching, so it belongs to the
      // spine. Defaulting to a middling 50 put it above NEVER_TAUGHT_BELOW and
      // labelled the entire unrated course as revision — a student who had
      // never opened the app was told their first week was "coming back round".
      lane: (input.confidence.get(id) ?? 0) < NEVER_TAUGHT_BELOW ? "core" : "focus",
      // Owed from an earlier week rather than starting here.
      origin:
        current && (input.pointsByTopic.get(current.topicId) ?? []).some((p) => p.id === id)
          ? "planned"
          : "carried_over",
      sort_order: picked.length,
    });
  }

  // ── Revisit lane ───────────────────────────────────────────────────────────
  // Only points with evidence behind them. Untouched material scores zero
  // mastery, which is honest, but it would rank the entire unseen course above
  // anything the student has actually flagged. First contact belongs to the
  // spine; this lane is for coming back.
  const candidates: string[] = [];
  for (const [, points] of input.pointsByTopic) {
    for (const p of points) {
      if (taken.has(p.id)) continue;
      const hasEvidence = input.stability.has(p.id) || input.confidence.has(p.id);
      if (!hasEvidence) continue;
      if ((input.confidence.get(p.id) ?? 50) < NEVER_TAUGHT_BELOW) continue;
      if (input.settled.has(p.id)) continue;
      candidates.push(p.id);
    }
  }

  candidates.sort((a, b) => byFragility(a, b, input.stability, input.confidence));

  for (const id of candidates.slice(0, budget)) {
    picked.push({
      spec_point_id: id,
      lane: "focus",
      origin: "planned",
      sort_order: picked.length,
    });
  }

  return picked;
}

// ── The focus lane, laid out across the weeks ahead ───────────────────────────

/** Below this mastery a point is a long way off, and comes back repeatedly. */
export const FOCUS_RED_BELOW = 34;

/** How many times a weak point resurfaces before the revision window. */
function revisitCount(mastery: number): number {
  return mastery < FOCUS_RED_BELOW ? 3 : 1; // red keeps recurring; amber a single look
}

/** One weak spec point competing for a revision slot. */
export type FocusCandidate = {
  specPointId: string;
  topicId: string;
  topicTitle: string;
  code: string;
  pointTitle: string;
  /** 0–100 mastery — lower is weaker, and weaker wins the slot. */
  mastery: number;
};

/** One topic's revision work in one week. */
export type FocusBand = {
  topicId: string;
  title: string;
  /** Monday of the week it lands on. */
  week: string;
  kind: "revisit" | "review";
  points: { specPointId: string; code: string; title: string }[];
  /** The weakest mastery in the band — what the row's colour is read from. */
  mastery: number;
};

/** The total revision work a set of candidates is asking for, in points. */
export function focusDemand(candidates: FocusCandidate[]): number {
  return candidates.reduce((s, c) => s + revisitCount(c.mastery), 0);
}

/**
 * The weekly allowance, sized to the work actually in front of the student.
 *
 * A FIXED allowance is a queue with a fixed service rate, and a queue whose
 * arrivals exceed it drops its tail — silently, and always the same tail,
 * because the lane is served weakest-first. On a real spec that tail is every
 * "getting there" point in the course: a student with enough weak points to
 * fill the year had their amber ratings absorbed and then dropped outright.
 * Dividing the demand by the runway removes the failure mode instead of raising
 * a constant until it usually fits. {@link FOCUS_BUDGET} is the floor, not the
 * cap.
 */
function budgetFor(demand: number, runway: number): number {
  if (runway <= 0) return FOCUS_BUDGET;
  return Math.max(FOCUS_BUDGET, Math.ceil(demand / runway));
}

/**
 * The focus lane as a load-balanced revision queue rather than a flood.
 *
 * FSRS resurfaces everything the instant it is rated, so a student who rates
 * nine topics badly would otherwise get nine revisits dumped into next week.
 * Each week gets a budget and the backlog is spread across the weeks to the
 * exam, weakest first, with each point's next look a widening gap later.
 *
 * **The two tiers are served side by side, not in order of weakness.** A single
 * weakest-first queue is a strict priority queue, and a strict priority queue
 * does not merely delay the tier below — it defers it until the tier above is
 * finished. With red asking three revisits per point against amber's one, that
 * left amber untouched for two-thirds of the year and then crammed into the
 * last month at one look each, which is not spacing by any definition. Sharing
 * every week between the tiers keeps the ratio — weak points still come back
 * far more often, because they ask for more — while giving both a place from
 * week one.
 *
 * Pure and deterministic, and never persisted: recomputed from mastery on every
 * load, so it always reflects the ratings as they stand.
 */
export function scheduleFocusWeeks(params: {
  candidates: FocusCandidate[];
  /** Settled topics — one light review slot each, budget-exempt. */
  coveredTopics: { topicId: string; title: string }[];
  /** Monday the plan starts from. */
  currentMonday: string;
  examDate: string;
  weeklyBudget?: number;
  revisionWeeks?: number;
}): FocusBand[] {
  const revisionWeeks = params.revisionWeeks ?? REVISION_WEEKS;
  const examMonday = toDateKey(mondayOf(new Date(`${params.examDate}T00:00:00`)));
  const revisionStart = addWeeks(examMonday, -revisionWeeks);
  const runway = weeksBetween(params.currentMonday, revisionStart);
  const budget = Math.max(
    1,
    params.weeklyBudget ?? budgetFor(focusDemand(params.candidates), runway),
  );

  const out: FocusBand[] = [];

  // A light review pass for settled topics, inside the revision window.
  if (revisionStart > params.currentMonday) {
    for (const t of params.coveredTopics) {
      out.push({
        topicId: t.topicId,
        title: t.title,
        week: revisionStart,
        kind: "review",
        points: [],
        mastery: 100,
      });
    }
  }

  if (runway <= 0 || params.candidates.length === 0) return out;

  // Widening gaps between a point's successive looks, scaled to the runway.
  const gaps = [Math.max(2, Math.round(runway * 0.08)), Math.max(4, Math.round(runway * 0.2))];
  const gapAfter = (placed: number) => gaps[Math.min(placed, gaps.length - 1)];

  type Tier = "red" | "amber";
  type Ticket = {
    c: FocusCandidate;
    remaining: number;
    placed: number;
    /** Earliest week this point may be looked at again. */
    nextIdx: number;
    tier: Tier;
  };
  const tickets: Ticket[] = params.candidates.map((c) => ({
    c,
    remaining: revisitCount(c.mastery),
    placed: 0,
    // Everything wants this week; the shares below are what spread it out.
    nextIdx: 0,
    tier: c.mastery < FOCUS_RED_BELOW ? "red" : "amber",
  }));

  /**
   * Each tier's unspent share of the weeks so far.
   *
   * A share is a fraction of a week and a spec point is a whole thing, so a tier
   * holding a thin slice of the backlog is owed a fraction of a point per week
   * and could never afford one. Carrying the remainder lets it save up and be
   * served every few weeks rather than never.
   */
  const credit = new Map<Tier, number>();
  const placedByWeek = new Map<number, FocusCandidate[]>();

  // From week 0 — the week the student is standing in. Starting at 1 meant a
  // topic they had just flagged as weak was always somebody else's problem.
  for (let wk = 0; wk < runway; wk++) {
    // What each tier still owes, recomputed weekly so the shares re-balance as
    // the backlog burns down: when one tier finishes, its slice passes to the
    // other without needing a hand-off rule.
    const owed = new Map<Tier, number>();
    let owedTotal = 0;
    for (const t of tickets) {
      if (t.remaining <= 0) continue;
      owed.set(t.tier, (owed.get(t.tier) ?? 0) + t.remaining);
      owedTotal += t.remaining;
    }
    if (owedTotal <= 0) break; // the whole backlog is scheduled
    for (const [tier, w] of owed)
      credit.set(tier, (credit.get(tier) ?? 0) + (budget * w) / owedTotal);

    let cap = budget;
    const place = (t: Ticket) => {
      const list = placedByWeek.get(wk) ?? [];
      list.push(t.c);
      placedByWeek.set(wk, list);
      cap -= 1;
      credit.set(t.tier, (credit.get(t.tier) ?? 0) - 1);
      t.remaining--;
      t.nextIdx = wk + gapAfter(t.placed); // next look, a widening gap later
      t.placed++;
    };

    // Weakest first *within* a tier; between tiers it is the share that decides,
    // not the rating. Recomputed between passes because placing a point moves
    // its next look past this week.
    const available = () =>
      tickets
        .filter((t) => t.remaining > 0 && t.nextIdx <= wk)
        .sort((a, b) => a.c.mastery - b.c.mastery || a.nextIdx - b.nextIdx);

    // 1. Each tier spends its own share, whatever the other is asking for.
    for (const t of available()) {
      if (cap <= 0) break;
      if ((credit.get(t.tier) ?? 0) <= 0) continue;
      place(t);
    }
    // 2. Spill. A tier whose points are all mid-gap cannot use its share this
    //    week, and the room it leaves goes to whoever can rather than being
    //    lost. The borrower is still charged, so it pays out of its own share.
    for (const t of available()) {
      if (cap <= 0) break;
      place(t);
    }
    // Anything that didn't fit keeps nextIdx ≤ wk, so it leads next week.
  }

  // Group each week's placed points by topic.
  for (const [wk, cands] of placedByWeek) {
    const week = addWeeks(params.currentMonday, wk);
    const byTopic = new Map<string, FocusCandidate[]>();
    for (const c of cands) {
      const l = byTopic.get(c.topicId) ?? [];
      l.push(c);
      byTopic.set(c.topicId, l);
    }
    for (const [topicId, pts] of byTopic) {
      out.push({
        topicId,
        title: pts[0].topicTitle,
        week,
        kind: "revisit",
        points: pts.map((p) => ({ specPointId: p.specPointId, code: p.code, title: p.pointTitle })),
        mastery: Math.min(...pts.map((p) => p.mastery)),
      });
    }
  }

  return out.sort((a, b) => a.week.localeCompare(b.week) || a.title.localeCompare(b.title));
}

/**
 * A topic's points divided evenly across the weeks of its run.
 *
 * Even, not `ceil`-chunked: thirteen points over five weeks went 3/3/3/3/1, so
 * the last week of every topic was a stub, and with enough weeks the trailing
 * ones came out empty — a week of the plan with nothing on the spine at all.
 */
export function splitEvenly(total: number, weeks: number): number[] {
  if (weeks <= 0) return [];
  const base = Math.floor(total / weeks);
  let extra = total - base * weeks;
  return Array.from({ length: weeks }, () => base + (extra-- > 0 ? 1 : 0));
}

/** The slice of a teach band's points that belongs to one of its weeks. */
export function weekSliceOf<T>(band: Band, weekStart: string, points: T[]): T[] {
  if (band.kind !== "teach" || band.weeks <= 0) return points;
  const idx = weeksBetween(band.startWeek, weekStart);
  if (idx < 0 || idx >= band.weeks) return [];
  const sizes = splitEvenly(points.length, band.weeks);
  const from = sizes.slice(0, idx).reduce((a, b) => a + b, 0);
  return points.slice(from, from + sizes[idx]);
}

/** Every Monday the programme covers, first band to last. */
export function weeksOf(bands: Band[]): string[] {
  if (bands.length === 0) return [];
  const start = bands.reduce((m, b) => (b.startWeek < m ? b.startWeek : m), bands[0].startWeek);
  const end = bands.reduce((m, b) => (b.endWeek > m ? b.endWeek : m), bands[0].endWeek);
  const out: string[] = [];
  for (let w = start; w <= end; w = addWeeks(w, 1)) out.push(w);
  return out;
}
