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
 * The **floor** on a week's revision allowance, in weight — not the cap.
 *
 * FSRS resurfaces everything the moment it is rated, which would flood a single
 * week. This budget applies to the REVISIT lane only — never the teaching
 * spine, whose weekly share is added on top. One shared cap starves teaching
 * entirely while any backlog exists.
 *
 * Six is the same six it always was: weights are normalised per course to a
 * mean of 1.0, so on a course with a small backlog it still buys about six
 * average points, and a course with no measured weights behaves exactly as it
 * did. What it is no longer is a ceiling — see {@link budgetFor}.
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

/**
 * A spec point's share of a week's work; absent or non-positive means average.
 *
 * `spec_points.weight` defaults to 1, so a course with no measured weights
 * paces exactly as it did when this module counted rows.
 */
export function weightOf(p: { weight?: number | null }): number {
  return p.weight && p.weight > 0 ? p.weight : 1;
}

export type PacingInput = {
  topics: Topic[];
  /** How many points each topic has. Shown on the roadmap; not what sizes it. */
  pointCountByTopic: Map<string, number>;
  /**
   * The sum of each topic's points' weights — its share of the timetable.
   *
   * Sizing by COUNT gave sparse topics too many weeks and dense ones too few:
   * twelve one-line recall statements outranked eight practicals. Falls back to
   * the count when a course has no measured weights, which is the same number.
   */
  pointWeightByTopic?: Map<string, number>;
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
 * Which weeks each topic runs across, laid out on one continuous work axis.
 *
 * Returns `[firstWeek, lastWeek]` per topic, as indices from the start of
 * teaching. **Two topics may be given the same week.** That is the point.
 *
 * The rule this replaced gave every topic a whole week of its own and shared
 * out whatever was left over. On a course with nearly as many topics as weeks
 * there was nothing left over, so every topic got exactly one week whatever its
 * size — OCR A-Level Biology put an eleven-point topic and a three-point topic
 * in a week each, and a 45-topic Chemistry course simply ran eleven weeks past
 * its own exam. A minimum of one week per topic is a promise the calendar
 * cannot always keep.
 *
 * So topics are laid end to end by workload and the year is cut into equal
 * slices of work. A topic bigger than a slice spans several weeks; two small
 * neighbours fall inside one slice and share it. Nothing is dropped and nothing
 * runs past the revision window.
 *
 * Contiguous and in spec order, so a topic is never split and never overtaken.
 */
export function distributeWeeks(sizes: number[], totalWeeks: number): [number, number][] {
  const n = sizes.length;
  if (n === 0) return [];
  const weeks = Math.max(1, Math.floor(totalWeeks));

  // A topic with no measured work still has to be taught, so it gets a nominal
  // share rather than a zero-width slot that collapses onto its neighbour.
  const work = sizes.map((s) => (s > 0 ? s : 1));

  // MORE TOPICS THAN WEEKS. Every week has to carry a group of whole topics, so
  // the job is to choose the group boundaries — which is the same balancing
  // problem `splitAcrossWeeks` already solves exactly. Rounding an axis here
  // instead let the error at each boundary accumulate, and OCR A-Level
  // Chemistry's 45 topics came out with weeks eight times heavier than others.
  if (weeks < n) {
    const groups = splitAcrossWeeks(
      work.map((w, i) => ({ w, i })),
      weeks,
      (t) => t.w,
    );
    const out: [number, number][] = new Array(n);
    groups.forEach((group, wk) => {
      for (const t of group) out[t.i] = [wk, wk];
    });
    // A group can come out empty when there are more weeks than the partition
    // could use; nothing should be left without a week either way.
    for (let i = 0; i < n; i++) out[i] ??= [weeks - 1, weeks - 1];
    return out;
  }

  const total = work.reduce((a, b) => a + b, 0);
  const perWeek = total / weeks;

  // Each topic's start and end on the axis, in week units. Boundaries are
  // rounded to the NEAREST week rather than spread outwards: rounding outwards
  // (floor the start, ceil the end) makes every topic overlap its neighbour
  // wherever a boundary falls mid-week, so three equal topics over ten weeks
  // came out sharing two of them for no reason. Rounding to the nearest lets
  // topics tile cleanly, and leaves an overlap only where one genuinely is too
  // small to own a week of its own — which is the case this exists for.
  const out: [number, number][] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const first = Math.min(weeks - 1, Math.round(at / perWeek));
    at += work[i];
    const last = Math.min(weeks - 1, Math.max(first, Math.round(at / perWeek) - 1));
    out.push([first, last]);
  }
  return out;
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

  // However many weeks the calendar actually has. This used to be floored at
  // the number of topics, to guarantee each one a week of its own; topics can
  // now share a week, so the floor is gone and teaching fits inside the window
  // instead of running past the exam.
  const teachingWeeks = Math.max(1, weeksBetween(flowStart, revisionStart));
  const counts = topics.map((t) => input.pointCountByTopic.get(t.id) ?? 1);
  // Weeks are shared out by WORK; the count is kept only for display.
  const sizes = topics.map((t, i) => input.pointWeightByTopic?.get(t.id) ?? counts[i]);

  // A settled topic is not re-taught, so it takes up none of the year. Leaving
  // it on the axis would reserve time for work nobody is going to do.
  const pending = topics.map((t) => !covered.has(t.id));
  const spans = distributeWeeks(
    sizes.filter((_, i) => pending[i]),
    teachingWeeks,
  );

  const bands: Band[] = [];
  let s = 0;

  topics.forEach((topic, i) => {
    // A settled topic keeps a band, at zero weeks, so the roadmap can still
    // show it as done. `bandsForWeek` skips those.
    if (!pending[i]) {
      bands.push({
        topicId: topic.id,
        title: topic.title,
        startWeek: flowStart,
        endWeek: flowStart,
        weeks: 0,
        pointCount: counts[i],
        kind: "teach",
      });
      return;
    }
    const [first, last] = spans[s++];
    bands.push({
      topicId: topic.id,
      title: topic.title,
      startWeek: addWeeks(flowStart, first),
      endWeek: addWeeks(flowStart, last),
      weeks: last - first + 1,
      pointCount: counts[i],
      kind: "teach",
    });
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
 * This used to be the headline problem: every topic was promised a week of its
 * own, so a course with more topics than weeks was scheduled straight past its
 * own exam and this counted by how much. Topics can now share a week, so the
 * programme always lands inside the window and this is normally 0.
 *
 * It is kept as a guard rather than deleted. The layout can only fit a course
 * into the weeks that exist — it says nothing about whether those weeks are
 * sane, and a student joining after the revision window has already opened
 * still has nowhere to put the teaching. {@link crowdedWeeks} is the signal
 * that replaced it for the ordinary "this course is very full" case.
 */
export function overrunWeeks(bands: Band[], examDate: string): number {
  const teach = bands.filter((b) => b.kind === "teach" && b.weeks > 0);
  if (teach.length === 0) return 0;
  const lastEnd = teach[teach.length - 1].endWeek;
  const examMonday = toDateKey(mondayOf(new Date(`${examDate}T00:00:00`)));
  const revisionStart = addWeeks(examMonday, -REVISION_WEEKS);
  return weeksBetween(revisionStart, lastEnd);
}

/**
 * How many weeks have to teach more than one topic.
 *
 * The honest replacement for the old overrun warning. A course that needs
 * doubling-up is not broken — it is scheduled, and every topic is in there —
 * but the weeks are full, and that is worth saying to somebody who can move the
 * start date or hand a topic over as self-study.
 */
export function crowdedWeeks(bands: Band[]): number {
  const perWeek = new Map<string, number>();
  for (const b of bands) {
    if (b.kind !== "teach" || b.weeks === 0) continue;
    for (let w = b.startWeek; w <= b.endWeek; w = addWeeks(w, 1)) {
      perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
    }
  }
  return [...perWeek.values()].filter((n) => n > 1).length;
}

/**
 * Every band running in a given week, in spec order.
 *
 * Usually one. Two small neighbouring topics now share a week rather than
 * taking one each, so callers have to be able to show both — see
 * {@link distributeWeeks}.
 */
export function bandsForWeek(bands: Band[], weekStart: string): Band[] {
  return bands.filter((b) => b.weeks > 0 && weekStart >= b.startWeek && weekStart <= b.endWeek);
}

/**
 * The first band running in a given week.
 *
 * Only for callers that genuinely want one — "which topic does this week lead
 * with". Anything showing the week's work wants {@link bandsForWeek}, or it
 * will quietly drop the topic sharing it.
 */
export function bandForWeek(bands: Band[], weekStart: string): Band | undefined {
  return bandsForWeek(bands, weekStart)[0];
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
  /** Spec points grouped by topic, in teaching order. `weight` may be absent. */
  pointsByTopic: Map<string, { id: string; sort_order: number; weight?: number | null }[]>;
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
  const weightById = new Map<string, number>();
  for (const band of input.bands) {
    if (band.kind !== "teach" || band.weeks === 0) continue;
    if (band.startWeek > input.weekStart) continue;
    for (const p of input.pointsByTopic.get(band.topicId) ?? []) {
      weightById.set(p.id, weightOf(p));
      if (!input.settled.has(p.id)) owed.push(p.id);
    }
  }

  /**
   * This week's share of the spine, in WORK rather than in rows.
   *
   * It is the weight of the slice the roadmap shows for this week — the same
   * `splitAcrossWeeks` cut, so the year view and the weekly view agree about
   * how big a week is. Taking `ceil(points / weeks)` rows instead meant a week
   * of three heavy practicals and a week of three definitions were the same
   * week to the planner.
   *
   * Summed over every band running this week: two small topics can now share
   * one, and reading only the first would budget for half the week's work and
   * leave the second topic permanently owed.
   */
  const share = bandsForWeek(input.bands, input.weekStart).reduce(
    (total, band) =>
      total +
      weekSliceOf(
        band,
        input.weekStart,
        input.pointsByTopic.get(band.topicId) ?? [],
        weightOf,
      ).reduce((s, p) => s + weightOf(p), 0),
    0,
  );

  // Fill up to that budget, and never leave the spine empty: one point always
  // goes in, even when it is heavier on its own than the whole week's share.
  // No band covers this week — a gap, or past the end of the programme — and
  // the spine is empty, exactly as it was when the share was a row count.
  const spine: string[] = [];
  let used = 0;
  if (share > 0) {
    for (const id of owed) {
      const w = weightById.get(id) ?? 1;
      if (spine.length > 0 && used + w > share) break;
      spine.push(id);
      used += w;
    }
  }

  // Which points this week is actually for, across every topic running in it.
  // Anything else in the spine is owed from an earlier week.
  const dueThisWeek = new Set(
    bandsForWeek(input.bands, input.weekStart).flatMap((band) =>
      (input.pointsByTopic.get(band.topicId) ?? []).map((p) => p.id),
    ),
  );

  for (const id of spine) {
    taken.add(id);
    picked.push({
      spec_point_id: id,
      // No rating at all is NOT evidence of teaching, so it belongs to the
      // spine. Defaulting to a middling 50 put it above NEVER_TAUGHT_BELOW and
      // labelled the entire unrated course as revision — a student who had
      // never opened the app was told their first week was "coming back round".
      lane: (input.confidence.get(id) ?? 0) < NEVER_TAUGHT_BELOW ? "core" : "focus",
      // Owed from an earlier week rather than starting here.
      origin: dueThisWeek.has(id) ? "planned" : "carried_over",
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
      weightById.set(p.id, weightOf(p));
      if (taken.has(p.id)) continue;
      const hasEvidence = input.stability.has(p.id) || input.confidence.has(p.id);
      if (!hasEvidence) continue;
      if ((input.confidence.get(p.id) ?? 50) < NEVER_TAUGHT_BELOW) continue;
      if (input.settled.has(p.id)) continue;
      candidates.push(p.id);
    }
  }

  candidates.sort((a, b) => byFragility(a, b, input.stability, input.confidence));

  // The budget is spent in WORK, for the same reason the spine's is: six
  // revisits is a different afternoon depending on which six. A week holding
  // one heavy practical and two definitions is full; six definitions is also
  // full. Counting slots made the first look two-thirds empty.
  let spent = 0;
  for (const id of candidates) {
    const w = weightById.get(id) ?? 1;
    if (spent > 0 && spent + w > budget) break;
    spent += w;
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
  /** Its share of a week's work; absent means average, i.e. 1. */
  weight?: number;
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

/**
 * The total revision work a set of candidates is asking for, in weight: every
 * point's revisits, each charged at that point's own size.
 *
 * This is the number the year has to absorb. Nothing else here knew it — the
 * scheduler used to discover it a week at a time, by running out of room —
 * which is why the budget could be set without reference to it.
 */
export function focusDemand(candidates: FocusCandidate[]): number {
  return candidates.reduce((s, c) => s + revisitCount(c.mastery) * weightOf(c), 0);
}

/**
 * How heavy the revision lane has come out, measured against the teaching it is
 * supposed to sit on top of.
 *
 * The comparison is the point. "Is 21 units a week too much?" has no answer in
 * the abstract — it depends on the course, the runway and how the spec is
 * weighted — but "revision is now heavier than the new material" is a judgement
 * anyone can make, and it stays true when any of those three change. The
 * alternative is a hand-picked number that silently rots.
 */
export type FocusLoad = {
  /** Revision work per week, in weight: what the lane was budgeted at. */
  budget: number;
  /** New material per week, in weight: the spine's pace, and the yardstick. */
  spine: number;
  /** Revision as a multiple of new material; 0 when there is no spine. */
  ratio: number;
  /** Revision has come out heavier than the teaching it is meant to support. */
  overloaded: boolean;
};

/**
 * Weigh the revision lane against the spine.
 *
 * The lane is meant to run at roughly half the spine — revision supporting new
 * material, not competing with it. Passing the spine outright means the ratings
 * have asked for a year that does not fit in the year, which is worth saying
 * out loud to somebody who can act on it.
 */
export function focusLoadFor(params: {
  budget: number;
  /** Each topic's total work, the same figure that sizes its band. */
  topicWeights: number[];
  bands: Band[];
}): FocusLoad {
  // DISTINCT weeks, not the sum of each band's length. Two topics sharing a
  // week made that sum bigger than the year, which shrank the spine's apparent
  // weekly pace and reported a student who had rated nothing as overloaded.
  const covered = new Set<string>();
  for (const b of params.bands) {
    if (b.kind !== "teach" || b.weeks === 0) continue;
    for (let w = b.startWeek; w <= b.endWeek; w = addWeeks(w, 1)) covered.add(w);
  }
  const weeks = covered.size;
  const work = params.topicWeights.reduce((s, w) => s + Math.max(w, 1), 0);
  const spine = weeks > 0 ? work / weeks : 0;
  return {
    budget: params.budget,
    spine,
    ratio: spine > 0 ? params.budget / spine : 0,
    overloaded: spine > 0 && params.budget > spine,
  };
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
 * The allowance {@link scheduleFocusWeeks} will use, without running it.
 *
 * The scheduler works this out for itself; this exists so callers can weigh the
 * same number against the spine ({@link focusLoadFor}) rather than guessing at
 * it or re-deriving the runway by hand.
 */
export function focusBudgetFor(params: {
  candidates: FocusCandidate[];
  currentMonday: string;
  examDate: string;
  revisionWeeks?: number;
}): number {
  const revisionWeeks = params.revisionWeeks ?? REVISION_WEEKS;
  const examMonday = toDateKey(mondayOf(new Date(`${params.examDate}T00:00:00`)));
  const runway = weeksBetween(params.currentMonday, addWeeks(examMonday, -revisionWeeks));
  return budgetFor(focusDemand(params.candidates), runway);
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
      const w = t.remaining * weightOf(t.c);
      owed.set(t.tier, (owed.get(t.tier) ?? 0) + w);
      owedTotal += w;
    }
    if (owedTotal <= 0) break; // the whole backlog is scheduled
    for (const [tier, w] of owed)
      credit.set(tier, (credit.get(tier) ?? 0) + (budget * w) / owedTotal);

    let cap = budget;
    const place = (t: Ticket) => {
      const list = placedByWeek.get(wk) ?? [];
      list.push(t.c);
      placedByWeek.set(wk, list);
      // Charged its full weight even when that overruns the week. A point is
      // the smallest thing a band has, so a heavy one makes for a full week
      // rather than being split or skipped forever.
      const cost = weightOf(t.c);
      cap -= cost;
      credit.set(t.tier, (credit.get(t.tier) ?? 0) - cost);
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
 * A topic's points cut into weeks of equal WORK.
 *
 * Equal counts were the old rule, and they assume points are interchangeable.
 * They are not: on Edexcel GCSE Physics the heaviest point is three times the
 * lightest, so "three points this week" was anywhere between twenty minutes and
 * an hour and a half.
 *
 * Exact minimum-maximum partition, not a greedy fill. `heaviest[i][j]` is the
 * lightest possible heaviest week when the first i points are dealt into j
 * weeks, and `cut` records where the last week started so the split can be
 * walked back out. Points stay in spec order — a week is always a contiguous
 * run — so this only chooses where the boundaries fall, never what goes where.
 *
 * Two objectives, in order: make the heaviest week as light as possible, then
 * make the lightest week as heavy as possible. The second matters. Minimising
 * the maximum alone leaves many equally good splits, and the arbitrary one is
 * usually the split that dumps the remainder into a single stub week — which is
 * the failure the old `splitEvenly` existed to avoid and would reintroduce.
 *
 * Deliberately still a flat, static chunking of the topic's whole point list:
 * week 3's share is week 3's share whether or not weeks 1 and 2 got done, so
 * the plan a student looks at in October says the same thing it said in July.
 * Catching up on what was missed is {@link selectWeekPoints}'s job, not the
 * calendar's.
 */
export function splitAcrossWeeks<T>(
  points: T[],
  weeks: number,
  weight: (p: T) => number = () => 1,
): T[][] {
  const w = Math.max(1, Math.floor(weeks));
  if (points.length === 0) return Array.from({ length: w }, () => []);
  // More weeks than points: one each, then nothing left to give.
  if (w >= points.length)
    return Array.from({ length: w }, (_, i) => (i < points.length ? [points[i]] : []));

  const n = points.length;
  const w0 = points.map(weight);
  const prefix = [0];
  for (let i = 0; i < n; i++) prefix.push(prefix[i] + Math.max(0, w0[i]));

  const heaviest: number[][] = Array.from({ length: n + 1 }, () => new Array(w + 1).fill(Infinity));
  const lightest: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(w + 1).fill(-Infinity),
  );
  const cut: number[][] = Array.from({ length: n + 1 }, () => new Array(w + 1).fill(0));
  for (let j = 0; j <= w; j++) {
    heaviest[0][j] = 0;
    lightest[0][j] = Infinity; // no weeks yet — nothing constrains the minimum
  }
  for (let i = 1; i <= n; i++) {
    heaviest[i][1] = prefix[i];
    lightest[i][1] = prefix[i];
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 2; j <= w; j++) {
      for (let x = 1; x < i; x++) {
        const chunk = prefix[i] - prefix[x];
        const mx = Math.max(heaviest[x][j - 1], chunk);
        const mn = Math.min(lightest[x][j - 1], chunk);
        // Better = lighter heaviest week; on a tie, heavier lightest week; on a
        // full tie, the later cut, so any short week falls at the end of the
        // run rather than opening it.
        const better = mx < heaviest[i][j] || (mx === heaviest[i][j] && mn >= lightest[i][j]);
        if (better) {
          heaviest[i][j] = mx;
          lightest[i][j] = mn;
          cut[i][j] = x;
        }
      }
    }
  }

  const sizes: number[] = [];
  let i = n;
  for (let j = w; j >= 1; j--) {
    const from = j === 1 ? 0 : cut[i][j];
    sizes.unshift(i - from);
    i = from;
  }

  const out: T[][] = [];
  let at = 0;
  for (const size of sizes) {
    out.push(points.slice(at, at + size));
    at += size;
  }
  return out;
}

/**
 * The slice of a teach band's points that belongs to one of its weeks.
 *
 * `weight` is optional so callers that only have ids still work; pass it
 * wherever the spec points themselves are to hand, or the split falls back to
 * equal counts.
 */
export function weekSliceOf<T>(
  band: Band,
  weekStart: string,
  points: T[],
  weight: (p: T) => number = () => 1,
): T[] {
  if (band.kind !== "teach" || band.weeks <= 0) return points;
  const idx = weeksBetween(band.startWeek, weekStart);
  if (idx < 0 || idx >= band.weeks) return [];
  return splitAcrossWeeks(points, band.weeks, weight)[idx] ?? [];
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
