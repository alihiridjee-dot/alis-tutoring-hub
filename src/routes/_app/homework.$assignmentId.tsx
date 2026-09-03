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

import { ErrorNote, PageHeader, Ring, SectionHeading, Spinner } from "@/components/app/Shared";
import { Confetti, Mascot } from "@/components/app/Doodles";
import { useViewer } from "@/lib/session";
import { useAssignment, useSubmitHomework } from "@/lib/homework";
import { relativeDay } from "@/lib/week";
import { cn } from "@/lib/utils";

/** Green for a strong mark, amber for a middling one, rose for a weak one. */
function scoreTint(score: number | string | null | undefined): string {
  if (score == null) return "tint-primary";
  const n = Number(score);
  if (n >= 70) return "tint-emerald";
  if (n >= 45) return "tint-amber";
  return "tint-rose";
}

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
        <p className="text-sm font-medium text-muted-foreground">
          This homework doesn&apos;t exist, or isn&apos;t yours.{" "}
          <Link
            to="/homework"
            className="font-bold text-[color:var(--primary)] underline decoration-2 underline-offset-2"
          >
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
      <PageHeader eyebrow="Homework" title={a.resource?.title ?? "Homework"}>
        <Link to="/homework" className="btn-soft rounded-xl px-4 py-2 text-xs">
          All homework
        </Link>
      </PageHeader>

      <div className="pop-card space-y-4 p-5">
        {a.due_at ? <span className="chip">Due {relativeDay(a.due_at)}</span> : null}
        {a.resource?.instructions ? (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
            {a.resource.instructions}
          </p>
        ) : null}
        {a.note ? (
          <div className="surface-soft p-3.5">
            <p className="eyebrow">Note from Ali</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-medium">{a.note}</p>
          </div>
        ) : null}
      </div>

      {marked && a.submission ? (
        <div
          className={cn(
            // The mark colours its own card: a 38% and an 88% should not look
            // like the same event.
            scoreTint(a.submission.score_pct),
            "banner-strip relative overflow-hidden p-5 sm:p-6",
          )}
        >
          {Number(a.submission.score_pct ?? 0) >= 80 ? <Confetti /> : null}
          <div className="flex flex-wrap items-center gap-5">
            {a.submission.score_pct == null ? (
              <Mascot name="star" size={80} idle={false} />
            ) : (
              <Ring value={Number(a.submission.score_pct)} size={96} stroke={11}>
                <span className="numeral text-xl">
                  {Math.round(Number(a.submission.score_pct))}%
                </span>
              </Ring>
            )}
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Your mark</p>
              <p className="font-display mt-1 text-2xl font-extrabold">
                {a.submission.grade ? a.submission.grade : "Marked"}
              </p>
              {a.submission.feedback ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {a.submission.feedback}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {a.questions.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading title="Questions" hint={`${a.questions.length} to answer`} />
          {a.questions.map((q, i) => (
            <div key={q.id} className="pop-card p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="icon-tile numeral size-8 shrink-0 text-sm">{i + 1}</span>
                <p className="flex-1 text-[15px] font-semibold leading-snug">
                  {q.prompt}{" "}
                  <span className="chip ml-1 align-middle">
                    {q.marks} mark{q.marks === 1 ? "" : "s"}
                  </span>
                </p>
              </div>
              <textarea
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((s) => ({ ...s, [q.id]: e.target.value }))}
                disabled={submitted}
                rows={3}
                placeholder={submitted ? "Submitted" : "Your answer"}
                className="premium-input mt-3 w-full rounded-xl p-3.5 text-sm disabled:opacity-60"
              />
            </div>
          ))}
        </section>
      ) : null}

      {!submitted ? (
        <div className="pop-card space-y-3 p-5">
          <label className="eyebrow">Anything to tell Ali?</label>
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
            className="btn-hero rounded-xl px-6 py-3 text-sm disabled:opacity-60"
          >
            {submit.isPending ? "Submitting…" : "Hand it in"}
          </button>
        </div>
      ) : (
        <div className="surface-soft flex items-center gap-4 p-4">
          <Mascot name="rocket" mood={marked ? "proud" : "happy"} size={56} />
          <p className="text-sm font-semibold">
            Handed in {a.submission?.submitted_at ? relativeDay(a.submission.submitted_at) : ""}.
            {marked ? "" : " Ali will mark it soon."}
          </p>
        </div>
      )}
    </div>
  );
}
