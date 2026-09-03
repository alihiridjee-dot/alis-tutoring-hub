import { describe, expect, test } from "bun:test";

import {
  distributeWeeks,
  computePacing,
  bandForWeek,
  bandsForWeek,
  crowdedWeeks,
  diffPacing,
  signatureOf,
  selectWeekPoints,
  focusDemand,
  focusLoadFor,
  weightOf,
  REVISION_WEEKS,
  type Band,
} from "@/lib/pacing";
import type { Database } from "@/integrations/supabase/types";

type Topic = Database["public"]["Tables"]["topics"]["Row"];

const topic = (id: string, sort: number): Topic =>
  ({
    id,
    title: `Topic ${sort + 1}`,
    subject: "chemistry",
    board: "ocr",
    level: "alevel",
    syllabus: "H432",
    sort_order: sort,
    created_at: "2026-01-01T00:00:00Z",
  }) as Topic;

describe("distributeWeeks", () => {
  /** Weeks each topic runs across, for readability in the expectations below. */
  const spans = (sizes: number[], weeks: number) =>
    distributeWeeks(sizes, weeks).map(([a, b]) => b - a + 1);
  /** How many weeks end up teaching more than one topic. */
  const shared = (sizes: number[], weeks: number) => {
    const per = new Map<number, number>();
    for (const [a, b] of distributeWeeks(sizes, weeks))
      for (let w = a; w <= b; w++) per.set(w, (per.get(w) ?? 0) + 1);
    return [...per.values()].filter((n) => n > 1).length;
  };

  test("every topic gets at least one week", () => {
    for (const [a, b] of distributeWeeks([10, 1, 1, 10], 4)) expect(b).toBeGreaterThanOrEqual(a);
    expect(distributeWeeks([10, 1, 1, 10], 4)).toHaveLength(4);
  });

  test("bigger topics get more weeks", () => {
    const [small, big] = spans([2, 40], 10);
    expect(big).toBeGreaterThan(small);
  });

  test("topics tile the year without spurious overlap", () => {
    // Three equal topics over ten weeks is 3/4/3 with nothing doubled up.
    // Rounding boundaries outwards instead made two of the ten shared.
    expect(spans([1, 1, 1], 10)).toEqual([3, 4, 3]);
    expect(shared([1, 1, 1], 10)).toBe(0);
  });

  test("the last topic ends on the last week, never past it", () => {
    for (const weeks of [4, 7, 12, 30, 52]) {
      const out = distributeWeeks([3, 17, 8, 22, 5], weeks);
      expect(out[out.length - 1][1]).toBe(weeks - 1);
      expect(Math.max(...out.map(([, b]) => b))).toBeLessThan(weeks);
    }
  });

  test("small neighbours share a week so a big topic can have its own", () => {
    // Two heavy topics either side of two tiny ones, four weeks to fit them.
    // Giving every topic a week each would spend half the year on the tiny two.
    const out = distributeWeeks([10, 1, 1, 10], 4);
    const [tinyA, tinyB] = [out[1], out[2]];
    expect(tinyA).toEqual(tinyB); // the same single week
    expect(spans([10, 1, 1, 10], 4)[0]).toBeGreaterThan(1);
  });

  test("more topics than weeks still fits inside the year", () => {
    // The old rule promised each topic a week of its own, so a 45-topic course
    // in 34 weeks was scheduled 11 weeks past its own exam.
    const out = distributeWeeks(new Array(45).fill(1), 34);
    expect(out).toHaveLength(45);
    expect(Math.max(...out.map(([, b]) => b))).toBe(33);
    expect(shared(new Array(45).fill(1), 34)).toBeGreaterThan(0);
  });

  test("a topic with no measured work still gets taught", () => {
    const out = distributeWeeks([0, 5, 0], 6);
    expect(out).toHaveLength(3);
    for (const [a, b] of out) expect(b).toBeGreaterThanOrEqual(a);
  });
});

