import { describe, expect, test } from "bun:test";

import {
  distributeWeeks,
  computePacing,
  bandForWeek,
  diffPacing,
  signatureOf,
  selectWeekPoints,
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
  test("gives every topic at least one week", () => {
    expect(distributeWeeks([10, 1, 1], 3)).toEqual([1, 1, 1]);
    // Fewer weeks than topics still cannot drop one.
    expect(distributeWeeks([5, 5, 5], 2)).toEqual([1, 1, 1]);
  });

  test("total always equals the weeks available", () => {
    for (const weeks of [4, 7, 12, 30, 52]) {
      const out = distributeWeeks([3, 17, 8, 22, 5], weeks);
      expect(out.reduce((a, b) => a + b, 0)).toBe(Math.max(weeks, 5));
    }
  });

  test("bigger topics get more weeks", () => {
    const [small, big] = distributeWeeks([2, 40], 10);
    expect(big).toBeGreaterThan(small);
  });

  test("largest-remainder does not strand the rounding error on the last topic", () => {
    // Three equal topics over 10 weeks: 4/3/3 in some order, never 3/3/4-with-a-gap.
    const out = distributeWeeks([1, 1, 1], 10);
    expect(out.reduce((a, b) => a + b, 0)).toBe(10);
    expect(Math.max(...out) - Math.min(...out)).toBeLessThanOrEqual(1);
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
