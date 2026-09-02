/**
 * One student, everything about them: course setup, their sort, this week's
 * plan (with an override), progress, and private notes.
 *
 * This is the screen the product exists for — sorting, planning and arranging a
 * student's topics — so the plan editor is the centre of it rather than a
 * read-only view with an "edit" link somewhere else.
 */
import { useMemo, useState } from "react";
import { Link, createFileRoute, useParams } from "@tanstack/react-router";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorNote,
  MasteryPill,
  Meter,
  PageHeader,
  Spinner,
  StatTile,
} from "@/components/app/Shared";
import {
  BOARD_LABEL,
  LEVEL_LABEL,
  SOURCE_LABEL,
  SUBJECT_LABEL,
  useEnrolments,
} from "@/lib/session";
import { masteryFromRow } from "@/lib/fsrs";
import {
  groupByTopic,
  useCurriculum,
  usePointConfidence,
  useSchedule,
  useWeeklyPlan,
  type SpecPoint,
} from "@/lib/study";
import type { ScheduleRow } from "@/lib/fsrs";
import {
  useOverridePlan,
  useRemoveEnrolment,
  useSaveEnrolment,
  useSyllabusOptions,
  useSaveLevel,
  useSaveNotes,
  useStudent,
  useStudentNotes,
} from "@/lib/tutor";
import { useViewer } from "@/lib/session";
import type { Database } from "@/integrations/supabase/types";
import { formatWeek, weekStartKey } from "@/lib/week";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/tutor/students/$studentId")({
  component: StudentDetail,
});

const SUBJECTS: Database["public"]["Enums"]["subject"][] = ["biology", "chemistry", "physics"];
const BOARDS: Database["public"]["Enums"]["board"][] = ["aqa", "ocr", "edexcel"];
const LEVELS: Database["public"]["Enums"]["level"][] = ["gcse", "igcse", "alevel"];

