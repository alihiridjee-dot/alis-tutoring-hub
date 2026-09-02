/**
 * The task library, and setting work.
 *
 * A resource is built once and assigned to whoever needs it — that split is the
 * main departure from the previous product, where homework was course-wide and
 * every student on a spec saw the same thing.
 *
 * Linking a resource to spec points is not decoration: `resource_spec_points`
 * is what maps a mark back onto the FSRS cards it should advance. A task with
 * no spec points attached will be markable but will move nothing.
 */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { EmptyState, ErrorNote, PageHeader, Spinner } from "@/components/app/Shared";
import { BOARD_LABEL, LEVEL_LABEL, SUBJECT_LABEL, useViewer } from "@/lib/session";
import {
  useAllTopics,
  useAssignHomework,
  useCreateResource,
  useResources,
  useSpecPointsFor,
  useStudents,
} from "@/lib/tutor";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/tutor/resources")({ component: TutorResources });

const SUBJECTS: Database["public"]["Enums"]["subject"][] = ["biology", "chemistry", "physics"];
const LEVELS: Database["public"]["Enums"]["level"][] = ["gcse", "igcse", "alevel"];

function TutorResources() {
  const viewer = useViewer();
  const resourcesQ = useResources();
  const topicsQ = useAllTopics();
  const studentsQ = useStudents();
  const createResource = useCreateResource();
  const assign = useAssignHomework();

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [subject, setSubject] = useState<Database["public"]["Enums"]["subject"]>("biology");
  const [level, setLevel] = useState<Database["public"]["Enums"]["level"]>("gcse");
  const [topicId, setTopicId] = useState<string | null>(null);
  const [linked, setLinked] = useState<string[]>([]);

  const [assignTo, setAssignTo] = useState<string>("");
  const [assignResource, setAssignResource] = useState<string>("");
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");

  const pointsQ = useSpecPointsFor(topicId ?? undefined);

  if (resourcesQ.isLoading) return <Spinner label="Loading resources" />;
  if (resourcesQ.error) return <ErrorNote error={resourcesQ.error} />;

  const resources = resourcesQ.data ?? [];
  const topics = (topicsQ.data ?? []).filter((t) => t.subject === subject && t.level === level);
  const students = studentsQ.data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Tutor" title="Resources and homework" />

      {/* ── Build a task ─────────────────────────────────────────────── */}
      <section className="premium-card space-y-3 rounded-2xl p-5">
        <h2 className="font-display text-base font-bold tracking-tight">New task</h2>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title, e.g. Osmosis practice questions"
          className="premium-input h-10 w-full rounded-xl px-3 text-sm"
        />
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          placeholder="Instructions the student sees every time this is set"
          className="premium-input w-full rounded-xl p-3 text-sm"
        />

        <div className="grid gap-2 sm:grid-cols-3">
          <select
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value as typeof subject);
              setTopicId(null);
              setLinked([]);
            }}
            className="premium-input h-10 rounded-xl px-3 text-sm"
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {SUBJECT_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value as typeof level);
              setTopicId(null);
              setLinked([]);
            }}
            className="premium-input h-10 rounded-xl px-3 text-sm"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
          <select
            value={topicId ?? ""}
            onChange={(e) => setTopicId(e.target.value || null)}
            className="premium-input h-10 rounded-xl px-3 text-sm"
          >
            <option value="">Pick a topic…</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({BOARD_LABEL[t.board]})
              </option>
            ))}
          </select>
        </div>

        {topicId ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Spec points this covers
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Marking this task advances exactly these points. Attach none and the mark moves
              nothing.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(pointsQ.data ?? []).map((sp) => {
                const on = linked.includes(sp.id);
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() =>
                      setLinked((l) => (on ? l.filter((x) => x !== sp.id) : [...l, sp.id]))
                    }
                    className={cn(
                      "rounded-lg border border-border/70 px-2.5 py-1 text-xs transition-colors",
                      on ? "border-primary bg-primary/10 text-primary" : "hover:bg-card",
                    )}
                  >
                    {sp.code}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          disabled={!title.trim() || !viewer.user || createResource.isPending}
          onClick={() =>
            createResource.mutate(
              {
                resource: {
                  kind: "homework",
                  title: title.trim(),
                  instructions: instructions.trim() || null,
                  subject,
                  level,
                  created_by: viewer.user!.id,
                },
                specPointIds: linked,
              },
              {
                onSuccess: () => {
                  setTitle("");
                  setInstructions("");
                  setLinked([]);
                  toast.success("Task added to your library");
                },
                onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
              },
            )
          }
          className="btn-premium rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {createResource.isPending ? "Saving…" : "Add to library"}
        </button>
      </section>

      {/* ── Set it ───────────────────────────────────────────────────── */}
      <section className="premium-card space-y-3 rounded-2xl p-5">
        <h2 className="font-display text-base font-bold tracking-tight">Set homework</h2>

        {resources.length === 0 || students.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {resources.length === 0
              ? "Build a task above first."
              : "No students to set work for yet."}
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={assignResource}
                onChange={(e) => setAssignResource(e.target.value)}
                className="premium-input h-10 rounded-xl px-3 text-sm"
              >
                <option value="">Which task…</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
              <select
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                className="premium-input h-10 rounded-xl px-3 text-sm"
              >
                <option value="">Which student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name || s.email}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="premium-input h-10 rounded-xl px-3 text-sm"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note for this student, this time (optional)"
                className="premium-input h-10 rounded-xl px-3 text-sm"
              />
            </div>

            <button
              type="button"
              disabled={!assignResource || !assignTo || !viewer.user || assign.isPending}
              onClick={() =>
                assign.mutate(
                  {
                    studentId: assignTo,
                    resourceId: assignResource,
                    assignedBy: viewer.user!.id,
                    // A bare date means end of that day, not midnight at its start.
                    dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : null,
                    note: note.trim() || null,
                  },
                  {
                    onSuccess: () => {
                      setNote("");
                      setDueAt("");
                      toast.success("Homework set");
                    },
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
                  },
                )
              }
              className="btn-premium rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {assign.isPending ? "Setting…" : "Set homework"}
            </button>
          </>
        )}
      </section>

      {/* ── Library ──────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold tracking-tight">Your library</h2>
        {resources.length === 0 ? (
          <EmptyState
            title="Nothing in the library yet"
            body="Tasks you build appear here, ready to set to any student."
          />
        ) : (
          <ul className="space-y-2">
            {resources.map((r) => (
              <li key={r.id} className="premium-card rounded-2xl p-4">
                <p className="text-sm font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {SUBJECT_LABEL[r.subject]} · {LEVEL_LABEL[r.level]} · {r.kind}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
