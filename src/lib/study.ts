/**
 * Queries and mutations for everything the student's study data touches:
 * curriculum, confidence, cards, and the weekly plan.
 *
 * A student's course is (profiles.level) × (student_enrolments.subject, board).
 * Level is shared, board is per subject — a student can sit AQA Biology and OCR
 * Physics — so topics are fetched per enrolment and merged, never with one
 * query keyed on a single board.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { buildWeeklyPlan, carryOver, type PlannedPoint } from "@/lib/planner";
import {
  buildReview,
  confidenceToRating,
  deserializeCard,
  type ReviewPayload,
  type ScheduleRow,
} from "@/lib/fsrs";
import { weekStartKey, addWeeks } from "@/lib/week";
import type { Enrolment } from "@/lib/session";

export type Topic = Database["public"]["Tables"]["topics"]["Row"];
export type SpecPoint = Database["public"]["Tables"]["spec_points"]["Row"];
export type Subject = Database["public"]["Enums"]["subject"];
export type Level = Database["public"]["Enums"]["level"];

export const studyKeys = {
  curriculum: (level?: string, enrolments?: Enrolment[]) =>
    [
      "curriculum",
      level,
      (enrolments ?? [])
        .map((e) => `${e.subject}:${e.board}:${e.syllabus ?? ""}`)
        .sort()
        .join(","),
    ] as const,
  schedule: (id?: string) => ["schedule", id] as const,
  topicConfidence: (id?: string) => ["topic-confidence", id] as const,
  pointConfidence: (id?: string) => ["point-confidence", id] as const,
  plan: (id?: string, week?: string) => ["weekly-plan", id, week] as const,
};

/**
 * Every topic and spec point on this student's course.
 *
 * Curriculum is world-readable to any signed-in user and changes only when the
 * tutor authors it, so it is cached for a long time.
 */
export function useCurriculum(
  level: Level | null | undefined,
  enrolments: Enrolment[] | undefined,
) {
  return useQuery({
    queryKey: studyKeys.curriculum(level ?? undefined, enrolments),
    enabled: Boolean(level) && Boolean(enrolments?.length),
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      // One OR'd query rather than N round trips. `and(...)` keeps each
      // subject bound to ITS board, so AQA Biology never pulls in AQA Physics
      // for a student sitting OCR Physics.
      //
      // Syllabus is part of that binding wherever the enrolment names one.
      // Without it, a board that runs two syllabuses for the same subject
      // returns BOTH courses merged: Edexcel A-Level Biology is 9BN0 plus 9BI0,
      // so the student got 18 topics and 357 spec points drawn from two
      // different qualifications, and the tutor's syllabus picker changed
      // nothing. A null syllabus still matches everything, which is what keeps
      // an enrolment made before the picker existed working.
      const filter = enrolments!
        .map((e) => {
          const parts = [`subject.eq.${e.subject}`, `board.eq.${e.board}`];
          if (e.syllabus) parts.push(`syllabus.eq.${e.syllabus}`);
          return `and(${parts.join(",")})`;
        })
        .join(",");

      const { data: topics, error: topicErr } = await supabase
        .from("topics")
        .select("*")
        .eq("level", level!)
        .or(filter)
        .order("subject")
        .order("sort_order");
      if (topicErr) throw topicErr;

      const topicIds = (topics ?? []).map((t) => t.id);
      if (topicIds.length === 0) return { topics: [] as Topic[], specPoints: [] as SpecPoint[] };

      const { data: specPoints, error: spErr } = await supabase
        .from("spec_points")
        .select("*")
        .in("topic_id", topicIds)
        .order("sort_order");
      if (spErr) throw spErr;

      return { topics: topics ?? [], specPoints: specPoints ?? [] };
    },
  });
}

export function useSchedule(studentId?: string) {
  return useQuery({
    queryKey: studyKeys.schedule(studentId),
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_spec_point_schedule")
        .select("*")
        .eq("student_id", studentId!);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.spec_point_id, r as ScheduleRow]));
    },
  });
}

export function useTopicConfidence(studentId?: string) {
  return useQuery({
    queryKey: studyKeys.topicConfidence(studentId),
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_topic_confidence")
        .select("*")
        .eq("student_id", studentId!);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.topic_id, r]));
    },
  });
}

export function usePointConfidence(studentId?: string) {
  return useQuery({
    queryKey: studyKeys.pointConfidence(studentId),
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_spec_point_confidence")
        .select("*")
        .eq("student_id", studentId!);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.spec_point_id, r.confidence]));
    },
  });
}

