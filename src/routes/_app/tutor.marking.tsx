/**
 * The marking queue.
 *
 * Marking is the only graded signal that feeds FSRS in this product, so this
 * screen is what keeps every student's schedule moving. A score here writes the
 * mark and then advances every spec point the task was linked to.
 *
 * If the card write fails after the mark lands, re-marking is safe: the ledger
 * dedupes on the submission id, so the same mark applies exactly once no matter
 * how many times it is replayed.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { GraduationCap } from "lucide-react";

import { EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/app/Shared";
import { useViewer } from "@/lib/session";
import { useMarkingQueue, useMarkSubmission } from "@/lib/homework";
import { relativeDay } from "@/lib/week";

export const Route = createFileRoute("/_app/tutor/marking")({ component: MarkingPage });

function MarkingPage() {
  const viewer = useViewer();
  const queueQ = useMarkingQueue();
  const mark = useMarkSubmission();
  const [drafts, setDrafts] = useState<
    Record<string, { score: string; grade: string; feedback: string }>
  >({});
  // Which row is in flight. `mark.isPending` is one flag for the whole queue,
  // so using it directly greyed out every other submission's button while one
  // was saving — on a queue of ten that reads as the page having frozen.
  const [marking, setMarking] = useState<string | null>(null);

  if (queueQ.isLoading) return <Spinner label="Loading the queue" />;
  if (queueQ.error) return <ErrorNote error={queueQ.error} />;

  const queue = queueQ.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tutor"
        title="Marking"
        icon={GraduationCap}
        lede="A score here advances every spec point the task was linked to."
      >
        {queue.length > 0 ? <span className="sticker">{queue.length} waiting</span> : null}
      </PageHeader>

      {queue.length === 0 ? (
        <EmptyState
          mascot="rocket"
          mood="proud"
          title="Queue's empty"
          body="Work handed in by students lands here, oldest first. Nothing to do right now."
        />
      ) : (
        <ul className="space-y-3">
          {queue.map(({ submission, assignment, resource, student }) => {
            const draft = drafts[submission.id] ?? { score: "", grade: "", feedback: "" };
            const set = (patch: Partial<typeof draft>) =>
              setDrafts((d) => ({ ...d, [submission.id]: { ...draft, ...patch } }));

            return (
              <li key={submission.id} className="pop-card space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg font-extrabold">
                      {resource?.title ?? "Homework"}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                      {student?.display_name || student?.email} · handed in{" "}
                      {relativeDay(submission.submitted_at)}
                    </p>
                  </div>
                </div>

                {submission.notes ? (
                  <div className="surface-soft p-3.5">
                    <p className="eyebrow">Their note</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-medium">
                      {submission.notes}
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-[6rem_6rem_1fr]">
                  <input
                    value={draft.score}
                    onChange={(e) => set({ score: e.target.value })}
                    inputMode="numeric"
                    placeholder="Score %"
                    className="premium-input h-11 rounded-xl px-3 text-sm font-semibold"
                  />
                  <input
                    value={draft.grade}
                    onChange={(e) => set({ grade: e.target.value })}
                    placeholder="Grade"
                    className="premium-input h-11 rounded-xl px-3 text-sm font-semibold"
                  />
                  <input
                    value={draft.feedback}
                    onChange={(e) => set({ feedback: e.target.value })}
                    placeholder="Feedback"
                    className="premium-input h-11 rounded-xl px-3 text-sm font-medium"
                  />
                </div>

                <button
                  type="button"
                  disabled={
                    marking === submission.id ||
                    !assignment ||
                    !viewer.user ||
                    draft.score.trim() === "" ||
                    Number.isNaN(Number(draft.score))
                  }
                  onClick={() => {
                    const score = Math.max(0, Math.min(100, Number(draft.score)));
                    setMarking(submission.id);
                    mark.mutate(
                      {
                        submissionId: submission.id,
                        studentId: submission.student_id,
                        resourceId: assignment!.resource_id,
                        scorePct: score,
                        grade: draft.grade.trim() || null,
                        feedback: draft.feedback.trim() || null,
                        markedBy: viewer.user!.id,
                      },
                      {
                        onSettled: () => setMarking(null),
                        onSuccess: (r) =>
                          toast.success(
                            r.advanced > 0
                              ? `Marked — ${r.advanced} spec points advanced`
                              : "Marked. No spec points were linked to this task, so nothing moved.",
                          ),
                        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
                      },
                    );
                  }}
                  className="btn-hero rounded-xl px-5 py-2.5 text-sm disabled:opacity-50"
                >
                  {marking === submission.id ? "Marking…" : "Mark and advance"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
