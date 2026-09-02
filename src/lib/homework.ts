/**
 * Homework: assignments, submissions, and the mark that feeds FSRS.
 *
 * A resource is a reusable task in a library; an assignment is the per-student
 * act of setting it. Queries here always join the two by hand — the generated
 * types carry no foreign-key relationships, so PostgREST embedding will not
 * typecheck and a second query is both clearer and no slower at this scale.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  buildReview,
  deserializeCard,
  scoreToRating,
  type ReviewPayload,
  type ScheduleRow,
} from "@/lib/fsrs";

export type Resource = Database["public"]["Tables"]["resources"]["Row"];
export type Assignment = Database["public"]["Tables"]["homework_assignments"]["Row"];
export type Submission = Database["public"]["Tables"]["homework_submissions"]["Row"];
export type Question = Database["public"]["Tables"]["homework_questions"]["Row"];

export type AssignmentView = Assignment & {
  resource: Resource | undefined;
  submission: Submission | undefined;
};

export const homeworkKeys = {
  assignments: (studentId?: string) => ["assignments", studentId] as const,
  assignment: (id?: string) => ["assignment", id] as const,
  resources: () => ["resources"] as const,
  marking: () => ["marking-queue"] as const,
};

async function hydrate(assignments: Assignment[]): Promise<AssignmentView[]> {
  if (assignments.length === 0) return [];

  const resourceIds = [...new Set(assignments.map((a) => a.resource_id))];
  const { data: resources } = await supabase.from("resources").select("*").in("id", resourceIds);
  const byResource = new Map((resources ?? []).map((r) => [r.id, r]));

  const { data: submissions } = await supabase
    .from("homework_submissions")
    .select("*")
    .in(
      "assignment_id",
      assignments.map((a) => a.id),
    )
    .order("submitted_at", { ascending: false });

  // Keep only the newest submission per assignment: a student may resubmit
  // before marking, and the latest is the one that counts.
  const bySubmission = new Map<string, Submission>();
  for (const s of submissions ?? [])
    if (!bySubmission.has(s.assignment_id)) bySubmission.set(s.assignment_id, s);

  return assignments.map((a) => ({
    ...a,
    resource: byResource.get(a.resource_id),
    submission: bySubmission.get(a.id),
  }));
}

export function useAssignments(studentId?: string) {
  return useQuery({
    queryKey: homeworkKeys.assignments(studentId),
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homework_assignments")
        .select("*")
        .eq("student_id", studentId!)
        .order("due_at", { nullsFirst: false });
      if (error) throw error;
      return hydrate(data ?? []);
    },
  });
}

export function useAssignment(assignmentId?: string) {
  return useQuery({
    queryKey: homeworkKeys.assignment(assignmentId),
    enabled: Boolean(assignmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homework_assignments")
        .select("*")
        .eq("id", assignmentId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const [view] = await hydrate([data]);
      const { data: questions } = await supabase
        .from("homework_questions")
        .select("*")
        .eq("resource_id", data.resource_id)
        .order("sort_order");

      return { ...view, questions: questions ?? [] };
    },
  });
}

/** Everything submitted but not yet marked, oldest first. The tutor's queue. */
export function useMarkingQueue() {
  return useQuery({
    queryKey: homeworkKeys.marking(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homework_submissions")
        .select("*")
        .is("graded_at", null)
        .order("submitted_at");
      if (error) throw error;

      const submissions = data ?? [];
      if (submissions.length === 0) return [];

      const { data: assignments } = await supabase
        .from("homework_assignments")
        .select("*")
        .in(
          "id",
          submissions.map((s) => s.assignment_id),
        );
      const byId = new Map((assignments ?? []).map((a) => [a.id, a]));

      const resourceIds = [...new Set((assignments ?? []).map((a) => a.resource_id))];
      const { data: resources } = resourceIds.length
        ? await supabase.from("resources").select("*").in("id", resourceIds)
        : { data: [] as Resource[] };
      const byResource = new Map((resources ?? []).map((r) => [r.id, r]));

      const studentIds = [...new Set(submissions.map((s) => s.student_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", studentIds);
      const byStudent = new Map((profiles ?? []).map((p) => [p.id, p]));

      return submissions.map((s) => {
        const assignment = byId.get(s.assignment_id);
        return {
          submission: s,
          assignment,
          resource: assignment ? byResource.get(assignment.resource_id) : undefined,
          student: byStudent.get(s.student_id),
        };
      });
    },
  });
}

export function useSubmitHomework(studentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      assignmentId: string;
      notes: string;
      answers: { question_id: string; answer_text: string }[];
    }) => {
      if (!studentId) throw new Error("Not signed in");

      const { data: submission, error } = await supabase
        .from("homework_submissions")
        .insert({
          assignment_id: input.assignmentId,
          student_id: studentId,
          notes: input.notes || null,
        })
        .select("*")
        .single();
      if (error) throw error;

      if (input.answers.length > 0) {
        const { error: ansErr } = await supabase.from("homework_answers").insert(
          input.answers.map((a) => ({
            submission_id: submission.id,
            question_id: a.question_id,
            answer_text: a.answer_text,
          })),
        );
        if (ansErr) throw ansErr;
      }

      return submission;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}

/**
 * Mark a submission, and move every spec point the task covered.
 *
 * The mark and the FSRS write are separate calls, and that is a real seam: if
 * the RPC fails the work is still marked but the cards have not moved. It is
 * survivable precisely because the ledger dedupes on the submission id, so the
 * same mark can be replayed later and will apply exactly once. Re-running is
 * safe; skipping is not.
 */
export function useMarkSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      submissionId: string;
      studentId: string;
      resourceId: string;
      scorePct: number;
      grade?: string | null;
      feedback?: string | null;
      markedBy: string;
    }) => {
      const { error } = await supabase
        .from("homework_submissions")
        .update({
          score_pct: input.scorePct,
          grade: input.grade ?? null,
          feedback: input.feedback ?? null,
          graded_at: new Date().toISOString(),
          graded_by: input.markedBy,
        })
        .eq("id", input.submissionId);
      if (error) throw error;

      // resource_spec_points is canonical for "what did this task cover".
      const { data: covered } = await supabase
        .from("resource_spec_points")
        .select("spec_point_id")
        .eq("resource_id", input.resourceId);

      const specPointIds = (covered ?? []).map((r) => r.spec_point_id);
      if (specPointIds.length === 0) return { advanced: 0 };

      const { data: existing } = await supabase
        .from("student_spec_point_schedule")
        .select("*")
        .eq("student_id", input.studentId)
        .in("spec_point_id", specPointIds);
      const byPoint = new Map((existing ?? []).map((r) => [r.spec_point_id, r as ScheduleRow]));

      const grade = scoreToRating(input.scorePct);
      const reviews: ReviewPayload[] = specPointIds.map((id) =>
        buildReview({
          studentId: input.studentId,
          specPointId: id,
          existing: byPoint.has(id) ? deserializeCard(byPoint.get(id)!.card) : null,
          grade,
          source: "homework",
          scorePct: Math.round(input.scorePct),
          // The dedupe key. This is what makes replaying a mark harmless.
          sourceId: input.submissionId,
        }),
      );

      const { error: rpcErr } = await supabase.rpc("record_reviews_atomic", {
        _reviews: reviews as never,
      });
      if (rpcErr) throw rpcErr;

      return { advanced: reviews.length };
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}
