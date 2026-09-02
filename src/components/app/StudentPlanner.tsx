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
import { bandForWeek, weekSliceOf, weeksOf, type FocusBand } from "@/lib/pacing";
import {
  SETTLED_THRESHOLD,
  useAcknowledgePlan,
  useRoadmap,
  weekFromRoadmap,
} from "@/lib/programme";
import { SUBJECT_LABEL, useViewer, type Enrolment } from "@/lib/session";
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
import { formatWeek, weekStartKey } from "@/lib/week";
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
    <div className="premium-card overflow-hidden rounded-2xl">
      <div className="border-b border-border/70 px-4 pt-4 sm:px-5">
        {enrolments.length > 1 ? (
          <div
            className="mb-3 flex flex-wrap items-center gap-1.5"
            role="tablist"
            aria-label="Subject"
          >
            {enrolments.map((e) => (
              <button
                key={e.id}
                type="button"
                role="tab"
                aria-selected={e.subject === active.subject}
                onClick={() => setPickedSubject(e.subject)}
                className={cn(
                  "h-8 rounded-full px-3.5 text-sm font-medium transition-colors",
                  e.subject === active.subject
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {SUBJECT_LABEL[e.subject]}
              </button>
            ))}
          </div>
        ) : null}

        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Planner sections">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onTabChange(key)}
              aria-current={tab === key ? "page" : undefined}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3.5 text-sm font-medium transition-colors",
                tab === key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
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

  /** The spine band this week sits in — the core topic, points outstanding or not. */
  const band = roadmap ? bandForWeek(roadmap.bands, thisWeek) : undefined;
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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Week of {formatWeek(thisWeek)} · {total} spec point{total === 1 ? "" : "s"}
        </p>
        {planQ.data?.source === "tutor" ? <span className="chip text-xs">Set by Ali</span> : null}
      </div>

      {planQ.error ? <ErrorNote error={planQ.error} /> : null}

      <div className="grid items-stretch gap-4 md:grid-cols-2">
        {/* Core — the curriculum, on schedule for the exam. */}
        <section className="flex h-full flex-col rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="mb-1 flex items-center gap-1.5">
            {covered ? (
              <>
                <CheckCircle2
                  className="size-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
                <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  Core topic · covered
                </span>
              </>
            ) : (
              <>
                <CircleDot className="size-3.5 text-primary" aria-hidden />
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                  Core topic
                </span>
              </>
            )}
            {band ? (
              <span className="ml-auto text-[11px] text-muted-foreground">
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
        <section className="premium-card flex h-full flex-col rounded-xl p-4">
          <div className="mb-1 flex items-center gap-1.5">
            <FocusedTopicsLabel className="text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400" />
            {focusCount > 0 ? (
              <span className="ml-auto text-[11px] text-muted-foreground">
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
                      className="font-semibold text-primary hover:underline"
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
          className="btn-soft rounded-xl px-4 py-2 text-xs"
        >
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
    <div>
      <p className="font-display text-lg font-semibold leading-snug">{title}</p>
      {mastery != null ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{masteryLabel}</span>
            <span className="font-semibold tabular-nums">{mastery}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                accent === "rose" ? "bg-rose-500" : "bg-primary",
              )}
              style={{ width: `${Math.max(2, mastery)}%` }}
            />
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function SpecPointList({ points }: { points: PlanPointView[] }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          This week&apos;s spec points
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground/70">{points.length}</span>
      </div>
      <div className="space-y-1.5">
        {points.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-2.5 py-2"
          >
            <p className="min-w-0 flex-1 text-sm">
              <span className="mr-1.5 text-[11px] font-semibold text-muted-foreground">
                {p.code}
              </span>
              {p.title}
              {p.carried ? (
                <span
                  className="ml-1.5 inline-flex h-5 items-center gap-1 rounded-md bg-muted px-1.5 align-middle text-[10px] font-medium text-muted-foreground"
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-3">
        <span className="inline-flex items-center gap-2">
          <CalendarClock className="size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="block text-[13px] font-semibold leading-tight">
              Exams from{" "}
              {new Date(enrolment.exam_date).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              Every week below is paced from this date.
            </span>
          </span>
        </span>
        <span className="text-[12px] text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {covered} of {topics.length}
          </span>{" "}
          topics covered
        </span>
      </div>

      {roadmap.overrun > 0 ? (
        <div className="rounded-2xl border border-rose-300/70 bg-rose-50 p-4 text-sm dark:border-rose-900/70 dark:bg-rose-950/40">
          <p className="font-semibold text-rose-900 dark:text-rose-200">
            This course doesn&apos;t fit before the exam
          </p>
          <p className="mt-1 text-xs leading-relaxed text-rose-900/90 dark:text-rose-200/90">
            {topics.length} topics need at least a week each, which is {roadmap.overrun} week
            {roadmap.overrun === 1 ? "" : "s"} more than there is between now and the revision
            run-up. The later topics are scheduled past that point. Ali will need to double up some
            weeks, start earlier, or set some topics as self-study.
          </p>
        </div>
      ) : null}

      {roadmap.needsAck ? (
        <div className="rounded-2xl border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-800/70 dark:bg-amber-950/40">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="size-4" aria-hidden />
            Your plan has shifted
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-amber-900/90 dark:text-amber-200/90">
            {roadmap.diff.moved.slice(0, 4).map((m) => (
              <li key={m.title}>
                {m.title} — now starts {formatWeek(m.to)} (was {formatWeek(m.from)})
              </li>
            ))}
            {roadmap.diff.moved.length > 4 ? (
              <li>and {roadmap.diff.moved.length - 4} more</li>
            ) : null}
          </ul>
          <button
            type="button"
            disabled={acknowledge.isPending}
            onClick={() =>
              acknowledge.mutate(roadmap.bands, {
                onSuccess: () => toast.success("Plan updated"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
              })
            }
            className="btn-premium mt-3 rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-60"
          >
            {acknowledge.isPending ? "Updating…" : "Got it, update my plan"}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">Core</span> is the course in order.{" "}
          <span className="font-semibold text-foreground">Focused</span> comes back until it sticks.
        </p>
        <FocusKey />
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <div
          className={cn(
            GRID_COLS,
            "border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
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
            const core = bandForWeek(roadmap.bands, wk);
            const focused = focusByWeek.get(wk) ?? [];
            const isNow = wk === thisWeek;
            const mastery = core ? (roadmap.masteryByTopic.get(core.topicId) ?? 0) : 0;
            const allPoints = core ? (byTopic.get(core.topicId) ?? []) : [];
            // This week's slice of the topic, not the whole topic: a band says
            // "Topic 1, six weeks", and which three points belong to THIS week
            // existed nowhere before.
            const slice = core ? weekSliceOf(core, wk, allPoints) : [];
            const rowKey = core ? `${core.topicId}@${wk}` : "";
            const isOpen = open.has(rowKey);
            const note = notesQ.data?.get(wk);
            const done = note?.completed ?? false;

            return (
              <div
                key={wk}
                className={cn(GRID_COLS, isNow && "bg-primary/5", done && "opacity-70")}
              >
                <div className="flex flex-col justify-center gap-1 px-3 py-2.5">
                  {isNow ? (
                    <span className="inline-flex w-fit items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                      <CircleDot className="size-3" aria-hidden /> Now
                    </span>
                  ) : null}
                  <span className="text-[13px] font-medium tabular-nums">{formatWeek(wk)}</span>
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

                <div className="min-w-0 border-l border-border px-3 py-2.5">
                  {core ? (
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
                          {core.kind === "revision"
                            ? "Revision — the run-up to the exam"
                            : core.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {roadmap.settledTopics.has(core.topicId) ? (
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
                      {core.kind === "teach" && allPoints.length > 0 ? (
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
                  ) : (
                    <span className="text-[12px] text-muted-foreground/70">—</span>
                  )}

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
          className="btn-soft rounded-xl px-4 py-2 text-xs"
        >
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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">How confident do you feel?</p>
          <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Drag each topic into a column to tell us how you feel. The number on each card is
            something different — it&apos;s how well the topic is actually sticking, and it&apos;s
            the same number your plan uses. Open a card to rate its individual points.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {sorted} of {topics.length} topics sorted
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
