/**
 * The whole student planner in one place: subject picked once at the top, then
 * three tabs.
 *
 * This replaced two routes that each looped over every enrolment and rendered
 * everything they had. `/planner` printed the full year timeline AND the whole
 * confidence board for each subject — for a student on three A-levels that is
 * roughly 270 rows before you have scrolled once — while `/plan` was a third
 * page holding the week. Nothing collapsed, nothing was behind a tab, and the
 * two pages loaded the same roadmap separately.
 *
 * Now: one subject at a time, one question per tab.
 *
 *   This week — what to actually do, grouped by topic.
 *   Full plan — the road to the exam.
 *   My topics — the confidence board, where re-rating happens.
 *
 * The tabs are a URL search param, not local state, so a nav link can point
 * straight at one and the back button works.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Map as MapIcon,
  MessageSquare,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { ConfidenceBoard } from "@/components/app/ConfidenceBoard";
import { FocusKey, FocusTopicRow, FocusedTopicsLabel } from "@/components/app/FocusLane";
import { EmptyState, ErrorNote, Meter, MasteryPill, Spinner } from "@/components/app/Shared";
import { BANDS, bandOf, useBoardState, type BandId } from "@/lib/bands";
import { masteryFromRow, type ScheduleRow } from "@/lib/fsrs";
import { bandsForWeek, weekSliceOf, weeksOf, weightOf, type FocusBand } from "@/lib/pacing";
import {
  SETTLED_THRESHOLD,
  useAcknowledgePlan,
  useRoadmap,
  weekFromRoadmap,
} from "@/lib/programme";
import { SUBJECT_LABEL, useViewer, type Enrolment } from "@/lib/session";
import { subjectIcon, subjectTint } from "@/lib/subject";
import { useSaveWeekNote, useWeekNotes, type NoteAuthor } from "@/lib/week-notes";
import {
  groupByTopic,
  useRateSpecPoint,
  useRateTopic,
  useTopicConfidence,
  useWeeklyPlan,
  type Level,
  type SpecPoint,
  type Topic,
} from "@/lib/study";
import { formatWeek, formatWeekShort, weekStartKey, weeksApart } from "@/lib/week";
import { cn } from "@/lib/utils";

/**
 * The full-plan row: week, core, focused, and a comment column each.
 *
 * Five columns only from `lg`. Below that the last three stack inside the core
 * cell rather than shrinking — a comment box 60px wide is not a comment box, and
 * making the page scroll sideways to read your tutor's note is worse than
 * reading it under the topic it is about.
 */
const GRID_COLS =
  "grid grid-cols-[5.5rem_minmax(0,1fr)] items-stretch lg:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,12rem)_minmax(0,12rem)]";

export const PLANNER_TABS = ["week", "plan", "topics"] as const;
export type PlannerTab = (typeof PLANNER_TABS)[number];

const TABS: { key: PlannerTab; label: string; icon: typeof CalendarDays }[] = [
  { key: "week", label: "This week", icon: CalendarDays },
  { key: "plan", label: "Full plan", icon: MapIcon },
  { key: "topics", label: "My topics", icon: SlidersHorizontal },
];

export type PlannerData = {
  studentId?: string;
  /** Whose plan this is — the heading on their own comment column. */
  studentName?: string;
  level: Level | null | undefined;
  enrolments: Enrolment[];
  topics: Topic[];
  specPoints: SpecPoint[];
  schedule: Map<string, ScheduleRow>;
  confidence: Map<string, number>;
};

