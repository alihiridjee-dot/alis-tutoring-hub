/**
 * The student's landing screen: what's due, what's next, how it's going.
 *
 * Mastery here is the average across every spec point on the course, counting
 * unseen points as zero. That is deliberately unflattering early on — a student
 * two weeks in should see a small number, because they have covered a small
 * amount. Averaging only over points with cards would show 70% in week one and
 * mean nothing.
 */
import { useMemo } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";

import {
  EmptyState,
  ErrorNote,
  MasteryPill,
  Meter,
  PageHeader,
  Spinner,
  StatTile,
} from "@/components/app/Shared";
import { SUBJECT_LABEL, useEnrolments, useViewer } from "@/lib/session";
import { masteryFromRow, type ScheduleRow } from "@/lib/fsrs";
import { groupByTopic, useCurriculum, usePointConfidence, useSchedule } from "@/lib/study";
import { useAssignments } from "@/lib/homework";
import { relativeDay } from "@/lib/week";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

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

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Your hub" title={firstName ? `Hello, ${firstName}` : "Your hub"} />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Course mastery"
          value={`${stats.mastery}%`}
          hint={`${stats.started} of ${specPoints.length} spec points started`}
        />
        <StatTile
          label="Due for review"
          value={`${stats.due}`}
          hint={stats.due ? "Ready when you are" : "Nothing waiting"}
        />
        <StatTile
          label="Open homework"
          value={`${openHomework.length}`}
          hint={openHomework.length ? "Set by Ali" : "All caught up"}
        />
      </div>

      {specPoints.length === 0 ? (
        <EmptyState
          title="No curriculum loaded yet"
          body="Once your topics and spec points are in the hub, this page fills up with your progress, your week, and what's due."
        />
      ) : (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold tracking-tight">Your subjects</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {bySubject.map((s) => (
              <Link
                key={s.subject}
                to="/curriculum"
                className="premium-card-interactive rounded-2xl p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-base font-semibold">
                      {SUBJECT_LABEL[s.subject as keyof typeof SUBJECT_LABEL]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.topicCount} topics · {s.points} spec points
                    </p>
                  </div>
                  <MasteryPill mastery={s.mastery} hasCard={s.mastery > 0} />
                </div>
                <Meter value={s.mastery} className="mt-4" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {openHomework.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold tracking-tight">Homework</h2>
          <ul className="space-y-2">
            {openHomework.slice(0, 4).map((a) => (
              <li key={a.id}>
                <Link
                  to="/homework/$assignmentId"
                  params={{ assignmentId: a.id }}
                  className="premium-card-interactive flex items-center justify-between gap-3 rounded-2xl p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {a.resource?.title ?? "Homework"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.due_at ? `Due ${relativeDay(a.due_at)}` : "No due date"}
                    </p>
                  </div>
                  <span className="chip shrink-0 text-xs">{a.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link
          to="/planner"
          search={{ tab: "week" }}
          className="btn-premium rounded-xl px-4 py-2 text-sm font-semibold"
        >
          See this week
        </Link>
        <Link
          to="/planner"
          search={{ tab: "plan" }}
          className="btn-soft rounded-xl px-4 py-2 text-sm"
        >
          Open my plan
        </Link>
      </div>
    </div>
  );
}
