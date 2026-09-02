/**
 * The one-page confidence sort: the first pass over the board.
 *
 * Same component the ongoing planner uses, in "seed" mode — everything stays
 * local until the student commits, because committing writes an FSRS card for
 * every spec point on the course and a half-finished attempt should leave no
 * trace. After this, the board lives on /planner and saves as you go.
 *
 * Spec points are deliberately NOT expandable here. There are no cards yet, so
 * there is nothing to refine; and asking someone to rate several hundred
 * statements before they have seen the course is how you get a page nobody
 * finishes. Topic bands seed the points; refinement comes later.
 */
import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { ConfidenceBoard } from "@/components/app/ConfidenceBoard";
import { BANDS, useBoardState } from "@/lib/bands";
import { EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/app/Shared";
import { useEnrolments, useViewer } from "@/lib/session";
import { deferSort } from "@/lib/sort-deferral";
import {
  groupByTopic,
  useCommitSort,
  useCurriculum,
  usePointConfidence,
  useSchedule,
} from "@/lib/study";

export const Route = createFileRoute("/_app/sort")({ component: SortPage });

function SortPage() {
  const navigate = useNavigate();
  const viewer = useViewer();
  const studentId = viewer.user?.id;

  const enrolmentsQ = useEnrolments(studentId);
  const curriculumQ = useCurriculum(viewer.profile?.level, enrolmentsQ.data);
  const scheduleQ = useSchedule(studentId);
  // Passed to the board even though the seed sort cannot rate points. A student
  // arriving here can already have cards — a re-sort, or points touched by
  // homework — and without their real ratings mastery falls back to a neutral
  // 50, so every untouched topic in the tray printed a confident-looking "45"
  // that meant nothing.
  const confidenceQ = usePointConfidence(studentId);
  const commit = useCommitSort(studentId);
  const board = useBoardState();

  const { topics, specPoints } = curriculumQ.data ?? { topics: [], specPoints: [] };
  const { byTopic } = useMemo(() => groupByTopic(topics, specPoints), [topics, specPoints]);

  const placed = topics.filter((t) => (board.placement[t.id] ?? "new") !== "new").length;

  const onSubmit = () => {
    const rows = BANDS.flatMap((band) => {
      const explicit = board.order[band.id]
        .map((id) => topics.find((t) => t.id === id))
        .filter(Boolean) as typeof topics;
      const rest = topics.filter(
        (t) => (board.placement[t.id] ?? "new") === band.id && !board.order[band.id].includes(t.id),
      );
      return [...explicit, ...rest].map((t, i) => ({
        topic_id: t.id,
        confidence: band.confidence,
        sort_index: i,
      }));
    });

    commit.mutate(
      { topicConfidence: rows, specPointsByTopic: byTopic, existing: scheduleQ.data ?? new Map() },
      {
        onSuccess: (count) => {
          toast.success(`Set up ${count} spec points from your answers`);
          void navigate({ to: "/planner", replace: true });
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
      },
    );
  };

  if (enrolmentsQ.isLoading || curriculumQ.isLoading || scheduleQ.isLoading) {
    return <Spinner label="Loading your course" />;
  }
  if (curriculumQ.error) return <ErrorNote error={curriculumQ.error} />;

  const noCourse = (enrolmentsQ.data ?? []).length === 0 || !viewer.profile?.level;

  if (noCourse || topics.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="First things first" title="Let's sort your topics" />
        <EmptyState
          title={
            noCourse ? "Your course isn't set up yet" : "The curriculum hasn't been loaded yet"
          }
          body={
            noCourse
              ? "Ali needs to set your level and which subjects and exam boards you're taking before this can be filled in. He'll sort it — nothing for you to do."
              : "Your subjects are set, but the topic list for them hasn't been loaded into the hub yet. Once it is, you'll be asked to sort it the next time you log in."
          }
        />
        <button
          type="button"
          onClick={() => {
            deferSort();
            void navigate({ to: "/dashboard", replace: true });
          }}
          className="btn-soft rounded-xl px-4 py-2 text-sm"
        >
          Continue to my dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="First things first" title="How well do you know each topic?" />

      <div className="premium-card rounded-2xl p-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Everything starts in the <strong>Not covered yet</strong> tray. Drag each topic you have
          already met into the column that matches how you feel about it right now — or open a card
          and use the buttons. Be honest: a topic you mark <strong>Confident</strong> comes back
          round much less often, so over-rating it just means you see it less.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          You can change any of this later, topic by topic or point by point, on your plan.
        </p>
      </div>

      <ConfidenceBoard
        topics={topics}
        pointsByTopic={byTopic}
        schedule={scheduleQ.data ?? new Map()}
        pointConfidence={confidenceQ.data ?? new Map()}
        placement={board.placement}
        order={board.order}
        onMove={board.move}
        busy={commit.isPending}
        mode="seed"
      />

      <div className="premium-card sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <p className="text-sm text-muted-foreground">
          {placed} of {topics.length} topics sorted.
        </p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={commit.isPending}
          className="btn-premium rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {commit.isPending ? "Setting up your plan…" : "Save and build my plan"}
        </button>
      </div>
    </div>
  );
}
