/**
 * The year programme: loading it, diffing it, and acknowledging changes.
 *
 * The LIVE pacing is always recomputed from real coverage. `student_program_plan`
 * stores only the last layout the student agreed to, so a slip can be shown as
 * an explicit "your plan has shifted" rather than silently reshuffling their
 * year underneath them.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { deserializeCard, masteryFromRow, type ScheduleRow } from "@/lib/fsrs";
import {
  computePacing,
  diffPacing,
  NEVER_TAUGHT_BELOW,
  overrunWeeks,
  focusBudgetFor,
  focusLoadFor,
  scheduleFocusWeeks,
  selectWeekPoints,
  weightOf,
  type Band,
  type FocusBand,
  type FocusCandidate,
  type FocusLoad,
  type PacingDiff,
  type WeekPoint,
} from "@/lib/pacing";
import type { SpecPoint, Topic } from "@/lib/study";
import { weekStartKey } from "@/lib/week";

type Subject = Database["public"]["Enums"]["subject"];

/**
 * A topic counts as settled — and so stops consuming teaching weeks — once its
 * average mastery clears this. Confidence anchors mastery, so a student who
 * says they are confident CAN settle a topic without practising it. That is
 * intended: a flop later pulls mastery back down, un-settles the topic and
 * re-flows the plan, which is what the acknowledge prompt is for.
 */
export const SETTLED_THRESHOLD = 67;

export type Roadmap = {
  bands: Band[];
  diff: PacingDiff;
  needsAck: boolean;
  programStart: string;
  masteryByTopic: Map<string, number>;
  settledTopics: Set<string>;
  /**
   * The revision lane laid out across the weeks ahead — recomputed from mastery
   * on every load, never persisted, so it always matches the current ratings.
   */
  focusBands: FocusBand[];
  /** Weeks by which teaching overruns the revision window. 0 means it fits. */
  overrun: number;
  /**
   * How the revision lane's weekly load compares with the teaching spine's.
   *
   * `overloaded` means the student's own ratings have asked for more revision
   * than there is new material, which is a year that does not fit in the year.
   */
  focusLoad: FocusLoad;
};

export const programmeKeys = {
  roadmap: (studentId?: string, subject?: string) => ["roadmap", studentId, subject] as const,
};

/**
 * A topic's mastery: the mean of its points'.
 *
 * `confidence` is threaded in rather than left to default because mastery is
 * anchored on what the student said (see `pointMastery`). Dropping it here made
 * the roadmap quote a neutral 50 for every practised point while the board —
 * which does pass it — showed the real number, so the two disagreed about the
 * same topic on the same screen.
 */
function topicMastery(
  points: SpecPoint[],
  schedule: Map<string, ScheduleRow>,
  confidence: Map<string, number>,
): number {
  if (points.length === 0) return 0;
  return Math.round(
    points.reduce(
      (s, p) => s + masteryFromRow(schedule.get(p.id), confidence.get(p.id) ?? null),
      0,
    ) / points.length,
  );
}