describe("computePacing", () => {
  const topics = [topic("a", 0), topic("b", 1), topic("c", 2)];
  const counts = new Map([
    ["a", 10],
    ["b", 20],
    ["c", 10],
  ]);
  const base = {
    topics,
    pointCountByTopic: counts,
    programStart: "2026-09-07",
    examDate: "2027-06-07",
    now: new Date("2026-09-07T09:00:00"),
  };

  test("bands run in curriculum order and do not overlap", () => {
    const bands = computePacing(base).filter((b) => b.kind === "teach");
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].startWeek > bands[i - 1].endWeek).toBe(true);
    }
  });

  test("reserves revision weeks before the exam", () => {
    const bands = computePacing(base);
    const revision = bands.find((b) => b.kind === "revision");
    expect(revision).toBeDefined();
    expect(revision!.weeks).toBe(REVISION_WEEKS);
    const lastTeach = bands.filter((b) => b.kind === "teach").at(-1)!;
    expect(lastTeach.endWeek < revision!.startWeek).toBe(true);
  });

  test("never plans into the past when the student joins late", () => {
    const bands = computePacing({ ...base, now: new Date("2027-01-11T09:00:00") });
    const first = bands.find((b) => b.kind === "teach")!;
    expect(first.startWeek >= "2027-01-11").toBe(true);
  });

  test("a covered topic consumes no weeks, so the rest move earlier", () => {
    const withCovered = computePacing({ ...base, coveredTopicIds: new Set(["a"]) });
    const plain = computePacing(base);
    const cAfter = withCovered.find((b) => b.topicId === "c")!;
    const cBefore = plain.find((b) => b.topicId === "c")!;
    expect(cAfter.startWeek < cBefore.startWeek).toBe(true);
    expect(withCovered.find((b) => b.topicId === "a")!.weeks).toBe(0);
  });

  test("bandForWeek finds the owning band and ignores zero-week ones", () => {
    const bands = computePacing(base);
    const first = bands.find((b) => b.kind === "teach")!;
    expect(bandForWeek(bands, first.startWeek)?.topicId).toBe(first.topicId);
    expect(bandForWeek(bands, "2025-01-06")).toBeUndefined();
  });

  test("no topics gives no bands rather than a bare revision block", () => {
    expect(computePacing({ ...base, topics: [], pointCountByTopic: new Map() })).toEqual([]);
  });
});

describe("diffPacing", () => {
  const topics = [topic("a", 0), topic("b", 1)];
  const counts = new Map([
    ["a", 5],
    ["b", 5],
  ]);
  const mk = (now: string, covered?: string[]) =>
    computePacing({
      topics,
      pointCountByTopic: counts,
      programStart: "2026-09-07",
      examDate: "2027-06-07",
      coveredTopicIds: covered ? new Set(covered) : undefined,
      now: new Date(now),
    });

  test("an unchanged plan reports no shift", () => {
    const a = mk("2026-09-07T09:00:00");
    expect(diffPacing(a, a).changed).toBe(false);
  });

  test("falling behind reports the topics that moved", () => {
    const baseline = mk("2026-09-07T09:00:00");
    const live = mk("2026-11-16T09:00:00");
    const d = diffPacing(baseline, live);
    expect(d.changed).toBe(true);
    expect(d.moved.length).toBeGreaterThan(0);
    expect(d.moved[0]).toHaveProperty("from");
    expect(d.moved[0]).toHaveProperty("to");
  });

  test("no baseline means nothing to acknowledge on first view", () => {
    expect(diffPacing([], mk("2026-09-07T09:00:00")).changed).toBe(false);
  });

  test("signature ignores point counts, which the tutor edits freely", () => {
    const a = mk("2026-09-07T09:00:00");
    const b = a.map((x) => ({ ...x, pointCount: x.pointCount + 5 }));
    expect(signatureOf(a)).toBe(signatureOf(b));
  });
});