export function StudentPlanner({
  data,
  tab,
  onTabChange,
}: {
  data: PlannerData;
  tab: PlannerTab;
  onTabChange: (tab: PlannerTab) => void;
}) {
  const [pickedSubject, setPickedSubject] = useState<string | null>(null);
  const enrolments = data.enrolments;
  const active = enrolments.find((e) => e.subject === pickedSubject) ?? enrolments[0];

  if (enrolments.length === 0 || !active) {
    return (
      <EmptyState
        title="No subjects set up yet"
        body="Once Ali sets your subjects, exam boards and exam dates, your plan is built here."
      />
    );
  }

  // Sliced once, here, so every tab reads the same subject rather than each
  // filtering the full curriculum for itself.
  const topics = data.topics.filter((t) => t.subject === active.subject);
  const topicIds = new Set(topics.map((t) => t.id));
  const specPoints = data.specPoints.filter((sp) => topicIds.has(sp.topic_id));

  return (
    // The whole planner is tinted by the subject in view, so switching from
    // Biology to Chemistry recolours every card, meter and chip inside it
    // without a single conditional class further down.
    <div className={cn(subjectTint(active.subject), "pop-card pop-card-hero overflow-hidden")}>
      <div className="border-b-2 border-dashed border-[color:color-mix(in_oklab,var(--foreground)_10%,transparent)] px-4 py-4 sm:px-5">
        {enrolments.length > 1 ? (
          <div
            className="mb-3 flex flex-wrap items-center gap-2"
            role="tablist"
            aria-label="Subject"
          >
            {enrolments.map((e) => {
              const Icon = subjectIcon(e.subject);
              const on = e.subject === active.subject;
              return (
                <button
                  key={e.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setPickedSubject(e.subject)}
                  className={cn(
                    subjectTint(e.subject),
                    "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm",
                    on ? "btn-solid" : "btn-soft",
                  )}
                >
                  {Icon ? <Icon className="size-4" aria-hidden /> : null}
                  {SUBJECT_LABEL[e.subject]}
                </button>
              );
            })}
          </div>
        ) : null}

        <nav
          className="tab-row scroll-none max-w-full overflow-x-auto"
          aria-label="Planner sections"
        >
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onTabChange(key)}
              aria-current={tab === key ? "page" : undefined}
              data-active={tab === key}
              className="tab-item shrink-0"
            >
              <Icon className="tab-pop size-4" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-4 sm:p-5">
        {tab === "week" ? (
          <ThisWeekTab
            enrolment={active}
            base={data}
            topics={topics}
            specPoints={specPoints}
            onRateTopics={() => onTabChange("topics")}
          />
        ) : tab === "plan" ? (
          <FullPlanTab
            enrolment={active}
            base={data}
            topics={topics}
            specPoints={specPoints}
            onRateTopics={() => onTabChange("topics")}
          />
        ) : (
          <MyTopicsTab base={data} topics={topics} specPoints={specPoints} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* This week                                                           */
/* ------------------------------------------------------------------ */

/**
 * The week, grouped by topic instead of as one flat list of spec points.
 *
 * A week can hold a dozen points across four topics, and printed flat they read
 * as an undifferentiated to-do list with no sense of what belongs together. The
 * topic is the unit a lesson is actually taught in, so it is the row.
 */
/**
 * The week as TWO CARDS, side by side, both always shown.
 *
 * They are the same two ideas the year plan is built from: the **core topic** is
 * the curriculum marching toward the exam, and **focused topics** are the points
 * that came back round because they were flagged or flopped. A week with nothing
 * to revisit still has a course to get through, and a week of pure revision
 * still sits somewhere on the spine — so neither card is ever hidden. Showing
 * only whichever lane happened to be non-empty is what made the week unreadable
 * as a stacked list of collapsed rows.
 *
 * Each card has the same anatomy — topic, how well it is sticking, this week's
 * spec points — so the two halves read as one idea in two colours.
 */
function ThisWeekTab({
  enrolment,
  base,
  topics,
  specPoints,
  onRateTopics,
}: {
  enrolment: Enrolment;
  base: PlannerData;
  topics: Topic[];
  specPoints: SpecPoint[];
  onRateTopics: () => void;
}) {
  const roadmapQ = useRoadmap({
    studentId: base.studentId,
    subject: enrolment.subject,
    examDate: enrolment.exam_date,
    topics,
    specPoints,
    schedule: base.schedule,
    confidence: base.confidence,
  });

  const programmePoints = roadmapQ.data
    ? weekFromRoadmap({
        roadmap: roadmapQ.data,
        specPoints,
        schedule: base.schedule,
        confidence: base.confidence,
      })
    : undefined;

  // A student with an exam date has a programme, and the programme owns the
  // week — so wait for it rather than letting the fallback create the plan.
  const programmeReady = !enrolment.exam_date || !roadmapQ.isLoading;

  const planQ = useWeeklyPlan({
    studentId: base.studentId,
    subject: enrolment.subject,
    board: enrolment.board,
    level: base.level,
    specPoints,
    schedule: base.schedule,
    confidence: base.confidence,
    programmePoints,
    ready: programmeReady,
  });

  const thisWeek = weekStartKey();
  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);
  const roadmap = roadmapQ.data;

  /** This week's points grouped by topic, per lane. */
  const lanes = useMemo(() => {
    const group = (lane: "core" | "focus") => {
      const out = new Map<string, { topic: Topic | undefined; points: PlanPointView[] }>();
      for (const p of planQ.data?.points ?? []) {
        if (p.lane !== lane || !p.specPoint) continue;
        const key = p.specPoint.topic_id;
        const entry = out.get(key) ?? { topic: topicById.get(key), points: [] };
        entry.points.push({ ...p.specPoint, carried: p.origin === "carried_over" });
        out.set(key, entry);
      }
      return [...out.values()];
    };
    return { core: group("core"), focus: group("focus") };
  }, [planQ.data, topicById]);

  /**
   * The spine band this week leads with — the core topic, points outstanding or
   * not.
   *
   * A week can run two topics when a pair of small neighbours share it, so this
   * picks the one that actually has work in the plan. Taking the first band
   * regardless meant a week whose leading topic was already settled announced
   * "no core topic scheduled" while the topic sharing it sat underneath.
   */
  const weekBands = roadmap ? bandsForWeek(roadmap.bands, thisWeek) : [];
  const band =
    weekBands.find(
      (b) => b.kind === "teach" && lanes.core.some((g) => g.topic?.id === b.topicId),
    ) ?? weekBands[0];
  const bandTopicId = band?.kind === "teach" ? band.topicId : undefined;
  const bandGroup = lanes.core.find((g) => g.topic?.id === bandTopicId);
  // Core points from OTHER topics get their own block rather than being listed
  // under the band's heading, which would present them as part of a topic they
  // are not in.
  const extraCore = lanes.core.filter((g) => g.topic?.id !== bandTopicId);

  const meanMastery = (points: PlanPointView[]) =>
    points.length
      ? Math.round(
          points.reduce(
            (s, sp) =>
              s + masteryFromRow(base.schedule.get(sp.id), base.confidence.get(sp.id) ?? null),
            0,
          ) / points.length,
        )
      : null;

  const total = planQ.data?.points.length ?? 0;
  const focusCount = lanes.focus.reduce((s, g) => s + g.points.length, 0);
  const nothingRated = base.confidence.size === 0;
  const covered = bandTopicId ? (roadmap?.settledTopics.has(bandTopicId) ?? false) : false;

  if (planQ.isLoading) return <Spinner label="Working out your week" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">This week</p>
          <p className="font-display mt-1 text-2xl font-extrabold">
            Week of {formatWeek(thisWeek)}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="chip">
            {total} spec point{total === 1 ? "" : "s"}
          </span>
          {planQ.data?.source === "tutor" ? <span className="sticker">Set by Ali</span> : null}
        </div>
      </div>

      {planQ.error ? <ErrorNote error={planQ.error} /> : null}

      <div className="grid items-stretch gap-4 md:grid-cols-2">
        {/* Core — the curriculum, on schedule for the exam. */}
        <section className="surface-loud flex h-full flex-col p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {covered ? (
              <span className="tint-emerald chip">
                <CheckCircle2 className="size-3.5" aria-hidden />
                Core topic · covered
              </span>
            ) : (
              <span className="chip chip-solid">
                <CircleDot className="size-3.5" aria-hidden />
                Core topic
              </span>
            )}
            {band ? (
              <span className="ml-auto text-[11px] font-bold text-muted-foreground">
                {formatWeek(band.startWeek)} → {formatWeek(band.endWeek)}
              </span>
            ) : null}
          </div>

          {band || extraCore.length > 0 ? (
            <div className="space-y-5">
              {band ? (
                <TopicBlock
                  title={band.title}
                  mastery={roadmap?.masteryByTopic.get(band.topicId) ?? null}
                  accent="primary"
                >
                  {bandGroup && bandGroup.points.length > 0 ? (
                    <SpecPointList points={bandGroup.points} />
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {covered
                        ? "Nothing outstanding here — you've covered this topic. It comes back for a light review before the exam."
                        : "This topic's spec points are all covered for this week."}
                    </p>
                  )}
                </TopicBlock>
              ) : null}
              {extraCore.map((g) => (
                <TopicBlock
                  key={g.topic?.id ?? g.points[0]?.id}
                  title={g.topic?.title ?? "Unknown topic"}
                  mastery={meanMastery(g.points)}
                  masteryLabel="How well these are sticking"
                  accent="primary"
                >
                  <SpecPointList points={g.points} />
                </TopicBlock>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No core topic scheduled this week.</p>
          )}
        </section>

        {/* Focused — what came back round. Same anatomy, different colour. */}
        <section className="tint-rose surface-soft flex h-full flex-col p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="chip">
              <FocusedTopicsLabel />
            </span>
            {focusCount > 0 ? (
              <span className="ml-auto text-[11px] font-bold text-muted-foreground">
                {focusCount} to revisit
              </span>
            ) : null}
          </div>

          {lanes.focus.length > 0 ? (
            <div className="space-y-5">
              {lanes.focus.map((g) => (
                <TopicBlock
                  key={g.topic?.id ?? g.points[0]?.id}
                  title={g.topic?.title ?? "Unknown topic"}
                  mastery={meanMastery(g.points)}
                  masteryLabel="How well these are sticking"
                  accent="rose"
                >
                  <SpecPointList points={g.points} />
                </TopicBlock>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 items-center">
              <p className="text-sm text-muted-foreground">
                {nothingRated ? (
                  <>
                    Nothing yet — head to{" "}
                    <button
                      type="button"
                      onClick={onRateTopics}
                      className="font-bold text-[color:var(--primary)] underline decoration-2 underline-offset-2"
                    >
                      My topics
                    </button>{" "}
                    and rate how confident you feel, and we&apos;ll plan your revision from it.
                  </>
                ) : (
                  "Nothing to revisit this week — you're on track."
                )}
              </p>
            </div>
          )}
        </section>
      </div>

      {total > 0 ? (
        <button
          type="button"
          onClick={onRateTopics}
          className="btn-soft inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Not right? Re-rate your topics
        </button>
      ) : null}
    </div>
  );
}

/** A spec point as this week's cards list it. */
type PlanPointView = SpecPoint & { carried: boolean };

/**
 * A topic inside one of the week's cards: its name, how well it is sticking, and
 * whatever the card wants to put underneath.
 */
function TopicBlock({
  title,
  mastery,
  masteryLabel = "How well it's sticking",
  accent,
  children,
}: {
  title: string;
  mastery: number | null;
  /** What the bar measures — the whole topic, or just the points listed here. */
  masteryLabel?: string;
  accent: "primary" | "rose";
  children: ReactNode;
}) {
  return (
    // The core lane inherits the SUBJECT's tint from the planner shell, so a
    // Biology week is green throughout instead of green cards with blue meters
    // inside them. Only the focus lane overrides, because "came back round" is
    // the one thing that must not read as the subject's own colour.
    <div className={accent === "rose" ? "tint-rose" : undefined}>
      <p className="font-display text-xl font-extrabold leading-snug">{title}</p>
      {mastery != null ? (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold">
            <span className="text-muted-foreground">{masteryLabel}</span>
            <span className="numeral text-[color:var(--tint)]">{mastery}%</span>
          </div>
          <Meter value={Math.max(2, mastery)} size="sm" />
        </div>
      ) : null}
      {children}
    </div>
  );
}

function SpecPointList({ points }: { points: PlanPointView[] }) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-display text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
          This week&apos;s spec points
        </h3>
        <span className="numeral text-[11px] text-muted-foreground/70">{points.length}</span>
      </div>
      <div className="space-y-2">
        {points.map((p, i) => (
          <div
            key={p.id}
            className="pop-in flex items-start gap-2.5 rounded-xl border border-[color:color-mix(in_oklab,var(--tint)_18%,var(--edge))] bg-card px-3 py-2.5"
            style={{ "--pop-delay": `${i * 45}ms` } as React.CSSProperties}
          >
            <span className="numeral mt-0.5 shrink-0 rounded-md bg-[color:color-mix(in_oklab,var(--tint)_12%,transparent)] px-1.5 py-0.5 text-[10px] text-[color:var(--tint)]">
              {p.code}
            </span>
            <p className="min-w-0 flex-1 text-sm font-medium leading-snug">
              {p.title}
              {p.carried ? (
                <span
                  className="ml-1.5 inline-flex h-5 items-center gap-1 rounded-md bg-muted px-1.5 align-middle text-[10px] font-bold text-muted-foreground"
                  title="Carried over from last week — it stays in this lane"
                >
                  <RotateCcw className="size-2.5" aria-hidden /> Carried
                </span>
              ) : null}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Full plan                                                           */
/* ------------------------------------------------------------------ */

/**
 * The year as a WEEK GRID, not a list of topics.
 *
 * A list of topic bands answers "when is Topic 5?", which is not the question a
 * student opens this with. They want "what is the week of 14 September?" — and
 * a week holds two different kinds of work at once: the course in order, and
 * whatever the engine has decided should come back round. A list can only show
 * one of those, so the second lane had nowhere to live and never appeared.
 *
 * Hence a row per week, with core and focused side by side. Expansion is per
 * ROW, not per topic: a topic spans several weeks and each teaches a different
 * slice, so opening Topic 3 in September must not also open its October row.
 */
/**
 * One topic's move, as a bar either side of a centre line.
 *
 * "7 wks earlier" is accurate and takes a second to read; seventeen of them
 * take seventeen seconds and none of them compare to each other. A bar off to
 * the left of a shared centre line says *earlier* and *by more than the row
 * above* in one look, which is the only thing this column is for.
 *
 * All rows share `scale`, the widest move on the list, so the lengths mean
 * something relative to each other rather than each filling its own cell.
 */
function ShiftBar({ weeks, scale }: { weeks: number; scale: number }) {
  const earlier = weeks < 0;
  const size = Math.abs(weeks);
  // Never zero-width: a one-week move is still a move, and an invisible bar
  // reads as "nothing happened".
  const pct = Math.max(8, (size / scale) * 100);
  const label = `${size} ${size === 1 ? "week" : "weeks"} ${earlier ? "earlier" : "later"}`;

  return (
    <span className="flex items-center gap-1.5" title={label}>
      <span className="relative h-3 flex-1" aria-hidden>
        {/* The centre line is the old date; the bar is the distance travelled. */}
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[color:var(--border)]" />
        <span
          className={cn(
            "absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[color:var(--tint)]",
            earlier ? "right-1/2" : "left-1/2",
          )}
          style={{ width: `${pct / 2}%` }}
        />
      </span>
      <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
        {size}w
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * What moved, when the live plan no longer matches the one the student agreed
 * to.
 *
 * **Collapsed to one sentence by default.** The student has exactly one
 * decision to make here — accept the new plan or go and look at it — and every
 * row of detail put in front of that decision is a row that delays it. This was
 * a bulleted list of seventeen sentences, then a seventeen-row table, and both
 * made a routine re-pacing look like an incident report.
 *
 * The count and "nothing has been dropped" are the whole message: the plan
 * moved, and moving is not losing. Anyone who wants the rows can open them, and
 * that is a table, because seventeen date changes are seventeen date changes.
 */
function PlanShifted({
  moved,
  pending,
  onAccept,
}: {
  moved: { title: string; from: string; to: string }[];
  pending: boolean;
  onAccept: () => void;
}) {
  const [open, setOpen] = useState(false);
  const earlier = moved.filter((m) => m.to < m.from).length;
  const later = moved.length - earlier;
  // One scale for the whole table, so bar lengths are comparable row to row.
  const widest = Math.max(1, ...moved.map((m) => Math.abs(weeksApart(m.from, m.to))));

  return (
    <div className="tint-amber pop-card pop-card-flat p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="font-display flex items-center gap-2 text-base font-extrabold text-[color:var(--tint)]">
            <CalendarClock className="size-4" aria-hidden />
            Your plan has shifted
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">
              {moved.length} {moved.length === 1 ? "topic" : "topics"}
            </span>{" "}
            moved to a different week. Nothing has been dropped.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={onAccept}
          // Primary blue, not the card's amber: white on amber does not carry
          // enough contrast, and the action is the app's, not the warning's.
          className="tint-primary btn-solid shrink-0 rounded-xl px-4 py-2.5 text-xs disabled:opacity-60"
        >
          {pending ? "Updating…" : "Got it, update my plan"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
        {open ? "Hide what changed" : "See what changed"}
      </button>

      {open ? (
        <div className="mt-2">
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            {earlier > 0 && later > 0
              ? `${earlier} moved earlier, ${later} moved later.`
              : earlier > 0
                ? "All of them moved earlier."
                : "All of them moved later."}
          </p>
          {/* No min-width: on a phone the columns have to fit, not scroll. A
              table you have to drag sideways to read the dates in is a list of
              topic names, which is the half nobody needed. */}
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="pb-1.5 pr-3 text-left font-semibold">
                  Topic
                </th>
                {/* The old date is the first thing to go when space is tight —
                    "6 wks earlier" already says which way it moved. */}
                <th
                  scope="col"
                  className="hidden px-2 pb-1.5 text-right font-semibold sm:table-cell"
                >
                  Was
                </th>
                <th scope="col" className="px-2 pb-1.5 text-right font-semibold">
                  Now
                </th>
                {/* The two words ARE the legend: left of the centre line is
                    earlier, right is later. Without them a diverging bar is a
                    puzzle; with them it needs no explaining at all. */}
                <th scope="col" className="w-[7.5rem] pb-1.5 pl-3 font-semibold sm:w-[9rem]">
                  <span className="flex items-center justify-between">
                    <span>Earlier</span>
                    <span>Later</span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="align-baseline">
              {moved.map((m) => {
                const weeks = weeksApart(m.from, m.to);
                return (
                  <tr key={m.title} className="border-t border-[color:var(--border)]/60">
                    <th
                      scope="row"
                      className="max-w-[9rem] truncate py-1.5 pr-3 text-left text-[12px] font-medium sm:max-w-[18rem]"
                      title={m.title}
                    >
                      {m.title}
                    </th>
                    <td className="numeral hidden px-2 py-1.5 text-right tabular-nums text-muted-foreground/70 line-through sm:table-cell">
                      {formatWeekShort(m.from)}
                    </td>
                    <td className="numeral px-2 py-1.5 text-right font-semibold tabular-nums">
                      {formatWeekShort(m.to)}
                    </td>
                    <td className="py-1.5 pl-3">
                      <ShiftBar weeks={weeks} scale={widest} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function FullPlanTab({
  enrolment,
  base,
  topics,
  specPoints,
  onRateTopics,
}: {
  enrolment: Enrolment;
  base: PlannerData;
  topics: Topic[];
  specPoints: SpecPoint[];
  onRateTopics: () => void;
}) {
  const roadmapQ = useRoadmap({
    studentId: base.studentId,
    subject: enrolment.subject,
    examDate: enrolment.exam_date,
    topics,
    specPoints,
    schedule: base.schedule,
    confidence: base.confidence,
  });
  const acknowledge = useAcknowledgePlan(base.studentId, enrolment.subject);
  const notesQ = useWeekNotes(base.studentId, enrolment.subject);
  const saveNote = useSaveWeekNote(base.studentId, enrolment.subject);
  // Which column the viewer may write. Each side owns one; the database enforces
  // it too, because a client-side check is a courtesy, not a control.
  const viewer = useViewer();
  const author: NoteAuthor = viewer.isTutor ? "tutor" : "student";
  const { byTopic } = useMemo(() => groupByTopic(topics, specPoints), [topics, specPoints]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const thisWeek = weekStartKey();

  const saveComment = (weekStart: string, who: NoteAuthor, text: string) =>
    saveNote.mutate(
      { weekStart, comment: { author: who, text } },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save") },
    );

  const roadmap = roadmapQ.data;
  const weeks = useMemo(() => (roadmap ? weeksOf(roadmap.bands) : []), [roadmap]);
  const focusByWeek = useMemo(() => {
    const out = new Map<string, FocusBand[]>();
    for (const b of roadmap?.focusBands ?? []) {
      const list = out.get(b.week) ?? [];
      list.push(b);
      out.set(b.week, list);
    }
    return out;
  }, [roadmap]);

  if (!enrolment.exam_date) {
    return (
      <EmptyState
        title="No exam date set"
        body="Your year can't be mapped out until Ali sets the exam date for this subject. Everything else still works — this fills in as soon as it's there."
      />
    );
  }
  if (roadmapQ.isLoading) return <Spinner label="Working out your year" />;
  if (roadmapQ.error) return <ErrorNote error={roadmapQ.error} />;
  if (!roadmap) return null;

  const covered = roadmap.settledTopics.size;

  return (
    <div className="space-y-3">
      {/* The exam date leads, because everything below is derived from it: each
          week is the course divided across the time between now and this day. */}
      <div className="banner-strip flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
        <span className="inline-flex items-center gap-3">
          <span className="icon-tile size-10 shrink-0">
            <CalendarClock className="size-4" aria-hidden />
          </span>
          <span>
            <span className="font-display block text-[15px] font-extrabold leading-tight">
              Exams from{" "}
              {new Date(enrolment.exam_date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">
              Every week below is paced from this date.
            </span>
          </span>
        </span>
        <span className="chip">
          <span className="numeral">
            {covered} of {topics.length}
          </span>{" "}
          topics covered
        </span>
      </div>

      {roadmap.overrun > 0 ? (
        <div className="tint-rose pop-card pop-card-flat p-4 text-sm">
          <p className="font-display flex items-center gap-2 text-base font-extrabold text-[color:var(--tint)]">
            <AlertTriangle className="size-4" aria-hidden />
            This course doesn&apos;t fit before the exam
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            The teaching runs {roadmap.overrun} week{roadmap.overrun === 1 ? "" : "s"} past the
            start of the revision run-up. Ali will need to start earlier, move the exam date, or set
            some topics as self-study.
          </p>
        </div>
      ) : roadmap.crowded > 0 ? (
        // A quiet line, not a second amber card. This is a standing fact about
        // the course rather than something to act on, and stacking it above the
        // "your plan has shifted" card left two warnings competing for the one
        // decision the student actually has to make.
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold text-foreground">It&apos;s a full year.</span>{" "}
            {topics.length} topics fit before the revision run-up, so {roadmap.crowded} week
            {roadmap.crowded === 1 ? " covers" : "s cover"} two topics. Nothing runs past the exam.
          </span>
        </p>
      ) : null}

      {roadmap.focusLoad.overloaded ? (
        <div className="tint-amber pop-card pop-card-flat p-4 text-sm">
          <p className="font-display flex items-center gap-2 text-base font-extrabold text-[color:var(--tint)]">
            <AlertTriangle className="size-4" aria-hidden />
            There&apos;s more revision than teaching in this plan
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            The topics marked as shaky add up to about {roadmap.focusLoad.ratio.toFixed(1)}&times;
            the new material each week between now and the exam. Every one of them is still
            scheduled, but the weeks will be heavy. Ali may want to look at which of them really
            need three passes.
          </p>
        </div>
      ) : null}

      {roadmap.needsAck ? (
        <PlanShifted
          moved={roadmap.diff.moved}
          pending={acknowledge.isPending}
          onAccept={() =>
            acknowledge.mutate(roadmap.bands, {
              onSuccess: () => toast.success("Plan updated"),
              onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
            })
          }
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">Core</span> is the course in order.{" "}
          <span className="font-semibold text-foreground">Focused</span> comes back until it sticks.
        </p>
        <FocusKey />
      </div>

      <div className="overflow-hidden rounded-2xl border-[1.5px] border-[color:color-mix(in_oklab,var(--tint)_22%,var(--edge))]">
        <div
          className={cn(
            GRID_COLS,
            "font-display border-b-[1.5px] border-[color:color-mix(in_oklab,var(--tint)_22%,var(--edge))] bg-[color:color-mix(in_oklab,var(--tint)_8%,transparent)] text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground",
          )}
        >
          <div className="flex items-center gap-1.5 px-3 py-2">
            <CalendarDays className="size-3.5" aria-hidden /> Week
          </div>
          <div className="flex items-center gap-1.5 border-l border-border px-3 py-2">
            <CircleDot className="size-3.5 text-primary" aria-hidden /> Core topics
          </div>
          {/* Below `lg` the other lanes stack inside the core cell, so their
              headers would label columns that aren't there. */}
          <div className="hidden items-center gap-1.5 border-l border-border px-3 py-2 lg:flex">
            <FocusedTopicsLabel />
          </div>
          <div className="hidden items-center gap-1.5 border-l border-border px-3 py-2 lg:flex">
            <MessageSquare className="size-3.5 text-primary" aria-hidden /> From Ali
          </div>
          <div className="hidden items-center gap-1.5 border-l border-border px-3 py-2 lg:flex">
            <MessageSquare className="size-3.5 text-muted-foreground" aria-hidden />
            {base.studentName ? `${base.studentName}'s notes` : "Your notes"}
          </div>
        </div>

        <div className="max-h-[34rem] divide-y divide-border overflow-y-auto">
          {weeks.map((wk) => {
            // Usually one topic, sometimes two: a pair of small neighbours
            // share a week rather than taking one each, so the big topics can
            // have the room. Each gets its own expandable entry in the cell.
            const cores = bandsForWeek(roadmap.bands, wk).map((band) => {
              const allPoints = byTopic.get(band.topicId) ?? [];
              return {
                band,
                allPoints,
                mastery: roadmap.masteryByTopic.get(band.topicId) ?? 0,
                // This week's slice of the topic, not the whole topic: a band
                // says "Topic 1, six weeks", and which three points belong to
                // THIS week existed nowhere before.
                slice: weekSliceOf(band, wk, allPoints, weightOf),
                rowKey: `${band.topicId}@${wk}`,
              };
            });
            const focused = focusByWeek.get(wk) ?? [];
            const isNow = wk === thisWeek;
            const note = notesQ.data?.get(wk);
            const done = note?.completed ?? false;

            return (
              <div
                key={wk}
                className={cn(
                  GRID_COLS,
                  isNow && "bg-[color:color-mix(in_oklab,var(--tint)_9%,transparent)]",
                  done && "opacity-60",
                )}
              >
                <div className="flex flex-col justify-center gap-1 px-3 py-2.5">
                  {isNow ? (
                    <span className="chip chip-solid w-fit px-2 py-0.5 text-[10px] uppercase tracking-wide">
                      <CircleDot className="size-3" aria-hidden /> Now
                    </span>
                  ) : null}
                  <span className="numeral text-[13px]">{formatWeek(wk)}</span>
                  <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={saveNote.isPending}
                      onChange={(e) =>
                        saveNote.mutate(
                          { weekStart: wk, completed: e.target.checked },
                          {
                            onError: (err) =>
                              toast.error(err instanceof Error ? err.message : "Could not save"),
                          },
                        )
                      }
                      className="size-3.5 accent-[var(--primary)]"
                    />
                    Done
                  </label>
                </div>

                <div className="min-w-0 space-y-2 border-l border-border px-3 py-2.5">
                  {cores.length === 0 ? (
                    <span className="text-[12px] text-muted-foreground/70">—</span>
                  ) : null}
                  {cores.map(({ band, allPoints, mastery, slice, rowKey }) => {
                    const isOpen = open.has(rowKey);
                    return (
                      <div key={rowKey}>
                        <button
                          type="button"
                          onClick={() => slice.length > 0 && toggle(rowKey)}
                          aria-expanded={slice.length > 0 ? isOpen : undefined}
                          className={cn(
                            "-mx-1 w-full rounded-md px-1 text-left",
                            slice.length > 0 ? "hover:bg-muted/50" : "cursor-default",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[13px] font-medium leading-snug">
                              {band.kind === "revision"
                                ? "Revision — the run-up to the exam"
                                : band.title}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              {roadmap.settledTopics.has(band.topicId) ? (
                                <CheckCircle2
                                  className="size-3.5 text-emerald-600 dark:text-emerald-400"
                                  aria-hidden
                                />
                              ) : null}
                              {slice.length > 0 ? (
                                <ChevronDown
                                  className={cn(
                                    "size-3.5 text-muted-foreground transition-transform",
                                    isOpen && "rotate-180",
                                  )}
                                  aria-hidden
                                />
                              ) : null}
                            </span>
                          </div>
                          {band.kind === "teach" && allPoints.length > 0 ? (
                            <span
                              className="mt-1.5 flex items-center gap-2"
                              title={`How well this is sticking: ${mastery}% — the same number on this topic's card in My topics`}
                            >
                              <Meter value={mastery} className="flex-1" />
                              <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                                {mastery}%
                              </span>
                            </span>
                          ) : null}
                        </button>

                        {isOpen && slice.length > 0 ? (
                          <ul className="mt-2 space-y-0.5">
                            {slice.map((sp) => (
                              <li
                                key={sp.id}
                                className="text-[11px] leading-relaxed text-muted-foreground"
                              >
                                <span className="font-mono">{sp.code}</span> {sp.title}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}

                  {/* Stacked under core on narrow screens, where there is no
                      room for the other three columns. */}
                  <div className="mt-2 space-y-2 lg:hidden">
                    {focused.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Focused
                        </p>
                        {focused.map((b) => (
                          <FocusTopicRow
                            key={`${b.topicId}|${b.kind}`}
                            band={b}
                            open={open.has(`focus:${b.topicId}|${b.kind}@${wk}`)}
                            onToggle={() => toggle(`focus:${b.topicId}|${b.kind}@${wk}`)}
                          />
                        ))}
                      </div>
                    ) : null}
                    <CommentCell
                      label="From Ali"
                      value={note?.tutor_comment ?? ""}
                      canEdit={author === "tutor"}
                      busy={saveNote.isPending}
                      onSave={(text) => saveComment(wk, "tutor", text)}
                    />
                    <CommentCell
                      label={base.studentName ? `${base.studentName}'s notes` : "Your notes"}
                      value={note?.student_comment ?? ""}
                      canEdit={author === "student"}
                      busy={saveNote.isPending}
                      onSave={(text) => saveComment(wk, "student", text)}
                    />
                  </div>
                </div>

                <div className="hidden min-w-0 space-y-1 border-l border-border px-3 py-2.5 lg:block">
                  {focused.length === 0 ? (
                    <span className="text-[12px] text-muted-foreground/70">—</span>
                  ) : (
                    focused.map((b) => (
                      <FocusTopicRow
                        key={`${b.topicId}|${b.kind}`}
                        band={b}
                        open={open.has(`focus:${b.topicId}|${b.kind}@${wk}`)}
                        onToggle={() => toggle(`focus:${b.topicId}|${b.kind}@${wk}`)}
                      />
                    ))
                  )}
                </div>

                <div className="hidden min-w-0 border-l border-border px-3 py-2.5 lg:block">
                  <CommentCell
                    value={note?.tutor_comment ?? ""}
                    canEdit={author === "tutor"}
                    busy={saveNote.isPending}
                    onSave={(text) => saveComment(wk, "tutor", text)}
                  />
                </div>
                <div className="hidden min-w-0 border-l border-border px-3 py-2.5 lg:block">
                  <CommentCell
                    value={note?.student_comment ?? ""}
                    canEdit={author === "student"}
                    busy={saveNote.isPending}
                    onSave={(text) => saveComment(wk, "student", text)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          A topic counts as covered at {SETTLED_THRESHOLD}% mastery and stops taking up teaching
          weeks. Rate something lower and it comes back into the plan.
        </p>
        <button
          type="button"
          onClick={onRateTopics}
          className="btn-soft inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Re-rate your topics
        </button>
      </div>
    </div>
  );
}

/**
 * One week's comment, from whichever side owns it.
 *
 * Saves on blur rather than on every keystroke: a comment is a thought someone
 * finishes, and a write per character would be both noisy and a stream of
 * partial sentences in the other person's view. Only writes when the text has
 * actually changed, so tabbing through the grid is not forty no-op upserts.
 *
 * The other side's column is not a disabled input — a greyed-out textarea reads
 * as "you may write here later". It is plain text, or nothing at all.
 */
function CommentCell({
  value,
  canEdit,
  busy,
  onSave,
  label,
}: {
  value: string;
  canEdit: boolean;
  busy?: boolean;
  onSave: (text: string) => void;
  /** Only set in the stacked mobile layout, where there is no column header. */
  label?: string;
}) {
  const [draft, setDraft] = useState(value);
  // Follow the stored value when it actually CHANGES — a refetch after someone
  // else's write — and never otherwise.
  //
  // The first attempt gated this on a `focused` flag instead: "reset the draft
  // unless the box is being typed in". That reverted every keystroke the moment
  // the flag was false for one render, which it was, so the text vanished before
  // blur could save it. Comparing against the last value seen is the pattern
  // that works, because typing does not change `value`.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }

  const body = canEdit ? (
    <textarea
      value={draft}
      disabled={busy}
      rows={2}
      placeholder="Add a note…"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onSave(draft);
      }}
      className="premium-input w-full resize-y rounded-lg px-2 py-1.5 text-[12px] leading-relaxed"
    />
  ) : value ? (
    <p className="whitespace-pre-wrap text-[12px] leading-relaxed">{value}</p>
  ) : (
    <span className="text-[12px] text-muted-foreground/70">—</span>
  );

  if (!label) return body;
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {body}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* My topics                                                           */
/* ------------------------------------------------------------------ */

/**
 * The board in "live" mode: every change is written as it is made.
 *
 * Band placement is derived from the confidence already stored rather than kept
 * as separate UI state, so the board always reflects what the scheduler is
 * actually using — there is no way for the two to drift apart.
 */
function MyTopicsTab({
  base,
  topics,
  specPoints,
}: {
  base: PlannerData;
  topics: Topic[];
  specPoints: SpecPoint[];
}) {
  const rateTopic = useRateTopic(base.studentId);
  const ratePoint = useRateSpecPoint(base.studentId);
  const topicConfidenceQ = useTopicConfidence(base.studentId);
  const { byTopic } = useMemo(() => groupByTopic(topics, specPoints), [topics, specPoints]);
  // Memoised: a bare `?? new Map()` is a fresh object each render, which would
  // rebuild the placement map on every paint.
  const topicConfidence = useMemo(
    () => topicConfidenceQ.data ?? new Map<string, { confidence: number }>(),
    [topicConfidenceQ.data],
  );
  const board = useBoardState();

  // The band comes from the stored TOPIC rating, not from averaging its points.
  //
  // Averaging looked reasonable and was wrong twice over: a topic the student
  // deliberately put in "Confident" slid to "Needs work" the moment they marked
  // one point weak, and — worse — the cascade then compared each point against
  // that averaged value to decide what had been inherited, matched nothing, and
  // quietly updated no points at all.
  //
  // A spec-point rating is a finer, independent signal. It feeds FSRS directly
  // and shows on the point itself; it never reassigns the column.
  const stored = useMemo(() => {
    const out: Record<string, BandId> = {};
    for (const t of topics) out[t.id] = bandOf(topicConfidence.get(t.id)?.confidence);
    return out;
  }, [topics, topicConfidence]);

  const placement = { ...stored, ...board.placement };
  const sorted = topics.filter((t) => (placement[t.id] ?? "new") !== "new").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-xl font-extrabold">How confident do you feel?</p>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Drag each topic into a column to tell us how you feel. The number on each card is
            something different — it&apos;s how well the topic is actually sticking, and it&apos;s
            the same number your plan uses. Open a card to rate its individual points.
          </p>
        </div>
        <span className="chip">
          <span className="numeral">
            {sorted} of {topics.length}
          </span>{" "}
          sorted
        </span>
      </div>

      <ConfidenceBoard
        topics={topics}
        pointsByTopic={byTopic}
        schedule={base.schedule}
        pointConfidence={base.confidence}
        placement={placement}
        order={board.order}
        busy={rateTopic.isPending || ratePoint.isPending}
        showSubject={false}
        mode="live"
        onMove={(topicId, to) => {
          board.move(topicId, to);
          const band = BANDS.find((b) => b.id === to)!;
          rateTopic.mutate(
            {
              topicId,
              confidence: band.confidence,
              points: byTopic.get(topicId) ?? [],
              pointConfidence: base.confidence,
              schedule: base.schedule,
            },
            {
              onSuccess: (r) =>
                toast.success(
                  r.kept > 0
                    ? `${r.updated} points updated, ${r.kept} left as you rated them`
                    : `${r.updated} points updated`,
                ),
              onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
            },
          );
        }}
        onRatePoint={(specPointId, value) =>
          ratePoint.mutate(
            { specPointId, confidence: value, existing: base.schedule.get(specPointId) },
            { onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save") },
          )
        }
      />
    </div>
  );
}
