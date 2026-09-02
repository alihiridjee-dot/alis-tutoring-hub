/**
 * Who is signed in, and what may they see.
 *
 * Role lives in `user_roles`, never on the profile, so that a student updating
 * their own profile row can never also change their role. That means "am I the
 * tutor?" is a second query — cached hard here, because it changes roughly
 * never and every guarded route asks.
 */
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type AppRole = Database["public"]["Enums"]["app_role"];
export type Enrolment = Database["public"]["Tables"]["student_enrolments"]["Row"];

export const sessionKeys = {
  user: ["session", "user"] as const,
  profile: (id?: string) => ["session", "profile", id] as const,
  roles: (id?: string) => ["session", "roles", id] as const,
  enrolments: (id?: string) => ["enrolments", id] as const,
};

export function useUser(): UseQueryResult<User | null> {
  return useQuery({
    queryKey: sessionKeys.user,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      // A missing session is a normal state, not a failure — the guard turns it
      // into a redirect. Only surface genuine transport errors.
      if (error && error.name !== "AuthSessionMissingError") throw error;
      return data.user ?? null;
    },
    staleTime: 1000 * 30,
  });
}

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: sessionKeys.profile(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useRoles(userId?: string) {
  return useQuery({
    queryKey: sessionKeys.roles(userId),
    enabled: Boolean(userId),
    // Roles are granted by hand in the Supabase dashboard. Refetching them on
    // every focus is pure noise.
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}

/**
 * The one hook routes actually use.
 *
 * `ready` is deliberately separate from `signedIn`: until the user, profile and
 * roles have all resolved we know nothing, and a guard that acts early would
 * bounce a signed-in tutor to the login page on every hard refresh.
 */
export function useViewer() {
  const userQ = useUser();
  const userId = userQ.data?.id;
  const profileQ = useProfile(userId);
  const rolesQ = useRoles(userId);

  const ready = !userQ.isLoading && (!userId || (!profileQ.isLoading && !rolesQ.isLoading));
  const roles = rolesQ.data ?? [];

  return {
    ready,
    user: userQ.data ?? null,
    signedIn: Boolean(userId),
    profile: profileQ.data ?? null,
    roles,
    isTutor: roles.includes("tutor"),
    isStudent: roles.includes("student"),
    /** Has this student done the one-page sort? Tutors are never asked. */
    needsSort: Boolean(userId) && !roles.includes("tutor") && !profileQ.data?.confidence_seeded_at,
  };
}

export function useEnrolments(studentId?: string) {
  return useQuery({
    queryKey: sessionKeys.enrolments(studentId),
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_enrolments")
        .select("*")
        .eq("student_id", studentId!)
        .order("subject");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    await supabase.auth.signOut();
    qc.clear();
  };
}

/** Subjects and levels read nicely in the UI; the enums do not. */
export const SUBJECT_LABEL: Record<Database["public"]["Enums"]["subject"], string> = {
  biology: "Biology",
  chemistry: "Chemistry",
  physics: "Physics",
};

export const LEVEL_LABEL: Record<Database["public"]["Enums"]["level"], string> = {
  gcse: "GCSE",
  igcse: "International GCSE",
  alevel: "A-Level",
};

export const BOARD_LABEL: Record<Database["public"]["Enums"]["board"], string> = {
  aqa: "AQA",
  ocr: "OCR",
  edexcel: "Edexcel",
};

export const SOURCE_LABEL: Record<Database["public"]["Enums"]["student_source"], string> = {
  independent: "Independent",
  dulwich: "Dulwich Tutors",
  ivy: "Ivy Education",
  bonas: "Bonas MacFarlane",
  referral: "Referral",
  other: "Other",
};
