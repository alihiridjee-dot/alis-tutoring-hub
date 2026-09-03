/**
 * The student's landing screen: what's due, what's next, how it's going.
 *
 * Mastery here is the average across every spec point on the course, counting
 * unseen points as zero. That is deliberately unflattering early on — a student
 * two weeks in should see a small number, because they have covered a small
 * amount. Averaging only over points with cards would show 70% in week one and
 * mean nothing.
 *
 * Order of the page is what's ACTIONABLE first: the week, then homework with a
 * due date, then the standing picture of each subject. Progress is reassurance;
 * homework is a deadline, and it used to sit below two screens of reassurance.
 */
import { useMemo } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, NotebookPen, Sparkle, Target } from "lucide-react";

import {
  EmptyState,
  ErrorNote,
  MasteryPill,
  Meter,
  Milestone,
  PageHeader,
  Ring,
  SectionHeading,
  Spinner,
  StatTile,
} from "@/components/app/Shared";
import { Mascot } from "@/components/app/Doodles";
import { SUBJECT_LABEL, useEnrolments, useViewer } from "@/lib/session";
import { subjectIcon, subjectMascot, subjectTint } from "@/lib/subject";
import { masteryFromRow, type ScheduleRow } from "@/lib/fsrs";
import { groupByTopic, useCurriculum, usePointConfidence, useSchedule } from "@/lib/study";
import { useAssignments } from "@/lib/homework";
import { relativeDay } from "@/lib/week";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

/** Days until a due date, floored to whole days. Negative means overdue. */
function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** Overdue is red, this-week is amber, later is calm. */
function dueTint(iso: string | null): string {
  if (!iso) return "tint-slate";
  const d = daysUntil(iso);
  if (d < 0) return "tint-rose";
  if (d <= 2) return "tint-amber";
  return "tint-primary";
}