describe("selectWeekPoints", () => {
  const topics = [topic("a", 0), topic("b", 1)];
  const counts = new Map([
    ["a", 4],
    ["b", 4],
  ]);
  const pointsByTopic = new Map([
    ["a", [0, 1, 2, 3].map((i) => ({ id: `a${i}`, sort_order: i }))],
    ["b", [0, 1, 2, 3].map((i) => ({ id: `b${i}`, sort_order: i }))],
  ]);
  const bands = computePacing({
    topics,
    pointCountByTopic: counts,
    programStart: "2026-09-07",
    examDate: "2027-06-07",
    now: new Date("2026-09-07T09:00:00"),
  });
  const first = bands.find((b) => b.kind === "teach")!;

  const base = {
    bands,
    weekStart: first.startWeek,
    pointsByTopic,
    confidence: new Map<string, number>(),
    stability: new Map<string, number>(),
    settled: new Set<string>(),
  };

  test("teaches from the band that owns the week", () => {
    const out = selectWeekPoints(base);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((p) => p.spec_point_id.startsWith("a"))).toBe(true);
  });

  test("untaught points go in the CORE lane even though the sort gave them cards", () => {
    const confidence = new Map(["a0", "a1", "a2", "a3"].map((id) => [id, 10]));
    const stability = new Map(["a0", "a1", "a2", "a3"].map((id) => [id, 0.2]));
    const out = selectWeekPoints({ ...base, confidence, stability });
    expect(out.every((p) => p.lane === "core")).toBe(true);
  });

  test("a point the student says they have met is revision, not teaching", () => {
    const confidence = new Map([["a0", 90]]);
    const out = selectWeekPoints({ ...base, confidence });
    expect(out.find((p) => p.spec_point_id === "a0")?.lane).toBe("focus");
  });

  test("the focus budget never eats into the teaching share", () => {
    // A large backlog of evidenced, shaky points from a later topic.
    const confidence = new Map<string, number>();
    const stability = new Map<string, number>();
    for (const p of pointsByTopic.get("b")!) {
      confidence.set(p.id, 40);
      stability.set(p.id, 0.5);
    }
    const out = selectWeekPoints({ ...base, confidence, stability, focusBudget: 2 });
    const teach = out.filter((p) => p.spec_point_id.startsWith("a"));
    const revisit = out.filter((p) => p.spec_point_id.startsWith("b"));
    expect(teach.length).toBeGreaterThan(0);
    expect(revisit.length).toBe(2);
  });

  test("never-seen points stay out of the revisit lane", () => {
    // Topic b has no evidence at all, so it must not be surfaced as revision.
    const out = selectWeekPoints({ ...base, focusBudget: 6 });
    expect(out.some((p) => p.spec_point_id.startsWith("b"))).toBe(false);
  });

  test("settled points are not re-taught", () => {
    const settled = new Set(["a0", "a1"]);
    const out = selectWeekPoints({ ...base, settled });
    expect(out.some((p) => settled.has(p.spec_point_id))).toBe(false);
  });

  test("stragglers lead: an unfinished earlier point comes before the current topic", () => {
    const later = { ...base, weekStart: addWeeksLocal(first.startWeek, 1) };
    const out = selectWeekPoints(later);
    expect(out[0]?.spec_point_id).toBe("a0");
  });

  test("weakest by stability first, not by mastery", () => {
    // Isolate the revisit lane: topic b is not owed yet, so nothing here can be
    // picked by the teaching spine. Identical confidence across all four is the
    // real-world case — a student dragging one topic into a single band — which
    // is exactly when ranking on mastery degrades to spec order.
    const confidence = new Map(pointsByTopic.get("b")!.map((p) => [p.id, 83]));
    const stability = new Map([
      ["b0", 5],
      ["b1", 0.5],
      ["b2", 3],
      ["b3", 9],
    ]);
    const out = selectWeekPoints({
      ...base,
      confidence,
      stability,
      settled: new Set(pointsByTopic.get("a")!.map((p) => p.id)),
      focusBudget: 2,
    });
    const revisit = out.filter((p) => p.lane === "focus").map((p) => p.spec_point_id);
    expect(revisit).toEqual(["b1", "b2"]);
  });
});