/**
 * Commit the one-page sort.
 *
 * Three writes, in a deliberate order:
 *   1. topic confidence — what the student actually dragged;
 *   2. spec-point confidence — every point inherits its topic's value, which is
 *      what gives the planner something to rank on before any homework exists;
 *   3. one FSRS review per point, through record_reviews_atomic, so the sort
 *      seeds real cards rather than leaving every point "unseen".
 *
 * Step 3 goes last because it is the only one that is idempotent-by-design
 * (confidence reviews carry source_id = NULL and always insert). If it fails,
 * the confidence rows survive and the student can retry without losing the drag.
 *
 * `confidence_seeded_at` is stamped only after all three succeed — it is the
 * gate that stops the sort reappearing, and setting it early would strand a
 * student with no cards and no way back to the screen that creates them.
 */
export function useCommitSort(studentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      topicConfidence: { topic_id: string; confidence: number; sort_index: number }[];
      specPointsByTopic: Map<string, SpecPoint[]>;
      existing: Map<string, ScheduleRow>;
    }) => {
      if (!studentId) throw new Error("Not signed in");
      const now = new Date();

      const { error: tcErr } = await supabase.from("student_topic_confidence").upsert(
        input.topicConfidence.map((t) => ({
          student_id: studentId,
          topic_id: t.topic_id,
          confidence: t.confidence,
          sort_index: t.sort_index,
          updated_at: now.toISOString(),
        })),
        { onConflict: "student_id,topic_id" },
      );
      if (tcErr) throw tcErr;

      const pointRows: {
        student_id: string;
        spec_point_id: string;
        confidence: number;
        source: string;
      }[] = [];
      const reviews: ReviewPayload[] = [];

      for (const t of input.topicConfidence) {
        for (const sp of input.specPointsByTopic.get(t.topic_id) ?? []) {
          pointRows.push({
            student_id: studentId,
            spec_point_id: sp.id,
            confidence: t.confidence,
            // Inherited from the topic band, so a later drag may update it.
            source: "topic",
          });
          const row = input.existing.get(sp.id);
          reviews.push(
            buildReview({
              studentId,
              specPointId: sp.id,
              existing: row ? deserializeCard(row.card) : null,
              grade: confidenceToRating(t.confidence),
              source: "confidence",
              when: now,
            }),
          );
        }
      }

      if (pointRows.length > 0) {
        const { error: pcErr } = await supabase
          .from("student_spec_point_confidence")
          .upsert(pointRows, { onConflict: "student_id,spec_point_id" });
        if (pcErr) throw pcErr;
      }

      // The RPC caps a batch at 500, so a full course goes up in chunks.
      for (let i = 0; i < reviews.length; i += 400) {
        const { error } = await supabase.rpc("record_reviews_atomic", {
          _reviews: reviews.slice(i, i + 400) as never,
        });
        if (error) throw error;
      }

      const { error: profErr } = await supabase
        .from("profiles")
        .update({ confidence_seeded_at: now.toISOString() })
        .eq("id", studentId);
      if (profErr) throw profErr;

      return reviews.length;
    },
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

/** Re-rate a single spec point. Always inserts a new review — see 0004. */
export function useRateSpecPoint(studentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      specPointId: string;
      confidence: number;
      existing?: ScheduleRow;
    }) => {
      if (!studentId) throw new Error("Not signed in");
      const review = buildReview({
        studentId,
        specPointId: input.specPointId,
        existing: input.existing ? deserializeCard(input.existing.card) : null,
        grade: confidenceToRating(input.confidence),
        source: "confidence",
      });

      const { error } = await supabase.rpc("record_reviews_atomic", {
        _reviews: [review] as never,
      });
      if (error) throw error;

      // Marked as the student's own: a later topic drag must not flatten it.
      const { error: cErr } = await supabase.from("student_spec_point_confidence").upsert(
        {
          student_id: studentId,
          spec_point_id: input.specPointId,
          confidence: input.confidence,
          source: "point",
        },
        { onConflict: "student_id,spec_point_id" },
      );
      if (cErr) throw cErr;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["point-confidence"] });
      // Mastery is anchored on the student's rating, so re-rating one point can
      // settle or un-settle its topic and reflow the whole year. The roadmap
      // used to be left stale here — only a topic drag refreshed it — so the
      // timeline above the board silently disagreed with the card beneath it.
      void qc.invalidateQueries({ queryKey: ["roadmap"] });
    },
  });
}

