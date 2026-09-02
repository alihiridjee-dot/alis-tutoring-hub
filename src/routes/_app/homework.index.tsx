/**
 * The student's homework list.
 *
 * "Overdue" is derived here from due_at vs now, never read from a column — the
 * schema deliberately has no stored overdue state, so it cannot go stale.
 */
import { Link, createFileRoute } from "@tanstack/react-router";

import { EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/app/Shared";
import { useViewer } from "@/lib/session";
import { useAssignments, type AssignmentView } from "@/lib/homework";
import { daysUntil, relativeDay } from "@/lib/week";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/homework/")({ component: HomeworkList });

function statusOf(a: AssignmentView): { label: string; cls: string } {
  if (a.status === "marked") {
    const score = a.submission?.score_pct;
    return {
      label: score == null ? "Marked" : `Marked · ${Math.round(Number(score))}%`,
      cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    };
  }
  if (a.status === "submitted") {
    return {
      label: "Waiting to be marked",
      cls: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
    };
  }
  if (a.due_at && daysUntil(a.due_at) < 0) {
    return {
      label: "Overdue",
      cls: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
    };
  }
  return { label: "To do", cls: "bg-muted text-muted-foreground" };
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
      <PageHeader eyebrow="Homework" title="Your work" />

      {assignments.length === 0 ? (
        <EmptyState
          title="No homework set"
          body="When Ali sets you a task it appears here, with its due date and anywhere you need to type an answer."
        />
      ) : null}

      {open.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-bold tracking-tight">To do</h2>
          {open.map((a) => (
            <Row key={a.id} assignment={a} />
          ))}
        </section>
      ) : null}

      {done.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-bold tracking-tight">Marked</h2>
          {done.map((a) => (
            <Row key={a.id} assignment={a} />
          ))}
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
      className="premium-card-interactive flex items-center justify-between gap-3 rounded-2xl p-4"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{assignment.resource?.title ?? "Homework"}</p>
        <p className="text-xs text-muted-foreground">
          {assignment.due_at ? `Due ${relativeDay(assignment.due_at)}` : "No due date"}
        </p>
      </div>
      <span className={cn("chip shrink-0 text-xs", status.cls)}>{status.label}</span>
    </Link>
  );
}