function addWeeksLocal(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n * 7);
  const mm = `${dt.getMonth() + 1}`.padStart(2, "0");
  const dd = `${dt.getDate()}`.padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

describe("lane labelling with no ratings at all", () => {
  test("an unrated point is core, not revision", () => {
    // A student who has never rated anything has no evidence of being taught
    // anything. Defaulting their confidence to 50 read as "above the
    // never-taught line", so their very first week came back labelled as
    // revisiting material they had never met.
    const bands: Band[] = [
      {
        topicId: "t1",
        title: "Topic 1",
        startWeek: "2026-08-24",
        endWeek: "2026-08-31",
        weeks: 2,
        pointCount: 4,
        kind: "teach",
      },
    ];
    const picked = selectWeekPoints({
      bands,
      weekStart: "2026-08-24",
      pointsByTopic: new Map([
        [
          "t1",
          [
            { id: "p1", sort_order: 0 },
            { id: "p2", sort_order: 1 },
          ],
        ],
      ]),
      confidence: new Map(), // nothing rated
      stability: new Map(),
      settled: new Set(),
    });
    expect(picked.length).toBeGreaterThan(0);
    for (const p of picked) expect(p.lane).toBe("core");
  });

  test("a point rated 'not covered yet' is also core", () => {
    const bands: Band[] = [
      {
        topicId: "t1",
        title: "Topic 1",
        startWeek: "2026-08-24",
        endWeek: "2026-08-24",
        weeks: 1,
        pointCount: 1,
        kind: "teach",
      },
    ];
    const picked = selectWeekPoints({
      bands,
      weekStart: "2026-08-24",
      pointsByTopic: new Map([["t1", [{ id: "p1", sort_order: 0 }]]]),
      confidence: new Map([["p1", 10]]),
      stability: new Map(),
      settled: new Set(),
    });
    expect(picked[0]?.lane).toBe("core");
  });
});

