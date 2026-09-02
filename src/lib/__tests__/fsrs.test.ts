import { describe, expect, test } from "bun:test";

import {
  MIN_INTERVAL_DAYS,
  STRONG_STABILITY_DAYS,
  confidenceToRating,
  gradeCard,
  pointMastery,
  pointStatus,
  scoreToRating,
  Rating,
  State,
  type Card,
} from "@/lib/fsrs";

const NOW = new Date("2026-08-24T10:00:00Z");
const DAY = 86_400_000;
const days = (a: Date, b: Date) => (a.getTime() - b.getTime()) / DAY;

/** The four confidences the board writes, by band. */
const CONF = { new: 10, shaky: 35, ok: 65, strong: 90 } as const;

describe("weekly cadence", () => {
  test("nothing is ever due sooner than a week out", () => {
    for (const conf of Object.values(CONF)) {
      const card = gradeCard(null, confidenceToRating(conf), NOW);
      expect(days(card.due, NOW)).toBeGreaterThanOrEqual(MIN_INTERVAL_DAYS);
    }
  });

  test("short-term steps are off — no card comes back the same day", () => {
    // With FSRS's stock learning steps this was 1 and 10 MINUTES: a student who
    // rated a topic "Getting there" got it back before they had closed the tab.
    const card = gradeCard(null, Rating.Good, NOW);
    expect(days(card.due, NOW)).toBeGreaterThan(1);
    expect(card.state).not.toBe(State.Learning);
  });

  test("the floor only ever pushes a due date later", () => {
    // A mature card with a long interval keeps it.
    let card = gradeCard(null, Rating.Easy, NOW);
    for (let i = 1; i <= 4; i++)
      card = gradeCard(card, Rating.Easy, new Date(NOW.getTime() + i * 60 * DAY));
    expect(days(card.due, new Date(NOW.getTime() + 4 * 60 * DAY))).toBeGreaterThan(
      MIN_INTERVAL_DAYS,
    );
  });
});

describe("pointStatus reads stability, not the due date", () => {
  test("a just-flagged weak point is not strong", () => {
    // The bug this guards: the floor above makes "not due yet" true of a point
    // dragged into Needs work and one aced four times alike.
    const card = gradeCard(null, confidenceToRating(CONF.shaky), NOW);
    expect(card.due.getTime()).toBeGreaterThan(NOW.getTime()); // not due...
    expect(pointStatus(card, NOW)).toBe("learning"); // ...but not strong either
  });

  test("strong requires stability past the bar", () => {
    const weak = { stability: STRONG_STABILITY_DAYS - 1 } as Card;
    const held = { stability: STRONG_STABILITY_DAYS + 1 } as Card;
    const later = new Date(NOW.getTime() + 90 * DAY);
    const at = (c: Partial<Card>) =>
      pointStatus({ ...c, state: State.Review, due: later } as Card, NOW);
    expect(at(weak)).toBe("learning");
    expect(at(held)).toBe("strong");
  });

  test("overdue trumps the state", () => {
    const card = { state: State.Review, stability: 90, due: new Date(NOW.getTime() - DAY) } as Card;
    expect(pointStatus(card, NOW)).toBe("due");
  });
});

describe("mastery is anchored on what the student said", () => {
  test("a topic dragged to Confident clears the settled line", () => {
    // The regression: stability-only mastery scored a fresh Easy card 49, under
    // the 67 settled threshold, so a student could rate the whole course
    // Confident and the planner would insist nothing was settled, forever.
    const card = gradeCard(null, confidenceToRating(CONF.strong), NOW);
    expect(pointMastery(card, CONF.strong, NOW)).toBeGreaterThanOrEqual(67);
  });

  test("a topic dragged to Needs work stays well below it", () => {
    const card = gradeCard(null, confidenceToRating(CONF.shaky), NOW);
    expect(pointMastery(card, CONF.shaky, NOW)).toBeLessThan(67);
  });

  test("mastery is ordered by the rating, not by the grade's stability", () => {
    const scores = (Object.values(CONF) as number[]).map((c) =>
      pointMastery(gradeCard(null, confidenceToRating(c), NOW), c, NOW),
    );
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  test("an unrated, never-practised point scores zero, not neutral", () => {
    expect(pointMastery(null, null, NOW)).toBe(0);
  });

  test("a point only ever touched by homework starts from neutral", () => {
    // Scoring silence as ignorance would bury a point the marks already moved.
    const card = gradeCard(null, scoreToRating(95), NOW);
    expect(pointMastery(card, null, NOW)).toBeGreaterThan(0);
  });

  test("a due point drifts down the longer it is ignored", () => {
    const card = { state: State.Review, stability: 20, due: NOW } as Card;
    const fresh = pointMastery(card, 80, NOW);
    const stale = pointMastery(card, 80, new Date(NOW.getTime() + 42 * DAY));
    expect(stale).toBeLessThan(fresh);
  });

  test("lapses are capped and shed once a point reads strong", () => {
    const later = new Date(NOW.getTime() + 400 * DAY);
    const lapsed = { state: State.Review, stability: 5, due: later, lapses: 99 } as Card;
    const recovered = { state: State.Review, stability: 60, due: later, lapses: 99 } as Card;
    expect(pointMastery(lapsed, 80, NOW)).toBeGreaterThanOrEqual(80 - 3 - 15);
    expect(pointMastery(recovered, 80, NOW)).toBeGreaterThanOrEqual(70);
  });
});

describe("honesty is not punished", () => {
  test("a confidence rating never records a lapse", () => {
    // Dragging a topic into Needs work is useful information. Charging a lapse
    // for it feeds a penalty the student can only shed by re-learning.
    let card = gradeCard(null, Rating.Easy, NOW);
    const before = card.lapses;
    card = gradeCard(card, Rating.Again, new Date(NOW.getTime() + 30 * DAY), {
      countsAsLapse: false,
    });
    expect(card.lapses).toBe(before);
    // ...but it still shortens the interval, which is the point.
    expect(card.stability).toBeLessThan(gradeCard(null, Rating.Easy, NOW).stability);
  });

  test("a failed homework does record one", () => {
    let card = gradeCard(null, Rating.Easy, NOW);
    card = gradeCard(card, scoreToRating(20), new Date(NOW.getTime() + 30 * DAY));
    expect(card.lapses).toBe(1);
  });
});