function Dashboard() {
  const viewer = useViewer();
  const studentId = viewer.user?.id;

  const enrolmentsQ = useEnrolments(studentId);
  const curriculumQ = useCurriculum(viewer.profile?.level, enrolmentsQ.data);
  const scheduleQ = useSchedule(studentId);
  const confidenceQ = usePointConfidence(studentId);
  const assignmentsQ = useAssignments(studentId);

  const { topics, specPoints } = curriculumQ.data ?? { topics: [], specPoints: [] };
  // Memoised: a bare `?? new Map()` is a fresh object every render, which would
  // invalidate every downstream useMemo on each paint.
  const schedule = useMemo(
    () => scheduleQ.data ?? new Map<string, ScheduleRow>(),
    [scheduleQ.data],
  );
  // Mastery is anchored on the student's own rating, so every surface that
  // prints a mastery number has to pass it or it quotes a neutral 50 and
  // disagrees with the board.
  const confidence = useMemo(
    () => confidenceQ.data ?? new Map<string, number>(),
    [confidenceQ.data],
  );

  const stats = useMemo(() => {
    if (specPoints.length === 0) return { mastery: 0, due: 0, started: 0 };
    let total = 0;
    let due = 0;
    let started = 0;
    const now = Date.now();
    for (const sp of specPoints) {
      const row = schedule.get(sp.id);
      total += masteryFromRow(row, confidence.get(sp.id) ?? null);
      if (row) {
        started += 1;
        if (new Date(row.due).getTime() <= now) due += 1;
      }
    }
    return {
      mastery: Math.round(total / specPoints.length),
      due,
      started,
    };
  }, [specPoints, schedule, confidence]);

  const openHomework = (assignmentsQ.data ?? []).filter((a) => a.status !== "marked");

  const bySubject = useMemo(() => {
    const { byTopic } = groupByTopic(topics, specPoints);
    const groups = new Map<string, { topics: typeof topics; points: number; mastery: number }>();
    for (const t of topics) {
      const g = groups.get(t.subject) ?? { topics: [], points: 0, mastery: 0 };
      const pts = byTopic.get(t.id) ?? [];
      g.topics.push(t);
      g.points += pts.length;
      g.mastery += pts.reduce(
        (sum, sp) => sum + masteryFromRow(schedule.get(sp.id), confidence.get(sp.id) ?? null),
        0,
      );
      groups.set(t.subject, g);
    }
    return [...groups.entries()].map(([subject, g]) => ({
      subject,
      topicCount: g.topics.length,
      points: g.points,
      mastery: g.points ? Math.round(g.mastery / g.points) : 0,
    }));
  }, [topics, specPoints, schedule, confidence]);

  if (enrolmentsQ.isLoading || curriculumQ.isLoading || scheduleQ.isLoading) {
    return <Spinner label="Loading your hub" />;
  }
  if (curriculumQ.error) return <ErrorNote error={curriculumQ.error} />;

  const firstName = (viewer.profile?.display_name || "").split(" ")[0];
  // Genuinely nothing outstanding — the one state on this page worth a party.
  // Gated on having a course at all, so an unseeded account isn't congratulated
  // for a curriculum that hasn't loaded.
  const allClear = specPoints.length > 0 && stats.due === 0 && openHomework.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Your hub"
        title={firstName ? `Hello, ${firstName}` : "Your hub"}
        lede="Everything Ali has set for you, and where the year is up to."
      >
        <Link
          to="/planner"
          search={{ tab: "week" }}
          className="btn-hero inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm"
        >
          See this week
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </PageHeader>

      {/* The headline card: one big number, and the two smaller ones beside it.
          A ring rather than a fourth stat tile because course mastery is the
          number this screen is about, and a row of four equal tiles says
          nothing is. */}
      <section className="pop-card pop-card-hero flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:p-6">
        {/* The one character on a working screen in the whole app: a study stack
            peeking over the top edge of the headline card. `-z-10` puts it
            BEHIND the card's own white fill, so only its head clears the edge —
            which is the whole joke. Hidden on phones, where the card is full
            width and there is no margin for it to sit in. */}
        <Mascot
          name="books"
          size={76}
          idle={false}
          className="peek-in absolute -top-9 right-7 -z-10 hidden sm:block"
        />
        <div className="flex items-center gap-5">
          <Ring value={stats.mastery} size={104} stroke={12}>
            <span className="numeral text-2xl">{stats.mastery}%</span>
          </Ring>
          <div>
            <p className="eyebrow">Course mastery</p>
            <p className="font-display mt-1.5 text-xl font-extrabold sm:text-2xl">
              {stats.started} of {specPoints.length}
            </p>
            <p className="text-sm text-muted-foreground">spec points started</p>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-3">
          <StatTile
            label="Due for review"
            value={`${stats.due}`}
            hint={stats.due ? "Ready when you are" : "Nothing waiting"}
            icon={Target}
            tint={stats.due ? "tint-amber" : "tint-emerald"}
          />
          <StatTile
            label="Open homework"
            value={`${openHomework.length}`}
            hint={openHomework.length ? "Set by Ali" : "All caught up"}
            icon={NotebookPen}
            tint={openHomework.length ? "tint-chem" : "tint-emerald"}
          />
        </div>
      </section>

      {allClear ? (
        <Milestone
          sticker="All clear"
          title="Nothing outstanding"
          body="No homework open and nothing due for review. Good place to be — get ahead on this week if you fancy it."
          mascot="rocket"
        >
          <Link
            to="/planner"
            search={{ tab: "week" }}
            className="btn-soft inline-flex items-center rounded-xl px-4 py-2.5 text-sm"
          >
            Get ahead
          </Link>
        </Milestone>
      ) : null}

      {openHomework.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading title="Homework" hint={`${openHomework.length} open`}>
            <Link to="/homework" className="btn-ghost rounded-xl px-3 py-1.5 text-xs">
              See all
            </Link>
          </SectionHeading>
          <ul className="grid gap-3 sm:grid-cols-2">
            {openHomework.slice(0, 4).map((a) => (
              <li key={a.id} className={dueTint(a.due_at)}>
                <Link
                  to="/homework/$assignmentId"
                  params={{ assignmentId: a.id }}
                  className="pop-card pop-card-interactive flex h-full items-center gap-3 p-4"
                >
                  <span className="icon-tile size-10 shrink-0">
                    <NotebookPen className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{a.resource?.title ?? "Homework"}</p>
                    <p className="mt-0.5 text-xs font-semibold text-[color:var(--tint)]">
                      {a.due_at ? `Due ${relativeDay(a.due_at)}` : "No due date"}
                    </p>
                  </div>
                  <span className="chip shrink-0 capitalize">{a.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {specPoints.length === 0 ? (
        <EmptyState
          title="No curriculum loaded yet"
          body="Once your topics and spec points are in the hub, this page fills up with your progress, your week, and what's due."
          mascot="books"
          mood="sleepy"
        />
      ) : (
        <section className="space-y-3">
          <SectionHeading title="Your subjects" hint="Tap one to open the spec" />
          <div className="grid gap-4 sm:grid-cols-2">
            {bySubject.map((s) => {
              const Icon = subjectIcon(s.subject);
              return (
                <Link
                  key={s.subject}
                  to="/curriculum"
                  className={`${subjectTint(s.subject)} pop-card pop-card-interactive pop-card-banded p-5`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="icon-tile size-11">
                        {Icon ? <Icon className="size-5" aria-hidden /> : null}
                      </span>
                      <div>
                        <p className="font-display text-lg font-extrabold">
                          {SUBJECT_LABEL[s.subject as keyof typeof SUBJECT_LABEL]}
                        </p>
                        <p className="text-xs font-semibold text-muted-foreground">
                          {s.topicCount} topics · {s.points} spec points
                        </p>
                      </div>
                    </div>
                    <MasteryPill mastery={s.mastery} hasCard={s.mastery > 0} />
                  </div>
                  <div className="mt-5 flex items-center gap-4">
                    <Meter value={s.mastery} label className="flex-1" />
                    <Mascot
                      name={subjectMascot(s.subject)}
                      mood={s.mastery >= 70 ? "proud" : "happy"}
                      size={44}
                      inheritTint
                      idle={false}
                      className="hidden sm:block"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          to="/planner"
          search={{ tab: "week" }}
          className="btn-hero inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm"
        >
          <CalendarDays className="size-4" aria-hidden />
          See this week
        </Link>
        <Link
          to="/planner"
          search={{ tab: "plan" }}
          className="btn-soft inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm"
        >
          <Sparkle className="size-4" aria-hidden />
          Open my plan
        </Link>
      </div>
    </div>
  );
}
