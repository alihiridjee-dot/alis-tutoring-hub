import { describe, expect, test } from "bun:test";

import {
  FOCUS_BUDGET,
  FOCUS_RED_BELOW,
  focusDemand,
  scheduleFocusWeeks,
  splitAcrossWeeks,
  weekSliceOf,
  weeksOf,
  type Band,
  type FocusCandidate,
} from "@/lib/pacing";

const MONDAY = "2026-08-24";
const EXAM = "2027-06-07"; // ~41 weeks out

function candidates(n: number, mastery: number, topic = "t1"): FocusCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    specPointId: `${topic}-p${i}`,
    topicId: topic,
    topicTitle: `Topic ${topic}`,
    code: `${i}`,
    pointTitle: `Point ${i}`,
    mastery,
  }));
}

const run = (c: FocusCandidate[], covered: { topicId: string; title: string }[] = []) =>
  scheduleFocusWeeks({
    candidates: c,
    coveredTopics: covered,
    currentMonday: MONDAY,
    examDate: EXAM,
  });

describe("the lane is spread, not dumped", () => {
  test("a whole backlog does not land in one week", () => {
    const bands = run(candidates(30, 20));
    const weeks = new Set(bands.map((b) => b.week));
    expect(weeks.size).toBeGreaterThan(3);
  });

  test("no week exceeds its budget", () => {
    const c = candidates(30, 20);
    const budget = Math.max(FOCUS_BUDGET, Math.ceil(focusDemand(c) / 38));
    const perWeek = new Map<string, number>();
    for (const b of run(c)) {
      if (b.kind !== "revisit") continue;
      perWeek.set(b.week, (perWeek.get(b.week) ?? 0) + b.points.length);
    }
    for (const n of perWeek.values()) expect(n).toBeLessThanOrEqual(budget);
  });

  test("work starts in week zero, not next Monday", () => {
    // A topic flagged as weak today must be actionable today. Starting at week 1
    // made it always somebody else's problem.
    expect(run(candidates(4, 15)).some((b) => b.week === MONDAY)).toBe(true);
  });
});

describe("the two tiers are served side by side", () => {
  test("a large red backlog does not starve amber out of the year", () => {
    // The bug this guards: a strict weakest-first queue defers amber entirely
    // until every red point is finished — two-thirds of the year with nothing.
    const bands = run([...candidates(60, 15, "red"), ...candidates(10, 50, "amber")]);
    const amberWeeks = bands.filter((b) => b.topicId === "amber").map((b) => b.week);
    expect(amberWeeks.length).toBeGreaterThan(0);
    // and it appears early, not only in the final run-up
    expect(amberWeeks.some((w) => w < "2026-12-01")).toBe(true);
  });

  test("weaker points still come back more often", () => {
    const bands = run([...candidates(3, 15, "red"), ...candidates(3, 50, "amber")]);
    const looks = (t: string) =>
      bands.filter((b) => b.topicId === t).reduce((s, b) => s + b.points.length, 0);
    expect(looks("red")).toBeGreaterThan(looks("amber"));
  });

  test("red asks for three looks per point, amber one", () => {
    expect(focusDemand(candidates(1, FOCUS_RED_BELOW - 1))).toBe(3);
    expect(focusDemand(candidates(1, FOCUS_RED_BELOW))).toBe(1);
  });
});

describe("the whole backlog fits the runway", () => {
  test("every point asked for is scheduled at least once", () => {
    const c = candidates(80, 20);
    const seen = new Set(run(c).flatMap((b) => b.points.map((p) => p.specPointId)));
    for (const x of c) expect(seen.has(x.specPointId)).toBe(true);
  });

  test("a point's looks are spaced, never twice in one week", () => {
    for (const b of run(candidates(5, 15))) {
      const ids = b.points.map((p) => p.specPointId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("covered topics", () => {
  test("get one budget-exempt review in the run-up", () => {
    const bands = run([], [{ topicId: "c1", title: "Topic 1" }]);
    const review = bands.filter((b) => b.kind === "review");
    expect(review).toHaveLength(1);
    expect(review[0].week).toBe("2027-05-17"); // 3 weeks before the exam Monday
  });
});

describe("dividing a topic across its weeks", () => {
  const sizes = <T>(chunks: T[][]) => chunks.map((c) => c.length);
  const ones = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, weight: 1 }));

  test("no trailing week is a stub or empty", () => {
    // 13 points over 5 weeks used to go 3/3/3/3/1.
    expect(sizes(splitAcrossWeeks(ones(13), 5, (p) => p.weight))).toEqual([3, 3, 3, 2, 2]);
    // Fewer points than weeks: one each, and the rest of the weeks are empty.
    expect(sizes(splitAcrossWeeks(ones(3), 5, (p) => p.weight))).toEqual([1, 1, 1, 0, 0]);
  });

  test("cuts by work, not by count", () => {
    // One practical worth three ordinary points, then six ordinary ones. By
    // count this is 3/2/2; by work it has to be 1/3/3 so no week is double
    // another. Weeks stay contiguous runs in spec order either way.
    const points = [
      { id: 0, weight: 3 },
      ...Array.from({ length: 6 }, (_, i) => ({ id: i + 1, weight: 1 })),
    ];
    const chunks = splitAcrossWeeks(points, 3, (p) => p.weight);
    const work = chunks.map((c) => c.reduce((s, p) => s + p.weight, 0));
    expect(work).toEqual([3, 3, 3]);
    expect(sizes(chunks)).toEqual([1, 3, 3]);
  });

  test("an unweighted course splits exactly as it did when counting", () => {
    // Every weight 1 — the default — has to reproduce the old equal-count cut,
    // or shipping the weights would silently re-plan every course that has none.
    expect(sizes(splitAcrossWeeks(ones(10), 4))).toEqual([3, 3, 2, 2]);
    expect(sizes(splitAcrossWeeks(ones(13), 5))).toEqual([3, 3, 3, 2, 2]);
  });

  test("weekSliceOf partitions the topic exactly once", () => {
    const band: Band = {
      topicId: "t",
      title: "T",
      startWeek: MONDAY,
      endWeek: "2026-09-14",
      weeks: 4,
      pointCount: 10,
      kind: "teach",
    };
    const points = Array.from({ length: 10 }, (_, i) => i);
    const weeks = ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14"];
    const all = weeks.flatMap((w) => weekSliceOf(band, w, points));
    expect(all).toEqual(points);
  });
});

describe("weeksOf", () => {
  test("covers every Monday from the first band to the last", () => {
    const bands: Band[] = [
      {
        topicId: "a",
        title: "A",
        startWeek: MONDAY,
        endWeek: "2026-08-31",
        weeks: 2,
        pointCount: 1,
        kind: "teach",
      },
      {
        topicId: "b",
        title: "B",
        startWeek: "2026-09-07",
        endWeek: "2026-09-14",
        weeks: 2,
        pointCount: 1,
        kind: "teach",
      },
    ];
    expect(weeksOf(bands)).toEqual(["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14"]);
  });
});
