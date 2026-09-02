/**
 * Tutor-side data. Everything here relies on RLS: these queries are written
 * without a student filter because `private.is_tutor()` is what widens them.
 * A student running the same code gets their own row and nothing else.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Profile } from "@/lib/session";
import type { PlannedPoint } from "@/lib/planner";

export type StudentRow = Profile & { roles: string[] };

export const tutorKeys = {
  students: () => ["tutor", "students"] as const,
  student: (id?: string) => ["tutor", "student", id] as const,
  notes: (id?: string) => ["tutor", "notes", id] as const,
  allTopics: () => ["tutor", "all-topics"] as const,
};

/** Every student, newest first. Tutors are filtered out of their own list. */
export function useStudents() {
  return useQuery({
    queryKey: tutorKeys.students(),
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const roleMap = new Map<string, string[]>();
      for (const r of roles ?? []) {
        roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
      }

      return (profiles ?? [])
        .map((p) => ({ ...p, roles: roleMap.get(p.id) ?? [] }))
        .filter((p) => !p.roles.includes("tutor"));
    },
  });
}

export function useStudent(studentId?: string) {
  return useQuery({
    queryKey: tutorKeys.student(studentId),
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", studentId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Private notes. Their own table, never a column on profiles — see 0001. */
export function useStudentNotes(studentId?: string) {
  return useQuery({
    queryKey: tutorKeys.notes(studentId),
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_tutor_notes")
        .select("*")
        .eq("student_id", studentId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveNotes(studentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notes: string) => {
      if (!studentId) throw new Error("No student");
      const { error } = await supabase
        .from("student_tutor_notes")
        .upsert(
          { student_id: studentId, notes, updated_at: new Date().toISOString() },
          { onConflict: "student_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: tutorKeys.notes(studentId) }),
  });
}

export function useSaveEnrolment(studentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      subject: Database["public"]["Enums"]["subject"];
      board: Database["public"]["Enums"]["board"];
      /**
       * Board qualification code. Required where a board runs more than one.
       * Pass `null` explicitly to clear it — omitting it keeps whatever is
       * stored, which is only correct when the board is not changing.
       */
      syllabus?: string | null;
      exam_date?: string | null;
      target_grade?: string | null;
      current_grade?: string | null;
    }) => {
      if (!studentId) throw new Error("No student");
      // Patch semantics: only send what the caller set, so changing the board
      // does not silently wipe an exam date that was entered separately.
      const patch: Record<string, unknown> = {
        student_id: studentId,
        subject: input.subject,
        board: input.board,
      };
      if (input.syllabus !== undefined) patch.syllabus = input.syllabus || null;
      if (input.exam_date !== undefined) patch.exam_date = input.exam_date;
      if (input.target_grade !== undefined) patch.target_grade = input.target_grade;
      if (input.current_grade !== undefined) patch.current_grade = input.current_grade;

      const { error } = await supabase
        .from("student_enrolments")
        .upsert(patch as never, { onConflict: "student_id,subject" });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function useRemoveEnrolment(studentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (subject: Database["public"]["Enums"]["subject"]) => {
      if (!studentId) throw new Error("No student");
      const { error } = await supabase
        .from("student_enrolments")
        .delete()
        .eq("student_id", studentId)
        .eq("subject", subject);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}

/** Set the student's shared level. Board is per subject and lives on enrolments. */
export function useSaveLevel(studentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (level: Database["public"]["Enums"]["level"]) => {
      if (!studentId) throw new Error("No student");
      const { error } = await supabase.from("profiles").update({ level }).eq("id", studentId);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}

/**
 * Replace a week's plan with the tutor's own choice.
 *
 * Marked `source: 'tutor'` so the scheduler never silently regenerates over it,
 * and so the student's plan can say who set it.
 */
export function useOverridePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      studentId: string;
      subject: Database["public"]["Enums"]["subject"];
      board: Database["public"]["Enums"]["board"];
      level: Database["public"]["Enums"]["level"];
      weekStart: string;
      points: PlannedPoint[];
    }) => {
      const { data: existing } = await supabase
        .from("student_weekly_plans")
        .select("id")
        .eq("student_id", input.studentId)
        .eq("subject", input.subject)
        .eq("week_start", input.weekStart)
        .maybeSingle();

      let planId = existing?.id;

      if (planId) {
        const { error } = await supabase
          .from("student_weekly_plans")
          .update({ source: "tutor" })
          .eq("id", planId);
        if (error) throw error;
        // Points are replaced wholesale rather than diffed: the plan is small,
        // and a partial update risks leaving a stale point behind.
        await supabase.from("student_weekly_plan_points").delete().eq("plan_id", planId);
      } else {
        const { data: created, error } = await supabase
          .from("student_weekly_plans")
          .insert({
            student_id: input.studentId,
            subject: input.subject,
            board: input.board,
            level: input.level,
            week_start: input.weekStart,
            source: "tutor",
          })
          .select("id")
          .single();
        if (error) throw error;
        planId = created.id;
      }

      if (input.points.length > 0) {
        const { error } = await supabase
          .from("student_weekly_plan_points")
          .insert(input.points.map((p, i) => ({ ...p, sort_order: i, plan_id: planId! })));
        if (error) throw error;
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["weekly-plan"] }),
  });
}

/**
 * Which syllabuses exist for a course, so the tutor picks rather than types.
 *
 * Read from the curriculum itself: if a board runs two syllabuses there are two
 * distinct `topics.syllabus` values, and the picker only offers what is
 * actually loaded.
 */
export function useSyllabusOptions(level: Database["public"]["Enums"]["level"] | null | undefined) {
  return useQuery({
    queryKey: ["tutor", "syllabuses", level],
    enabled: Boolean(level),
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("subject, board, syllabus")
        .eq("level", level!);
      if (error) throw error;
      const map = new Map<string, string[]>();
      for (const row of data ?? []) {
        const key = `${row.subject}:${row.board}`;
        const list = map.get(key) ?? [];
        if (row.syllabus && !list.includes(row.syllabus)) list.push(row.syllabus);
        map.set(key, list.sort());
      }
      return map;
    },
  });
}

/** Every topic in the database, for the curriculum authoring screen. */
export function useAllTopics() {
  return useQuery({
    queryKey: tutorKeys.allTopics(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("*")
        .order("level")
        .order("subject")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSpecPointsFor(topicId?: string) {
  return useQuery({
    queryKey: ["tutor", "spec-points", topicId],
    enabled: Boolean(topicId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spec_points")
        .select("*")
        .eq("topic_id", topicId!)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Database["public"]["Tables"]["topics"]["Insert"]) => {
      const { error } = await supabase.from("topics").insert(input);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function useCreateSpecPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Database["public"]["Tables"]["spec_points"]["Insert"]) => {
      const { error } = await supabase.from("spec_points").insert(input);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function useDeleteSpecPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("spec_points").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}

/** The reusable task library. */
export function useResources() {
  return useQuery({
    queryKey: ["tutor", "resources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resources")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      resource: Database["public"]["Tables"]["resources"]["Insert"];
      specPointIds: string[];
    }) => {
      const { data, error } = await supabase
        .from("resources")
        .insert(input.resource)
        .select("id")
        .single();
      if (error) throw error;

      if (input.specPointIds.length > 0) {
        // resource_spec_points is canonical: it is what maps a homework mark
        // back onto the cards it should advance.
        const { error: linkErr } = await supabase
          .from("resource_spec_points")
          .insert(
            input.specPointIds.map((spec_point_id) => ({ resource_id: data.id, spec_point_id })),
          );
        if (linkErr) throw linkErr;
      }
      return data.id;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function useAssignHomework() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      studentId: string;
      resourceId: string;
      assignedBy: string;
      dueAt: string | null;
      note: string | null;
    }) => {
      const { error } = await supabase.from("homework_assignments").insert({
        student_id: input.studentId,
        resource_id: input.resourceId,
        assigned_by: input.assignedBy,
        due_at: input.dueAt,
        note: input.note,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}