describe("weight", () => {
  test("a missing or nonsense weight is an average point", () => {
    expect(weightOf({})).toBe(1);
    expect(weightOf({ weight: null })).toBe(1);
    expect(weightOf({ weight: 0 })).toBe(1);
    expect(weightOf({ weight: -2 })).toBe(1);
    expect(weightOf({ weight: 2.5 })).toBe(2.5);
  });

  test("a topic's band is sized by its work, not its row count", () => {
    // Same number of points either way; b's are three times the size. Counting
    // rows gives the two topics equal bands, which is the bug.
    const topics = [topic("a", 0), topic("b", 1)];
    const counts = new Map([
      ["a", 10],
      ["b", 10],
    ]);
    const base = {
      topics,
      pointCountByTopic: counts,
      programStart: "2026-09-07",
      examDate: "2027-06-07",
      now: new Date("2026-09-07T09:00:00"),
    };

    const byCount = computePacing(base);
    const byWork = computePacing({
      ...base,
      pointWeightByTopic: new Map([
        ["a", 10],
        ["b", 30],
      ]),
    });

    const weeks = (bands: Band[], id: string) => bands.find((x) => x.topicId === id)!.weeks;
    expect(weeks(byCount, "a")).toBe(weeks(byCount, "b"));
    expect(weeks(byWork, "b")).toBeGreaterThan(weeks(byWork, "a"));
    // The count is still what the roadmap displays.
    expect(byWork.find((x) => x.topicId === "b")!.pointCount).toBe(10);
  });

  test("an unweighted course paces exactly as it did before", () => {
    const topics = [topic("a", 0), topic("b", 1), topic("c", 2)];
    const counts = new Map([
      ["a", 7],
      ["b", 19],
      ["c", 4],
    ]);
    const base = {
      topics,
      pointCountByTopic: counts,
      programStart: "2026-09-07",
      examDate: "2027-06-07",
      now: new Date("2026-09-07T09:00:00"),
    };
    // Every point at the default weight 1 sums to the row count per topic.
    expect(computePacing({ ...base, pointWeightByTopic: counts })).toEqual(computePacing(base));
  });

  test("the week's spine is budgeted in work, so a heavy point crowds out others", () => {
    const topics = [topic("a", 0)];
    const bands = computePacing({
      topics,
      pointCountByTopic: new Map([["a", 4]]),
      pointWeightByTopic: new Map([["a", 4]]),
      programStart: "2026-09-07",
      // Two teaching weeks, so the topic's four points are cut 2/2 by count.
      examDate: "2026-10-12",
      now: new Date("2026-09-07T09:00:00"),
    });
    const first = bands.find((b) => b.kind === "teach")!;

    const light = [0, 1, 2, 3].map((i) => ({ id: `a${i}`, sort_order: i, weight: 1 }));
    // The same four points, but the first is worth the whole week on its own.
    const heavyFirst = light.map((p, i) => (i === 0 ? { ...p, weight: 4 } : p));

    const pick = (points: typeof light) =>
      selectWeekPoints({
        bands,
        weekStart: first.startWeek,
        pointsByTopic: new Map([["a", points]]),
        confidence: new Map(),
        stability: new Map(),
        settled: new Set(),
      }).length;

    expect(pick(heavyFirst)).toBeLessThan(pick(light));
    // Never empty: one point always goes in, however heavy it is.
    expect(pick(heavyFirst)).toBeGreaterThan(0);
  });
});

describe("focus load", () => {
  const candidate = (id: string, mastery: number, weight?: number) => ({
    specPointId: id,
    topicId: "t",
    topicTitle: "T",
    code: id,
    pointTitle: id,
    mastery,
    weight,
  });

  test("demand charges each revisit at its own point's size", () => {
    // One red point: three revisits. At weight 2 that is six units of work,
    // not three slots.
    expect(focusDemand([candidate("p", 20)])).toBe(3);
    expect(focusDemand([candidate("p", 20, 2)])).toBe(6);
    // Amber comes back once.
    expect(focusDemand([candidate("p", 50)])).toBe(1);
  });

  test("overloaded means revision outweighs the teaching it sits on", () => {
    const bands: Band[] = [
      {
        topicId: "a",
        title: "A",
        startWeek: "2026-08-24",
        endWeek: "2026-10-26",
        weeks: 10,
        pointCount: 100,
        kind: "teach",
      },
    ];
    // 100 units of teaching over 10 weeks is a spine of 10 a week.
    const ok = focusLoadFor({ budget: 5, topicWeights: [100], bands });
    expect(ok.spine).toBe(10);
    expect(ok.ratio).toBe(0.5);
    expect(ok.overloaded).toBe(false);

    expect(focusLoadFor({ budget: 12, topicWeights: [100], bands }).overloaded).toBe(true);
  });

  test("a week shared by two topics is one week, not two", () => {
    // Summing each band's length counted a shared week twice, which halved the
    // spine's apparent pace and called an empty backlog an overload.
    const shared: Band[] = [
      {
        topicId: "a",
        title: "A",
        startWeek: "2026-08-24",
        endWeek: "2026-08-31",
        weeks: 2,
        pointCount: 5,
        kind: "teach",
      },
      {
        topicId: "b",
        title: "B",
        startWeek: "2026-08-31",
        endWeek: "2026-08-31",
        weeks: 1,
        pointCount: 5,
        kind: "teach",
      },
    ];
    // Two distinct weeks (24th and 31st), not the three the lengths add up to.
    expect(focusLoadFor({ budget: 1, topicWeights: [20], bands: shared }).spine).toBe(10);
  });

  test("no teaching left to compare against is not an overload", () => {
    expect(focusLoadFor({ budget: 20, topicWeights: [], bands: [] })).toMatchObject({
      spine: 0,
      ratio: 0,
      overloaded: false,
    });
  });
});