export function useRoadmap(args: {
  studentId?: string;
  subject?: Subject;
  examDate?: string | null;
  topics: Topic[];
  specPoints: SpecPoint[];
  schedule?: Map<string, ScheduleRow>;
  /** The student's own spec-point ratings; mastery is anchored on them. */
  confidence?: Map<string, number>;
}) {
  return useQuery({
    queryKey: programmeKeys.roadmap(args.studentId, args.subject),
    enabled:
      Boolean(args.studentId) &&
      Boolean(args.subject) &&
      Boolean(args.examDate) &&
      Boolean(args.schedule),
    queryFn: async (): Promise<Roadmap> => {
      const schedule = args.schedule ?? new Map();
      const confidence = args.confidence ?? new Map<string, number>();
      const byTopic = new Map<string, SpecPoint[]>();
      for (const sp of args.specPoints) {
        const list = byTopic.get(sp.topic_id);
        if (list) list.push(sp);
        else byTopic.set(sp.topic_id, [sp]);
      }

      const masteryByTopic = new Map<string, number>();
      const settledTopics = new Set<string>();
      for (const t of args.topics) {
        const m = topicMastery(byTopic.get(t.id) ?? [], schedule, confidence);
        masteryByTopic.set(t.id, m);
        if (m >= SETTLED_THRESHOLD) settledTopics.add(t.id);
      }

      const { data: stored, error } = await supabase
        .from("student_program_plan")
        .select("program_start, pacing, acknowledged_at")
        .eq("student_id", args.studentId!)
        .eq("subject", args.subject!)
        .maybeSingle();
      if (error) throw error;

      const programStart = stored?.program_start ?? weekStartKey();

      // The revision lane. Candidates are points with evidence behind them that
      // have not settled — untouched material scores zero mastery, which is
      // honest, but it would rank the whole unseen course above anything the
      // student has actually flagged. First contact belongs to the teach spine.
      //
      // "Has evidence" cannot mean "has a card": the first-login sort seeds a
      // card for EVERY point on the course, so nothing is card-less by the time
      // the first plan is built. Without the NEVER_TAUGHT_BELOW test the whole
      // specification became revision backlog — 1,800 candidates asking for
      // three looks each, which the budget dutifully spread as ~140 points a
      // week and the grid rendered as twenty-five focused topics per row. The
      // same test already guards `selectWeekPoints`; both lanes have to agree
      // about what "taught" means or the week and the year describe different
      // students.
      const titleOf = new Map(args.topics.map((t) => [t.id, t.title]));
      const candidates: FocusCandidate[] = [];
      for (const sp of args.specPoints) {
        const hasEvidence = schedule.has(sp.id) || confidence.has(sp.id);
        if (!hasEvidence) continue;
        if ((confidence.get(sp.id) ?? 50) < NEVER_TAUGHT_BELOW) continue;
        const m = masteryFromRow(schedule.get(sp.id), confidence.get(sp.id) ?? null);
        if (m >= SETTLED_THRESHOLD) continue;
        candidates.push({
          specPointId: sp.id,
          topicId: sp.topic_id,
          topicTitle: titleOf.get(sp.topic_id) ?? "",
          code: sp.code,
          pointTitle: sp.title,
          mastery: m,
          weight: weightOf(sp),
        });
      }
      const focusBands = scheduleFocusWeeks({
        candidates,
        coveredTopics: [...settledTopics].map((id) => ({
          topicId: id,
          title: titleOf.get(id) ?? "",
        })),
        currentMonday: weekStartKey(),
        examDate: args.examDate!,
      });
      const focusBudget = focusBudgetFor({
        candidates,
        currentMonday: weekStartKey(),
        examDate: args.examDate!,
      });

      // A topic's share of the timetable is the work in it, not the number of
      // rows: twelve one-line recall statements are not eight practicals.
      const pointWeightByTopic = new Map(
        args.topics.map((t) => [
          t.id,
          (byTopic.get(t.id) ?? []).reduce((s, p) => s + weightOf(p), 0),
        ]),
      );

      const live = computePacing({
        topics: args.topics,
        pointCountByTopic: new Map(
          args.topics.map((t) => [t.id, (byTopic.get(t.id) ?? []).length]),
        ),
        pointWeightByTopic,
        programStart,
        examDate: args.examDate!,
        coveredTopicIds: settledTopics,
      });

      const focusLoad = focusLoadFor({
        budget: focusBudget,
        topicWeights: [...pointWeightByTopic.values()],
        bands: live,
      });

      // First view seeds the baseline so the student is not greeted by a diff
      // against nothing.
      if (!stored) {
        await supabase.from("student_program_plan").upsert(
          {
            student_id: args.studentId!,
            subject: args.subject!,
            program_start: programStart,
            pacing: live as never,
            acknowledged_at: new Date().toISOString(),
          },
          { onConflict: "student_id,subject" },
        );
        return {
          bands: live,
          diff: { changed: false, moved: [] },
          needsAck: false,
          programStart,
          masteryByTopic,
          settledTopics,
          focusBands,
          overrun: overrunWeeks(live, args.examDate!),
          focusLoad,
        };
      }

      const baseline = (stored.pacing as unknown as Band[]) ?? [];
      const diff = diffPacing(baseline, live);
      return {
        bands: live,
        diff,
        needsAck: diff.changed,
        programStart,
        masteryByTopic,
        settledTopics,
        focusBands,
        overrun: overrunWeeks(live, args.examDate!),
        focusLoad,
      };
    },
  });
}

export function useAcknowledgePlan(studentId?: string, subject?: Subject) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bands: Band[]) => {
      if (!studentId || !subject) throw new Error("No student");
      const { error } = await supabase.from("student_program_plan").upsert(
        {
          student_id: studentId,
          subject,
          pacing: bands as never,
          acknowledged_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id,subject" },
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["roadmap"] }),
  });
}

/** The week's points, derived from the programme rather than ranked afresh. */
export function weekFromRoadmap(args: {
  roadmap: Roadmap;
  specPoints: SpecPoint[];
  schedule: Map<string, ScheduleRow>;
  confidence: Map<string, number>;
  weekStart?: string;
}): WeekPoint[] {
  const pointsByTopic = new Map<string, { id: string; sort_order: number; weight: number }[]>();
  for (const sp of args.specPoints) {
    const list = pointsByTopic.get(sp.topic_id);
    // Weight travels with the point: the week's budget is spent in work, and
    // the slice it takes has to be cut the same way the roadmap cut it.
    const entry = { id: sp.id, sort_order: sp.sort_order, weight: weightOf(sp) };
    if (list) list.push(entry);
    else pointsByTopic.set(sp.topic_id, [entry]);
  }
  for (const list of pointsByTopic.values()) list.sort((a, b) => a.sort_order - b.sort_order);

  const stability = new Map<string, number>();
  for (const [id, row] of args.schedule) {
    stability.set(id, deserializeCard(row.card).stability);
  }

  // Settled is per POINT here, not per topic: a point rated 20 inside a topic
  // averaging 80 must still be reachable, or the lane comes up empty for
  // exactly the student who needs it.
  const settled = new Set<string>();
  for (const sp of args.specPoints) {
    const m = masteryFromRow(args.schedule.get(sp.id), args.confidence.get(sp.id) ?? null);
    if (m >= SETTLED_THRESHOLD) settled.add(sp.id);
  }

  return selectWeekPoints({
    bands: args.roadmap.bands,
    weekStart: args.weekStart ?? weekStartKey(),
    pointsByTopic,
    confidence: args.confidence,
    stability,
    settled,
  });
}
