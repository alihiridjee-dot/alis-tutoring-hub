/**
 * One piece of homework: the task, the answer boxes, and the mark once it lands.
 *
 * Submitting is one-way from the student's side — RLS lets them update a
 * submission only while `graded_at` is null, so once Ali has marked it the
 * record is fixed. The mark scheme is never fetched here; it stays server-side
 * until after marking.
 */
import { useState } from "react";
import { Link, createFileRoute, useParams } from "@tanstack/react-router";
import { toast } from "sonner";

import { ErrorNote, PageHeader, Spinner } from "@/components/app/Shared";
import { useViewer } from "@/lib/session";
import { useAssignment, useSubmitHomework } from "@/lib/homework";
import { relativeDay } from "@/lib/week";

export const Route = createFileRoute("/_app/homework/$assignmentId")({ component: HomeworkDetail });

function HomeworkDetail() {
  const { assignmentId } = useParams({ from: "/_app/homework/$assignmentId" });
  const viewer = useViewer();
  const assignmentQ = useAssignment(assignmentId);
  const submit = useSubmitHomework(viewer.user?.id);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  if (assignmentQ.isLoading) return <Spinner label="Loading" />;
  if (assignmentQ.error) return <ErrorNote error={assignmentQ.error} />;

  const a = assignmentQ.data;
  if (!a) {
    return (
      <div className="space-y-4">
        <PageHeader title="Not found" />
        <p className="text-sm text-muted-foreground">
          This homework doesn't exist, or isn't yours.{" "}
          <Link to="/homework" className="underline">
            Back to homework
          </Link>
        </p>
      </div>
    );
  }

  const submitted = Boolean(a.submission);
  const marked = a.status === "marked";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Homework" title={a.resource?.title ?? "Homework"} />

      <div className="premium-card space-y-3 rounded-2xl p-5">
        {a.due_at ? (
          <p className="text-sm text-muted-foreground">Due {relativeDay(a.due_at)}</p>
        ) : null}
        {a.resource?.instructions ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.resource.instructions}</p>
        ) : null}
        {a.note ? (
          <div className="surface-soft rounded-xl p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Note from Ali
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{a.note}</p>
          </div>
        ) : null}
      </div>

      {marked && a.submission ? (
        <div className="premium-card space-y-2 rounded-2xl p-5">
          <p className="eyebrow">Your mark</p>
          <p className="font-display text-3xl font-bold">
            {a.submission.score_pct == null
              ? "—"
              : `${Math.round(Number(a.submission.score_pct))}%`}
            {a.submission.grade ? (
              <span className="ml-2 text-base font-semibold text-muted-foreground">
                {a.submission.grade}
              </span>
            ) : null}
          </p>
          {a.submission.feedback ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.submission.feedback}</p>
          ) : null}
        </div>
      ) : null}

      {a.questions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold tracking-tight">Questions</h2>
          {a.questions.map((q, i) => (
            <div key={q.id} className="premium-card rounded-2xl p-4">
              <p className="text-sm font-medium">
                {i + 1}. {q.prompt}{" "}
                <span className="text-xs text-muted-foreground">
                  ({q.marks} mark{q.marks === 1 ? "" : "s"})
                </span>
              </p>
              <textarea
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((s) => ({ ...s, [q.id]: e.target.value }))}
                disabled={submitted}
                rows={3}
                placeholder={submitted ? "Submitted" : "Your answer"}
                className="premium-input mt-2 w-full rounded-xl p-3 text-sm disabled:opacity-60"
              />
            </div>
          ))}
        </section>
      ) : null}

      {!submitted ? (
        <div className="premium-card space-y-3 rounded-2xl p-5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Anything to tell Ali?
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional — where you got stuck, what you weren't sure about"
            className="premium-input w-full rounded-xl p-3 text-sm"
          />
          <button
            type="button"
            disabled={submit.isPending}
            onClick={() =>
              submit.mutate(
                {
                  assignmentId,
                  notes,
                  answers: Object.entries(answers)
                    .filter(([, v]) => v.trim().length > 0)
                    .map(([question_id, answer_text]) => ({ question_id, answer_text })),
                },
                {
                  onSuccess: () => toast.success("Submitted — Ali will mark it"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit"),
                },
              )
            }
            className="btn-premium rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {submit.isPending ? "Submitting…" : "Hand it in"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Handed in {a.submission?.submitted_at ? relativeDay(a.submission.submitted_at) : ""}.
          {marked ? "" : " Ali will mark it soon."}
        </p>
      )}
    </div>
  );
}
