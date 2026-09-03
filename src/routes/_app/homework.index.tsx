/**
 * The student's homework list.
 *
 * "Overdue" is derived here from due_at vs now, never read from a column — the
 * schema deliberately has no stored overdue state, so it cannot go stale.
 */
import { Link, createFileRoute } from "@tanstack/react-router";

import { NotebookPen } from "lucide-react";

import {
  EmptyState,
  ErrorNote,
  PageHeader,
  SectionHeading,
  Spinner,
} from "@/components/app/Shared";
import { useViewer } from "@/lib/session";
import { useAssignments, type AssignmentView } from "@/lib/homework";
import { daysUntil, relativeDay } from "@/lib/week";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/homework/")({ component: HomeworkList });

/**
 * The status of a piece of work, as a label plus the tint that colours its whole
 * row.
 *
 * `tint-*` rather than `bg-*`: the design system's `.chip` and `.pop-card` rules
 * are unlayered CSS and beat a Tailwind background utility on the same element,
 * so the old `bg-emerald-100` values were being silently discarded.
 */
function statusOf(a: AssignmentView): { label: string; tint: string } {
  if (a.status === "marked") {
    const score = a.submission?.score_pct;
    return {
      label: score == null ? "Marked" : `Marked · ${Math.round(Number(score))}%`,
      tint: "tint-emerald",
    };
  }
  if (a.status === "submitted") return { label: "Waiting to be marked", tint: "tint-primary" };
  if (a.due_at && daysUntil(a.due_at) < 0) return { label: "Overdue", tint: "tint-rose" };
  if (a.due_at && daysUntil(a.due_at) <= 2) return { label: "Due soon", tint: "tint-amber" };
  return { label: "To do", tint: "tint-slate" };
}

function HomeworkList() {
  const viewer = useViewer();
  const assignmentsQ = useAssignments(viewer.user?.id);

  if (assignmentsQ.isLoading) return <Spinner label="Loading your homework" />;
  if (assignmentsQ.error) return <ErrorNote error={assignmentsQ.error} />;

  const assignments = assignmentsQ.data ?? [];
  const open = assignments.filter((a) => a.status !== "marked");
  const done = assignments.filter((a) => a.status === "marked");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Homework"
        title="Your work"
        icon={NotebookPen}
        lede="Everything Ali has set you, and everything he's marked."
      />

      {assignments.length === 0 ? (
        <EmptyState
          mascot="books"
          mood="sleepy"
          title="Nothing set — enjoy it while it lasts"
          body="When Ali sets you a task it appears here, with its due date and anywhere you need to type an answer."
        />
      ) : null}

      {open.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading title="To do" hint={`${open.length} open`} />
          <div className="space-y-3">
            {open.map((a) => (
              <Row key={a.id} assignment={a} />
            ))}
          </div>
        </section>
      ) : null}

      {done.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading title="Marked" hint={`${done.length} done`} />
          <div className="space-y-3">
            {done.map((a) => (
              <Row key={a.id} assignment={a} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Row({ assignment }: { assignment: AssignmentView }) {
  const status = statusOf(assignment);
  return (
    <Link
      to="/homework/$assignmentId"
      params={{ assignmentId: assignment.id }}
      className={cn(status.tint, "pop-card pop-card-interactive flex items-center gap-3.5 p-4")}
    >
      <span className="icon-tile size-11 shrink-0">
        <NotebookPen className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-base font-extrabold">
          {assignment.resource?.title ?? "Homework"}
        </p>
        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
          {assignment.due_at ? `Due ${relativeDay(assignment.due_at)}` : "No due date"}
        </p>
      </div>
      <span className="chip shrink-0">{status.label}</span>
    </Link>
  );
}
