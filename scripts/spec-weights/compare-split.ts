/**
 * Did the weights actually level the weeks out?
 *
 * Runs the SHIPPED planner — `computePacing` and `splitAcrossWeeks` from
 * src/lib/pacing.ts, not a model of them — over every course in the seed, twice:
 *
 *   BEFORE  bands sized by row count, weeks cut into equal counts
 *   AFTER   bands sized by work, weeks cut into equal work
 *
 * Both are then measured the same way: the real weight of the points that
 * landed in each teaching week. The ratio of the heaviest week to the lightest
 * is the number that matters — it is how much the student's week varies for
 * reasons that have nothing to do with them.
 *
 *   bun run scripts/spec-weights/compare-split.ts
 */
import { computePacing, crowdedWeeks, splitAcrossWeeks, weightOf, type Band } from "@/lib/pacing";
import { addWeeks } from "@/lib/week";
import type { Database } from "@/integrations/supabase/types";

import topicsJson from "../../supabase/seed/topics.json";
import pointsJson from "../../supabase/seed/spec_points.json";

type Topic = Database["public"]["Tables"]["topics"]["Row"];
type Point = { id: string; topic_id: string; sort_order: number; weight: number };

/**
 * One school year: the first Monday of September to the middle of the summer
 * exam series. Not the first paper — a student sitting three sciences is still
 * being taught the last of them while the first is already examined.
 */
const PROGRAM_START = "2026-09-07";
const EXAM_DATE = "2027-05-28";

const topics = topicsJson as unknown as Topic[];
const points = pointsJson as unknown as Point[];

const bySyllabus = new Map<string, Topic[]>();
for (const t of topics) {
  const list = bySyllabus.get(t.syllabus!) ?? [];
  list.push(t);
  bySyllabus.set(t.syllabus!, list);
}
const byTopic = new Map<string, Point[]>();
for (const p of points) {
  const list = byTopic.get(p.topic_id) ?? [];
  list.push(p);
  byTopic.set(p.topic_id, list);
}
for (const list of byTopic.values()) list.sort((a, b) => a.sort_order - b.sort_order);

/**
 * The real work in every teaching week of a programme.
 *
 * Summed BY WEEK, not by band: two small topics can share a week, and counting
 * each band's chunk separately would report that week twice at half its size.
 */
function weeklyWork(bands: Band[], weighted: boolean): number[] {
  const byWeek = new Map<string, number>();
  for (const band of bands) {
    if (band.kind !== "teach" || band.weeks === 0) continue;
    const pts = byTopic.get(band.topicId) ?? [];
    // BEFORE cut by count (every point one unit); AFTER cut by work.
    const chunks = splitAcrossWeeks(pts, band.weeks, weighted ? weightOf : () => 1);
    let week = band.startWeek;
    for (const c of chunks) {
      // Measured by real weight either way — what matters is what the student got.
      const work = c.reduce((s, p) => s + weightOf(p), 0);
      byWeek.set(week, (byWeek.get(week) ?? 0) + work);
      week = addWeeks(week, 1);
    }
  }
  return [...byWeek.values()];
}

function run(syllabus: string, weighted: boolean) {
  const ts = (bySyllabus.get(syllabus) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const pointCountByTopic = new Map(ts.map((t) => [t.id, (byTopic.get(t.id) ?? []).length]));
  const pointWeightByTopic = new Map(
    ts.map((t) => [t.id, (byTopic.get(t.id) ?? []).reduce((s, p) => s + weightOf(p), 0)]),
  );
  const bands = computePacing({
    topics: ts,
    pointCountByTopic,
    pointWeightByTopic: weighted ? pointWeightByTopic : undefined,
    programStart: PROGRAM_START,
    examDate: EXAM_DATE,
    now: new Date(`${PROGRAM_START}T09:00:00`),
  });
  const work = weeklyWork(bands, weighted);
  const lo = Math.min(...work);
  const hi = Math.max(...work);
  // A topic can never get less than one week, so a course with more topics than
  // it has weeks is levelled by `distributeWeeks`, not by anything here: every
  // band is one week long and there is nothing left to cut. Counting those says
  // whether a stubborn ratio is the weights failing or the calendar being full.
  const teach = bands.filter((b) => b.kind === "teach" && b.weeks > 0);
  const single = teach.filter((b) => b.weeks === 1).length;
  return {
    crowded: crowdedWeeks(bands),
    weeks: work.length,
    empty: work.filter((w) => w === 0).length,
    lo,
    hi,
    ratio: hi / lo,
    single,
    topics: teach.length,
  };
}

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
const num = (n: number, d = 1) => n.toFixed(d).padStart(6);

console.log(
  `${pad("course", 8)} ${pad("pts", 5)} ${pad("before", 8)} ${pad("after", 8)}  ` +
    `topics  shared-weeks`,
);
let improved = 0;
const names = [...bySyllabus.keys()].sort();
for (const syllabus of names) {
  const before = run(syllabus, false);
  const after = run(syllabus, true);
  const n = (bySyllabus.get(syllabus) ?? []).reduce(
    (s, t) => s + (byTopic.get(t.id) ?? []).length,
    0,
  );
  if (after.ratio < before.ratio) improved++;
  const note = before.empty || after.empty ? ` (empty ${before.empty}->${after.empty})` : "";
  console.log(
    `${pad(syllabus, 8)} ${pad(String(n), 5)} ${num(before.ratio)}x ${num(after.ratio)}x  ` +
      `${String(after.topics).padStart(6)}  ${String(after.crowded).padStart(12)}${note}`,
  );
}
console.log(`\n${improved}/${names.length} courses levelled out.`);
