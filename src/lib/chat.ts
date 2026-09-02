/**
 * Messaging. Threads are pinned to a spec point or a homework assignment, so a
 * question is always attached to the thing it is about.
 *
 * RLS does the scoping: a student's `select` returns only their own threads,
 * the tutor's returns everyone's. The same query therefore serves both, and
 * neither side needs to pass a student id it could get wrong.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Thread = Database["public"]["Tables"]["chat_threads"]["Row"];
export type Message = Database["public"]["Tables"]["chat_messages"]["Row"];

export type ThreadView = Thread & {
  studentName: string;
  specPointLabel: string | null;
  lastMessage: string | null;
};

export const chatKeys = {
  threads: () => ["chat-threads"] as const,
  messages: (threadId?: string) => ["chat-messages", threadId] as const,
};

export function useThreads() {
  return useQuery({
    queryKey: chatKeys.threads(),
    queryFn: async (): Promise<ThreadView[]> => {
      const { data, error } = await supabase
        .from("chat_threads")
        .select("*")
        .order("last_message_at", { ascending: false });
      if (error) throw error;

      const threads = data ?? [];
      if (threads.length === 0) return [];

      const studentIds = [...new Set(threads.map((t) => t.student_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", studentIds);
      const byStudent = new Map((profiles ?? []).map((p) => [p.id, p]));

      const pointIds = threads
        .map((t) => t.spec_point_id)
        .filter((id): id is string => Boolean(id));
      const { data: points } = pointIds.length
        ? await supabase.from("spec_points").select("id, code, title").in("id", pointIds)
        : { data: [] as { id: string; code: string; title: string }[] };
      const byPoint = new Map((points ?? []).map((p) => [p.id, p]));

      // One query for the newest message across all threads, then folded per
      // thread — cheaper than a query per row when the list gets long.
      const { data: recent } = await supabase
        .from("chat_messages")
        .select("thread_id, body, created_at")
        .in(
          "thread_id",
          threads.map((t) => t.id),
        )
        .order("created_at", { ascending: false });
      const lastByThread = new Map<string, string>();
      for (const m of recent ?? [])
        if (!lastByThread.has(m.thread_id)) lastByThread.set(m.thread_id, m.body);

      return threads.map((t) => {
        const point = t.spec_point_id ? byPoint.get(t.spec_point_id) : undefined;
        const profile = byStudent.get(t.student_id);
        return {
          ...t,
          studentName: profile?.display_name || profile?.email || "Student",
          specPointLabel: point ? `${point.code} ${point.title}` : null,
          lastMessage: lastByThread.get(t.id) ?? null,
        };
      });
    },
  });
}

export function useMessages(threadId?: string) {
  return useQuery({
    queryKey: chatKeys.messages(threadId),
    enabled: Boolean(threadId),
    // Chat is the one surface where staleness is felt immediately.
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("thread_id", threadId!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { threadId: string; senderId: string; body: string }) => {
      const { error } = await supabase.from("chat_messages").insert({
        thread_id: input.threadId,
        sender_id: input.senderId,
        body: input.body,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: chatKeys.messages(vars.threadId) });
      void qc.invalidateQueries({ queryKey: chatKeys.threads() });
    },
  });
}

export function useStartThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      studentId: string;
      senderId: string;
      subject: string;
      body: string;
      specPointId?: string | null;
      assignmentId?: string | null;
    }) => {
      const { data: thread, error } = await supabase
        .from("chat_threads")
        .insert({
          student_id: input.studentId,
          subject: input.subject,
          spec_point_id: input.specPointId ?? null,
          assignment_id: input.assignmentId ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;

      const { error: msgErr } = await supabase.from("chat_messages").insert({
        thread_id: thread.id,
        sender_id: input.senderId,
        body: input.body,
      });
      if (msgErr) throw msgErr;

      return thread;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: chatKeys.threads() }),
  });
}
