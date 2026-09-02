/**
 * The week's two comments and its tick.
 *
 * One row per (student, subject, week). Both parties write to the same row but
 * each owns one column: the student ticks the week off and writes their side,
 * the tutor writes theirs. That split is enforced in the database by a trigger
 * (migration 0009), not here — a client-side check is a courtesy, not a control,
 * and anyone can PATCH PostgREST directly.
 *
 * Rows are created lazily. A year is forty-odd weeks per subject and almost all
 * of them will never be commented on, so seeding the grid up front would write
 * thousands of empty rows to make a handful of real ones easier to find.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type WeekNote = Database["public"]["Tables"]["student_week_notes"]["Row"];
type Subject = Database["public"]["Enums"]["subject"];

/** Which column the viewer is allowed to write. */
export type NoteAuthor = "tutor" | "student";

export const weekNoteKeys = {
  all: (studentId?: string, subject?: string) => ["week-notes", studentId, subject] as const,
};

export function useWeekNotes(studentId?: string, subject?: Subject) {
  return useQuery({
    queryKey: weekNoteKeys.all(studentId, subject),
    enabled: Boolean(studentId) && Boolean(subject),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_week_notes")
        .select("*")
        .eq("student_id", studentId!)
        .eq("subject", subject!);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.week_start, r]));
    },
  });
}

/**
 * Write one field of one week.
 *
 * Upsert rather than update: the row usually does not exist yet, and the first
 * thing anyone does to a week — a tick or a comment — should not have to know
 * whether it is creating or amending.
 */
export function useSaveWeekNote(studentId?: string, subject?: Subject) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      weekStart: string;
      completed?: boolean;
      comment?: { author: NoteAuthor; text: string };
    }) => {
      if (!studentId || !subject) throw new Error("No student");
      // One RPC, and it is the SERVER that decides which column this lands in —
      // from `private.is_tutor()`, not from anything the client says. The
      // client cannot name a column, so it cannot name the wrong one.
      //
      // This replaced a direct upsert. On an upsert PostgREST omits the columns
      // you did not send, the BEFORE INSERT pass therefore sees the tutor
      // column at its default '', and the authorship trigger fired at the
      // student for touching a column they had not touched.
      const { error } = await supabase.rpc("set_week_note", {
        _student_id: studentId,
        _subject: subject,
        _week_start: input.weekStart,
        // null means "leave this alone" — the two fields are written
        // independently, so ticking a week must not blank a comment.
        _completed: input.completed ?? null,
        _comment: input.comment?.text ?? null,
      });

      // Rethrown as a real Error: a PostgrestError is a plain object, so every
      // `e instanceof Error ? e.message : "Could not save"` at a call site
      // silently discards what the database actually said.
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["week-notes"] }),
  });
}