export type WeeklyPlanView = {
  weekStart: string;
  planId: string | null;
  source: "scheduler" | "tutor";
  points: (PlannedPoint & { specPoint: SpecPoint | undefined })[];
};

/**
 * The week's plan, generated on first read and then left alone.
 *
 * Persisting matters twice over. It stops the week re-ordering under the
 * student as their cards move, so Wednesday's plan matches Monday's. And it
 * stores the LANE each point was given: the focus lane is recomputed live from
 * mastery, so a point that has since settled belongs to no band and a past
 * week's lane would otherwise be unrecoverable.
 *
 * `points` comes from the programme (`weekFromRoadmap`). This hook must never
 * rank points itself — two planners over one student is what produced the
 * original "why is a healthy topic in Focused?" bug.
 */
export function useWeeklyPlan(args: {
  studentId?: string;
  subject?: Subject;
  board?: Database["public"]["Enums"]["board"];
  level?: Level | null;
  specPoints: SpecPoint[];
  schedule?: Map<string, ScheduleRow>;
  confidence?: Map<string, number>;
  weekStart?: string;
  /** Read-only mode for the tutor: never create a plan as a side effect of looking. */
  autoCreate?: boolean;
  /** The programme's slice for this week. Absent means fall back to the scheduler. */
  programmePoints?: PlannedPoint[];
  /**
   * Hold the query until the caller knows whether a programme exists.
   *
   * Without this the fallback scheduler wins a race it should always lose: on
   * first paint the roadmap is still loading, so `programmePoints` is empty,
   * a plan gets written from the fallback, and the programme's slice then finds
   * a row already there and leaves it alone. The week would silently be the
   * wrong one for the rest of the week.
   */
  ready?: boolean;
}) {
  const week = args.weekStart ?? weekStartKey();
  const qc = useQueryClient();

  return useQuery({
    queryKey: studyKeys.plan(args.studentId, `${week}:${args.subject}`),
    enabled:
      args.ready !== false &&
      Boolean(args.studentId) &&
      Boolean(args.subject) &&
      Boolean(args.level) &&
      Boolean(args.schedule) &&
      args.specPoints.length > 0,
    queryFn: async (): Promise<WeeklyPlanView> => {
      const studentId = args.studentId!;
      const byId = new Map(args.specPoints.map((sp) => [sp.id, sp]));

      // Two queries rather than one embedded select: the generated types carry
      // no foreign-key relationships, so PostgREST embedding does not typecheck.
      const { data: existing, error } = await supabase
        .from("student_weekly_plans")
        .select("id, source, week_start")
        .eq("student_id", studentId)
        .eq("subject", args.subject!)
        .eq("week_start", week)
        .maybeSingle();
      if (error) throw error;

      if (existing) {
        const { data: rows, error: ptsErr } = await supabase
          .from("student_weekly_plan_points")
          .select("*")
          .eq("plan_id", existing.id)
          .order("sort_order");
        if (ptsErr) throw ptsErr;

        return {
          weekStart: week,
          planId: existing.id,
          source: existing.source as "scheduler" | "tutor",
          points: (rows ?? []).map((p) => ({
            spec_point_id: p.spec_point_id,
            lane: p.lane as "core" | "focus",
            origin: p.origin as "planned" | "carried_over",
            sort_order: p.sort_order,
            specPoint: byId.get(p.spec_point_id),
          })),
        };
      }

      if (args.autoCreate === false) {
        return { weekStart: week, planId: null, source: "scheduler", points: [] };
      }

      // Nothing stored for this week yet — build it, then persist so it stays put.
      const { data: prev } = await supabase
        .from("student_weekly_plans")
        .select("id")
        .eq("student_id", studentId)
        .eq("subject", args.subject!)
        .eq("week_start", addWeeks(week, -1))
        .maybeSingle();

      let lastWeekPoints: string[] = [];
      if (prev) {
        const { data: prevPts } = await supabase
          .from("student_weekly_plan_points")
          .select("spec_point_id")
          .eq("plan_id", prev.id);
        lastWeekPoints = (prevPts ?? []).map((p) => p.spec_point_id);
      }

      const carried = carryOver(lastWeekPoints, args.schedule ?? new Map(), week);

      // The year programme owns the week. buildWeeklyPlan is the fallback for
      // when no band covers it — a student with no exam date set, or a week
      // past the end of the programme.
      const planned =
        args.programmePoints && args.programmePoints.length > 0
          ? args.programmePoints
          : buildWeeklyPlan({
              specPoints: args.specPoints,
              schedule: args.schedule ?? new Map(),
              confidence: args.confidence ?? new Map(),
              carriedOver: carried,
            });

      if (planned.length === 0) {
        return { weekStart: week, planId: null, source: "scheduler", points: [] };
      }

      const { data: created, error: insErr } = await supabase
        .from("student_weekly_plans")
        .insert({
          student_id: studentId,
          subject: args.subject!,
          board: args.board!,
          level: args.level!,
          week_start: week,
          source: "scheduler",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      const { error: ptErr } = await supabase
        .from("student_weekly_plan_points")
        .insert(planned.map((p) => ({ ...p, plan_id: created.id })));
      if (ptErr) throw ptErr;

      void qc.invalidateQueries({ queryKey: ["weekly-plan"] });

      return {
        weekStart: week,
        planId: created.id,
        source: "scheduler",
        points: planned.map((p) => ({ ...p, specPoint: byId.get(p.spec_point_id) })),
      };
    },
  });
}

/** Group spec points under their topic, preserving the board's teaching order. */
export function groupByTopic(topics: Topic[], specPoints: SpecPoint[]) {
  const map = new Map<string, SpecPoint[]>();
  for (const sp of specPoints) {
    const list = map.get(sp.topic_id);
    if (list) list.push(sp);
    else map.set(sp.topic_id, [sp]);
  }
  for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order);
  return { byTopic: map, topics: topics.slice().sort((a, b) => a.sort_order - b.sort_order) };
}

/**
 * Re-rate a whole topic by dragging it into a band.
 *
 * The cascade rule matters. A topic's band is a broad statement; an individual
 * spec-point rating is a finer, deliberate one. So dragging a topic updates
 * every point that INHERITED the old band value, and leaves alone any point the
 * student has rated individually — otherwise one drag silently destroys all the
 * fine-grained work underneath it.
 *
 * Points that change get a real FSRS review through `record_reviews_atomic`,
 * exactly as the first-login sort does. Nothing here is a display-only value.
 */
export function useRateTopic(studentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      topicId: string;
      confidence: number;
      points: SpecPoint[];
      pointConfidence: Map<string, number>;
      schedule: Map<string, ScheduleRow>;
      sortIndex?: number;
    }) => {
      if (!studentId) throw new Error("Not signed in");
      const now = new Date();

      const { error: tErr } = await supabase.from("student_topic_confidence").upsert(
        {
          student_id: studentId,
          topic_id: input.topicId,
          confidence: input.confidence,
          sort_index: input.sortIndex ?? 0,
          updated_at: now.toISOString(),
        },
        { onConflict: "student_id,topic_id" },
      );
      if (tErr) throw tErr;

      // Which of these points did the student rate individually? Read it
      // rather than inferring it: comparing against the topic's previous value
      // freezes a topic permanently the moment the two diverge.
      const ids = input.points.map((sp) => sp.id);
      const { data: existing, error: srcErr } = await supabase
        .from("student_spec_point_confidence")
        .select("spec_point_id, source")
        .eq("student_id", studentId)
        .in("spec_point_id", ids);
      if (srcErr) throw srcErr;

      const ownRating = new Set(
        (existing ?? []).filter((r) => r.source === "point").map((r) => r.spec_point_id),
      );
      const changed = input.points.filter((sp) => !ownRating.has(sp.id));
      if (changed.length === 0) return { updated: 0, kept: input.points.length };

      const { error: cErr } = await supabase.from("student_spec_point_confidence").upsert(
        changed.map((sp) => ({
          student_id: studentId,
          spec_point_id: sp.id,
          confidence: input.confidence,
          source: "topic",
        })),
        { onConflict: "student_id,spec_point_id" },
      );
      if (cErr) throw cErr;

      const reviews = changed.map((sp) => {
        const row = input.schedule.get(sp.id);
        return buildReview({
          studentId,
          specPointId: sp.id,
          existing: row ? deserializeCard(row.card) : null,
          grade: confidenceToRating(input.confidence),
          source: "confidence",
          when: now,
        });
      });

      for (let i = 0; i < reviews.length; i += 400) {
        const { error } = await supabase.rpc("record_reviews_atomic", {
          _reviews: reviews.slice(i, i + 400) as never,
        });
        if (error) throw error;
      }

      return { updated: changed.length, kept: input.points.length - changed.length };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["schedule"] });
      void qc.invalidateQueries({ queryKey: ["point-confidence"] });
      void qc.invalidateQueries({ queryKey: ["topic-confidence"] });
      void qc.invalidateQueries({ queryKey: ["roadmap"] });
    },
  });
}