describe("two small topics sharing a week", () => {
  // Four topics, three weeks: the two tiny middle ones have to double up.
  const topics = [topic("big1", 0), topic("tiny1", 1), topic("tiny2", 2), topic("big2", 3)];
  const bands = computePacing({
    topics,
    pointCountByTopic: new Map([
      ["big1", 10],
      ["tiny1", 1],
      ["tiny2", 1],
      ["big2", 10],
    ]),
    programStart: "2026-09-07",
    examDate: "2026-10-19", // three teaching weeks before the revision reserve
    now: new Date("2026-09-07T09:00:00"),
  });

  test("every topic is scheduled, and none past the revision window", () => {
    const teach = bands.filter((b) => b.kind === "teach");
    expect(teach).toHaveLength(4);
    const revision = bands.find((b) => b.kind === "revision")!;
    for (const b of teach) expect(b.endWeek < revision.startWeek).toBe(true);
  });

  test("the small ones share a week rather than taking one each", () => {
    const tiny1 = bands.find((b) => b.topicId === "tiny1")!;
    const tiny2 = bands.find((b) => b.topicId === "tiny2")!;
    expect(tiny1.startWeek).toBe(tiny2.startWeek);
    expect(bandsForWeek(bands, tiny1.startWeek).map((b) => b.topicId)).toContain("tiny2");
    expect(crowdedWeeks(bands)).toBeGreaterThan(0);
  });

  test("bandForWeek still answers with the week's leading topic", () => {
    const tiny1 = bands.find((b) => b.topicId === "tiny1")!;
    expect(bandForWeek(bands, tiny1.startWeek)?.topicId).toBe(
      bandsForWeek(bands, tiny1.startWeek)[0].topicId,
    );
  });

  test("the week's spine budget covers BOTH topics sharing it", () => {
    const week = bands.find((b) => b.topicId === "tiny1")!.startWeek;
    const pointsByTopic = new Map(
      topics.map((t) => [
        t.id,
        Array.from({ length: t.id.startsWith("tiny") ? 1 : 10 }, (_, i) => ({
          id: `${t.id}-${i}`,
          sort_order: i,
          weight: 1,
        })),
      ]),
    );
    // Everything from the earlier weeks is done, so only this week's work is owed.
    const settled = new Set(pointsByTopic.get("big1")!.map((p) => p.id));
    const picked = selectWeekPoints({
      bands,
      weekStart: week,
      pointsByTopic,
      confidence: new Map(),
      stability: new Map(),
      settled,
    });
    const ids = picked.map((p) => p.spec_point_id);
    // Budgeting from the first band alone would fit one point and leave the
    // topic sharing the week permanently owed.
    expect(ids).toContain("tiny1-0");
    expect(ids).toContain("tiny2-0");
  });

  test("a settled topic frees its week for the rest", () => {
    const withCovered = computePacing({
      topics,
      pointCountByTopic: new Map([
        ["big1", 10],
        ["tiny1", 1],
        ["tiny2", 1],
        ["big2", 10],
      ]),
      programStart: "2026-09-07",
      examDate: "2026-10-19",
      now: new Date("2026-09-07T09:00:00"),
      coveredTopicIds: new Set(["big1"]),
    });
    expect(withCovered.find((b) => b.topicId === "big1")!.weeks).toBe(0);
    // big2 now has room it did not have when big1 was still on the timetable.
    const before = bands.find((b) => b.topicId === "big2")!.weeks;
    expect(withCovered.find((b) => b.topicId === "big2")!.weeks).toBeGreaterThanOrEqual(before);
  });
});