function StudentDetail() {
  const { studentId } = useParams({ from: "/_app/tutor/students/$studentId" });
  const viewer = useViewer();
  const studentQ = useStudent(studentId);
  const enrolmentsQ = useEnrolments(studentId);
  const curriculumQ = useCurriculum(studentQ.data?.level, enrolmentsQ.data);
  const scheduleQ = useSchedule(studentId);
  const confidenceQ = usePointConfidence(studentId);
  const notesQ = useStudentNotes(studentId);

  const saveLevel = useSaveLevel(studentId);
  const saveEnrolment = useSaveEnrolment(studentId);
  const removeEnrolment = useRemoveEnrolment(studentId);
  const syllabusesQ = useSyllabusOptions(studentQ.data?.level);
  const saveNotes = useSaveNotes(studentId);

  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  const { topics, specPoints } = curriculumQ.data ?? { topics: [], specPoints: [] };
  const schedule = scheduleQ.data ?? new Map();
  const confidence = confidenceQ.data ?? new Map<string, number>();
  const { byTopic } = useMemo(() => groupByTopic(topics, specPoints), [topics, specPoints]);

  const mastery = specPoints.length
    ? Math.round(
        specPoints.reduce(
          (s, sp) => s + masteryFromRow(schedule.get(sp.id), confidence.get(sp.id) ?? null),
          0,
        ) / specPoints.length,
      )
    : 0;

  if (studentQ.isLoading) return <Spinner label="Loading student" />;
  if (studentQ.error) return <ErrorNote error={studentQ.error} />;

  const student = studentQ.data;
  if (!student) {
    return (
      <div className="space-y-4">
        <PageHeader title="Student not found" />
        <Link to="/tutor" className="btn-soft inline-flex rounded-xl px-4 py-2 text-sm">
          Back to students
        </Link>
      </div>
    );
  }

  const enrolments = enrolmentsQ.data ?? [];
  const syllabuses = syllabusesQ.data ?? new Map<string, string[]>();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={SOURCE_LABEL[student.source]}
        title={student.display_name || student.email || "Student"}
      >
        <Link to="/tutor" className="btn-soft rounded-xl px-3 py-1.5 text-sm">
          All students
        </Link>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Course mastery"
          value={`${mastery}%`}
          hint={`${specPoints.length} spec points`}
        />
        <StatTile
          label="Sorted"
          value={student.confidence_seeded_at ? "Yes" : "Not yet"}
          hint={student.confidence_seeded_at ? "Confidence captured" : "Happens on first login"}
        />
        <StatTile
          label="Subjects"
          value={`${enrolments.length}`}
          hint={student.level ? LEVEL_LABEL[student.level] : "No level set"}
        />
      </div>

      {/* ── Course setup ─────────────────────────────────────────────── */}
      <section className="premium-card space-y-4 rounded-2xl p-5">
        <h2 className="font-display text-base font-bold tracking-tight">Course</h2>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Level (shared across subjects)
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() =>
                  saveLevel.mutate(l, {
                    onSuccess: () => toast.success(`Level set to ${LEVEL_LABEL[l]}`),
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
                  })
                }
                className={cn(
                  "rounded-xl border border-border/70 px-3 py-1.5 text-xs font-medium transition-colors",
                  student.level === l
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-card",
                )}
              >
                {LEVEL_LABEL[l]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Subjects and boards
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Board is per subject — a student can sit AQA Biology and OCR Physics. Pick a board to
            enrol them; pick a different one to switch. Removing takes the whole subject off their
            hub.
          </p>
          <div className="mt-2 space-y-2">
            {SUBJECTS.map((subject) => {
              const current = enrolments.find((e) => e.subject === subject);
              return (
                <div
                  key={subject}
                  className="surface-soft flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
                >
                  <span className="w-24 text-sm font-medium">{SUBJECT_LABEL[subject]}</span>
                  {BOARDS.map((board) => (
                    <button
                      key={board}
                      type="button"
                      disabled={saveEnrolment.isPending || removeEnrolment.isPending}
                      onClick={() => {
                        // The syllabus belongs to the OLD board, so it cannot
                        // ride along. Omitting it from the patch would leave it
                        // in place — an Edexcel 9BN0 switched to AQA kept
                        // "9BN0", which matches no AQA topic and empties the
                        // student's curriculum. Where the new board runs only
                        // one syllabus, pick it; otherwise clear it and let the
                        // picker below ask.
                        const options = syllabuses.get(`${subject}:${board}`) ?? [];
                        saveEnrolment.mutate(
                          { subject, board, syllabus: options.length === 1 ? options[0] : null },
                          {
                            onSuccess: () =>
                              toast.success(
                                current
                                  ? `${SUBJECT_LABEL[subject]} switched to ${BOARD_LABEL[board]}`
                                  : `Enrolled in ${BOARD_LABEL[board]} ${SUBJECT_LABEL[subject]}`,
                              ),
                            onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
                          },
                        );
                      }}
                      className={cn(
                        "rounded-lg border border-border/70 px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                        current?.board === board
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:bg-card",
                      )}
                    >
                      {BOARD_LABEL[board]}
                    </button>
                  ))}

                  {current ? (
                    <button
                      type="button"
                      disabled={removeEnrolment.isPending}
                      onClick={() => {
                        // Confirmed because it empties the student's plan and
                        // curriculum for that subject the moment it happens.
                        // Their FSRS cards survive — nothing references
                        // student_enrolments — so re-enrolling restores the
                        // progress rather than starting them over.
                        const ok = window.confirm(
                          `Remove ${SUBJECT_LABEL[subject]} from ${student.display_name || "this student"}?\n\n` +
                            "It disappears from their curriculum, plan and review pages. " +
                            "Their progress is kept, so re-enrolling brings it back.",
                        );
                        if (!ok) return;
                        removeEnrolment.mutate(subject, {
                          onSuccess: () => toast.success(`${SUBJECT_LABEL[subject]} removed`),
                          onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
                        });
                      }}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <X className="size-3.5" aria-hidden />
                      Remove
                    </button>
                  ) : (
                    <span className="ml-auto text-xs text-muted-foreground">Not enrolled</span>
                  )}

                  {current ? (
                    <div className="flex w-full flex-wrap items-center gap-2 border-t border-border/60 pt-2">
                      {/* Only shown where the board actually runs more than one
                          syllabus — offering a single-option picker everywhere
                          would be noise. */}
                      {(syllabuses.get(`${subject}:${current.board}`) ?? []).length > 1 ? (
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          Syllabus
                          <select
                            value={current.syllabus || ""}
                            onChange={(e) =>
                              saveEnrolment.mutate(
                                {
                                  subject,
                                  board: current.board,
                                  syllabus: e.target.value,
                                },
                                {
                                  onSuccess: () =>
                                    toast.success(`Syllabus set to ${e.target.value}`),
                                  onError: (err) =>
                                    toast.error(err instanceof Error ? err.message : "Failed"),
                                },
                              )
                            }
                            className="premium-input h-8 rounded-lg px-2 text-xs"
                          >
                            <option value="">Choose…</option>
                            {(syllabuses.get(`${subject}:${current.board}`) ?? []).map((code) => (
                              <option key={code} value={code}>
                                {code}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : current.syllabus ? (
                        <span className="chip text-xs">{current.syllabus}</span>
                      ) : null}

                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        Exam date
                        <input
                          type="date"
                          defaultValue={current.exam_date ?? ""}
                          onChange={(e) =>
                            saveEnrolment.mutate(
                              {
                                subject,
                                board: current.board,
                                exam_date: e.target.value || null,
                              },
                              {
                                onSuccess: () => toast.success("Exam date saved"),
                                onError: (err) =>
                                  toast.error(err instanceof Error ? err.message : "Failed"),
                              },
                            )
                          }
                          className="premium-input h-8 rounded-lg px-2 text-xs"
                        />
                      </label>

                      {!current.exam_date ? (
                        <span className="text-xs text-amber-700 dark:text-amber-400">
                          No exam date — their year can&apos;t be planned yet.
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── This week ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold tracking-tight">
          Week of {formatWeek(weekStartKey())}
        </h2>
        {enrolments.length === 0 ? (
          <EmptyState
            title="No subjects yet"
            body="Add a subject and board above to plan their week."
          />
        ) : (
          enrolments.map((e) => (
            <PlanEditor
              key={e.id}
              studentId={studentId}
              subject={e.subject}
              board={e.board}
              level={student.level}
              specPoints={specPoints.filter((sp) => {
                const t = topics.find((x) => x.id === sp.topic_id);
                return t?.subject === e.subject;
              })}
              schedule={schedule}
              confidence={confidenceQ.data}
            />
          ))
        )}
      </section>

      {/* ── Progress by topic ────────────────────────────────────────── */}
      {topics.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-display text-lg font-bold tracking-tight">Progress by topic</h2>
          {topics.map((t) => {
            const pts = byTopic.get(t.id) ?? [];
            const m = pts.length
              ? Math.round(
                  pts.reduce(
                    (s, sp) =>
                      s + masteryFromRow(schedule.get(sp.id), confidence.get(sp.id) ?? null),
                    0,
                  ) / pts.length,
                )
              : 0;
            return (
              <div key={t.id} className="premium-card rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {SUBJECT_LABEL[t.subject]} · {pts.length} points
                    </p>
                  </div>
                  <MasteryPill mastery={m} hasCard={m > 0} />
                </div>
                <Meter value={m} className="mt-3" />
              </div>
            );
          })}
        </section>
      ) : null}

      {/* ── Private notes ────────────────────────────────────────────── */}
      <section className="premium-card space-y-3 rounded-2xl p-5">
        <div>
          <h2 className="font-display text-base font-bold tracking-tight">Your notes</h2>
          <p className="text-xs text-muted-foreground">
            Private to you. Students cannot read this — it lives in its own table with no student
            policy.
          </p>
        </div>
        <textarea
          rows={5}
          value={notesDraft ?? notesQ.data?.notes ?? ""}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="What to push on next, what they struggle with, what parents have asked…"
          className="premium-input w-full rounded-xl p-3 text-sm"
        />
        <button
          type="button"
          disabled={saveNotes.isPending || notesDraft === null}
          onClick={() =>
            saveNotes.mutate(notesDraft ?? "", {
              onSuccess: () => {
                setNotesDraft(null);
                toast.success("Notes saved");
              },
              onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
            })
          }
          className="btn-premium rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {saveNotes.isPending ? "Saving…" : "Save notes"}
        </button>
      </section>

      <p className="text-xs text-muted-foreground">
        Signed in as {viewer.profile?.display_name || viewer.user?.email}.
      </p>
    </div>
  );
}

/**
 * The plan editor.
 *
 * Reads the generated plan, then lets the tutor add or drop points. Saving
 * stamps the plan `source: 'tutor'`, which is what stops the scheduler from
 * regenerating over a deliberate choice next time the student loads the page.
 */
function PlanEditor({
  studentId,
  subject,
  board,
  level,
  specPoints,
  schedule,
  confidence,
}: {
  studentId: string;
  subject: Database["public"]["Enums"]["subject"];
  board: Database["public"]["Enums"]["board"];
  level: Database["public"]["Enums"]["level"] | null;
  specPoints: SpecPoint[];
  schedule: Map<string, ScheduleRow>;
  confidence: Map<string, number> | undefined;
}) {
  const week = weekStartKey();
  const override = useOverridePlan();
  const planQ = useWeeklyPlan({
    studentId,
    subject,
    board,
    level,
    specPoints,
    schedule,
    confidence,
    weekStart: week,
    // Looking at a student must not create a plan for them as a side effect.
    autoCreate: false,
  });

  const [picked, setPicked] = useState<string[] | null>(null);
  const current = picked ?? (planQ.data?.points ?? []).map((p) => p.spec_point_id);

  const toggle = (id: string) =>
    setPicked((p) => {
      const base = p ?? current;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });

  return (
    <div className="premium-card space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-sm font-bold">{SUBJECT_LABEL[subject]}</p>
        {planQ.data?.source === "tutor" ? <span className="chip text-xs">Your plan</span> : null}
      </div>

      {specPoints.length === 0 ? (
        <p className="text-sm text-muted-foreground">No spec points loaded for this subject yet.</p>
      ) : (
        <>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {specPoints.map((sp) => {
              const on = current.includes(sp.id);
              const row = schedule.get(sp.id);
              return (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => toggle(sp.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                    on ? "bg-primary/10 text-primary" : "hover:bg-card",
                  )}
                >
                  {on ? (
                    <Minus className="size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <Plus className="size-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono text-xs text-muted-foreground">{sp.code}</span>{" "}
                    {sp.title}
                  </span>
                  <MasteryPill
                    mastery={masteryFromRow(row, confidence?.get(sp.id) ?? null)}
                    hasCard={Boolean(row)}
                  />
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
            <p className="text-xs text-muted-foreground">{current.length} points selected</p>
            <button
              type="button"
              disabled={override.isPending || !level}
              onClick={() =>
                override.mutate(
                  {
                    studentId,
                    subject,
                    board,
                    level: level!,
                    weekStart: week,
                    points: current.map((id, i) => ({
                      spec_point_id: id,
                      // Same rule as the scheduler: a card alone does not mean
                      // taught, because the first-login sort seeds one for every
                      // point. Confidence below the "not covered yet" band keeps
                      // it in the teaching lane.
                      lane:
                        schedule.has(id) && (confidence?.get(id) ?? 50) >= 25
                          ? ("focus" as const)
                          : ("core" as const),
                      origin: "planned" as const,
                      sort_order: i,
                    })),
                  },
                  {
                    onSuccess: () => {
                      setPicked(null);
                      toast.success("Plan saved for this week");
                    },
                    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
                  },
                )
              }
              className="btn-premium rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {override.isPending ? "Saving…" : "Save this week's plan"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
