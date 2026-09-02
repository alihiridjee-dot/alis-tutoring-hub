/**
 * The student's curriculum browser: every topic and spec point on their course,
 * with where they stand on each.
 *
 * Collapsed by default — a full GCSE specification is hundreds of points, and
 * an expanded wall of them is unreadable. The topic header carries the roll-up
 * so a student can find the weak areas without opening anything.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Video } from "lucide-react";

import {
  EmptyState,
  ErrorNote,
  MasteryPill,
  Meter,
  PageHeader,
  Spinner,
} from "@/components/app/Shared";
import { SUBJECT_LABEL, useEnrolments, useViewer } from "@/lib/session";
import { masteryFromRow } from "@/lib/fsrs";
import { groupByTopic, useCurriculum, usePointConfidence, useSchedule } from "@/lib/study";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/curriculum")({ component: CurriculumPage });

function CurriculumPage() {
  const viewer = useViewer();
  const studentId = viewer.user?.id;
  const enrolmentsQ = useEnrolments(studentId);
  const curriculumQ = useCurriculum(viewer.profile?.level, enrolmentsQ.data);
  const scheduleQ = useSchedule(studentId);
  const confidenceQ = usePointConfidence(studentId);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { topics, specPoints } = curriculumQ.data ?? { topics: [], specPoints: [] };
  const schedule = scheduleQ.data ?? new Map();
  const confidence = confidenceQ.data ?? new Map<string, number>();
  const { byTopic } = useMemo(() => groupByTopic(topics, specPoints), [topics, specPoints]);

  const bySubject = useMemo(() => {
    const groups = new Map<string, typeof topics>();
    for (const t of topics) {
      const list = groups.get(t.subject);
      if (list) list.push(t);
      else groups.set(t.subject, [t]);
    }
    return [...groups.entries()];
  }, [topics]);

  if (enrolmentsQ.isLoading || curriculumQ.isLoading || scheduleQ.isLoading) {
    return <Spinner label="Loading your curriculum" />;
  }
  if (curriculumQ.error) return <ErrorNote error={curriculumQ.error} />;

  if (topics.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Curriculum" title="Your specification" />
        <EmptyState
          title="No curriculum loaded yet"
          body="Your topics and spec points haven't been added to the hub yet. Once they are, every point on your specification shows here with your progress against it."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Curriculum" title="Your specification" />

      {bySubject.map(([subject, subjectTopics]) => (
        <section key={subject} className="space-y-2">
          <h2 className="font-display text-lg font-bold tracking-tight">
            {SUBJECT_LABEL[subject as keyof typeof SUBJECT_LABEL]}
          </h2>

          {subjectTopics.map((topic) => {
            const points = byTopic.get(topic.id) ?? [];
            const mastery = points.length
              ? Math.round(
                  points.reduce(
                    (s, sp) =>
                      s + masteryFromRow(schedule.get(sp.id), confidence.get(sp.id) ?? null),
                    0,
                  ) / points.length,
                )
              : 0;
            const isOpen = open[topic.id] ?? false;

            return (
              <div key={topic.id} className="premium-card overflow-hidden rounded-2xl">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [topic.id]: !isOpen }))}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <ChevronRight
                    className={cn("size-4 shrink-0 transition-transform", isOpen && "rotate-90")}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{topic.title}</p>
                    <p className="text-xs text-muted-foreground">{points.length} spec points</p>
                    <Meter value={mastery} className="mt-2" />
                  </div>
                  <MasteryPill mastery={mastery} hasCard={mastery > 0} />
                </button>

                {isOpen ? (
                  <ul className="border-t border-border/70">
                    {points.map((sp) => {
                      const row = schedule.get(sp.id);
                      return (
                        <li
                          key={sp.id}
                          className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-2.5 last:border-b-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm">
                              <span className="font-mono text-xs text-muted-foreground">
                                {sp.code}
                              </span>{" "}
                              {sp.title}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {sp.video_url ? (
                              <a
                                href={sp.video_url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="btn-soft inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs"
                              >
                                <Video className="size-3.5" aria-hidden />
                                Video
                              </a>
                            ) : null}
                            <MasteryPill mastery={masteryFromRow(row)} hasCard={Boolean(row)} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
