import { describe, expect, it } from "vitest";

import type { CardV1 } from "../content/types";
import {
  applyRating,
  buildDailyQueue,
  remainingDailyQuota,
  scheduleSessionRepeat,
  toLocalDateKey,
  type CardProgress,
} from "./scheduler";

function card(index: number, decks: CardV1["decks"] = ["full"]): CardV1 {
  return {
    id: `fictional-card-${String(index).padStart(3, "0")}`,
    question: `虚构问题 ${index}？`,
    category: index % 2 === 0 ? "甲类" : "乙类",
    topic: "QuantumWidget",
    decks,
    priority: index % 3 === 0 ? "P0" : "P1",
    quickAnswerMd: `虚构回答 ${index}。`,
    followUps: [],
    source: { path: `fictional-${index}.md`, heading: `虚构问题 ${index}？` },
  };
}

function progress(
  cardId: string,
  level: CardProgress["level"],
  dueOn: string,
): CardProgress {
  return {
    cardId,
    level,
    reviewCount: 3,
    lastReviewedAt: "2026-08-20T08:00:00.000Z",
    dueOn,
  };
}

describe("applyRating", () => {
  const now = new Date(2026, 7, 31, 23, 55);

  it("resets a failed card to level zero and makes it due the next local day", () => {
    expect(applyRating("fictional-card-001", progress("fictional-card-001", 4, "2026-09-14"), "again", now))
      .toMatchObject({
        cardId: "fictional-card-001",
        level: 0,
        reviewCount: 4,
        dueOn: "2026-09-01",
      });
  });

  it("drops fuzzy cards one level with a floor of one", () => {
    expect(applyRating("fictional-card-001", progress("fictional-card-001", 4, "2026-09-14"), "fuzzy", now))
      .toMatchObject({ level: 3, dueOn: "2026-09-07" });
    expect(applyRating("fictional-card-001", progress("fictional-card-001", 1, "2026-09-01"), "fuzzy", now))
      .toMatchObject({ level: 1, dueOn: "2026-09-01" });
  });

  it("raises mastered cards through the 1, 3, 7, 14, 30 day intervals", () => {
    expect(applyRating("fictional-card-001", undefined, "mastered", now)).toMatchObject({
      level: 1,
      dueOn: "2026-09-01",
      reviewCount: 1,
    });
    expect(applyRating("fictional-card-001", progress("fictional-card-001", 1, "2026-09-01"), "mastered", now))
      .toMatchObject({ level: 2, dueOn: "2026-09-03" });
    expect(applyRating("fictional-card-001", progress("fictional-card-001", 5, "2026-09-30"), "mastered", now))
      .toMatchObject({ level: 5, dueOn: "2026-09-30" });
  });
});

describe("buildDailyQueue", () => {
  it("builds a stable 60 percent review and 40 percent new queue", () => {
    const cards = Array.from({ length: 30 }, (_, index) => card(index + 1));
    const records = new Map<string, CardProgress>();
    for (let index = 1; index <= 15; index += 1) {
      records.set(
        card(index).id,
        progress(card(index).id, index % 2 === 0 ? 1 : 3, "2026-08-31"),
      );
    }

    const first = buildDailyQueue({
      cards,
      progress: records,
      deck: "full",
      limit: 20,
      today: "2026-08-31",
    });
    const second = buildDailyQueue({
      cards: [...cards].reverse(),
      progress: records,
      deck: "full",
      limit: 20,
      today: "2026-08-31",
    });

    expect(first.map((item) => item.card.id)).toEqual(second.map((item) => item.card.id));
    expect(first).toHaveLength(20);
    expect(first.filter((item) => item.kind === "review")).toHaveLength(12);
    expect(first.filter((item) => item.kind === "new")).toHaveLength(8);
  });

  it("filters by deck and fills unused quota from the available pool", () => {
    const cards = [
      ...Array.from({ length: 3 }, (_, index) => card(index + 1, ["sprint", "full"])),
      ...Array.from({ length: 12 }, (_, index) => card(index + 10, ["full"])),
    ];
    const records = new Map<string, CardProgress>([
      [cards[0].id, progress(cards[0].id, 2, "2026-08-31")],
    ]);

    const queue = buildDailyQueue({
      cards,
      progress: records,
      deck: "sprint",
      limit: 10,
      today: "2026-08-31",
    });

    expect(queue).toHaveLength(3);
    expect(queue.every((item) => item.card.decks.includes("sprint"))).toBe(true);
    expect(new Set(queue.map((item) => item.card.id)).size).toBe(3);
  });

  it("treats weak cards as review candidates before their due date", () => {
    const cards = [card(1), card(2), card(3)];
    const records = new Map<string, CardProgress>([
      [cards[0].id, progress(cards[0].id, 1, "2026-09-03")],
      [cards[1].id, progress(cards[1].id, 4, "2026-09-03")],
    ]);

    const queue = buildDailyQueue({
      cards,
      progress: records,
      deck: "full",
      limit: 2,
      today: "2026-08-31",
    });

    expect(queue.some((item) => item.card.id === cards[0].id && item.kind === "review")).toBe(
      true,
    );
    expect(queue.some((item) => item.card.id === cards[1].id)).toBe(false);
  });

  it("does not enqueue a weak card again after it was reviewed today", () => {
    const cards = [card(1), card(2)];
    const reviewedToday = {
      ...progress(cards[0].id, 1, "2026-09-01"),
      lastReviewedAt: "2026-08-31T01:00:00.000Z",
      reviewedOn: ["2026-08-31"],
    } satisfies CardProgress;

    const queue = buildDailyQueue({
      cards,
      progress: new Map([[cards[0].id, reviewedToday]]),
      deck: "full",
      limit: 2,
      today: "2026-08-31",
    });

    expect(queue.map((item) => item.card.id)).toEqual([cards[1].id]);
  });
});

describe("remainingDailyQuota", () => {
  it("counts unique known cards reviewed on the local day and ignores orphans", () => {
    const records = new Map<string, CardProgress>([
      ["known-1", { ...progress("known-1", 1, "2026-09-01"), reviewedOn: ["2026-08-31"] }],
      ["known-2", { ...progress("known-2", 2, "2026-09-03"), reviewedOn: ["2026-08-30", "2026-08-31"] }],
      ["orphan", { ...progress("orphan", 1, "2026-09-01"), reviewedOn: ["2026-08-31"] }],
    ]);

    expect(
      remainingDailyQuota(records, new Set(["known-1", "known-2", "known-3"]), "2026-08-31", 10),
    ).toBe(8);
    expect(
      remainingDailyQuota(records, new Set(["known-1", "known-2"]), "2026-08-31", 2),
    ).toBe(0);
  });
});

describe("scheduleSessionRepeat", () => {
  it("places a failed card after ten different cards", () => {
    const ids = Array.from({ length: 15 }, (_, index) => `card-${index}`);
    const next = scheduleSessionRepeat(ids, "card-0", 0);

    expect(next[11]).toBe("card-0");
    expect(next.slice(1, 11)).not.toContain("card-0");
  });

  it("appends the failed card when fewer than ten cards remain", () => {
    expect(scheduleSessionRepeat(["a", "b", "c"], "a", 0)).toEqual([
      "a",
      "b",
      "c",
      "a",
    ]);
  });
});

describe("toLocalDateKey", () => {
  it("uses the local calendar boundary", () => {
    expect(toLocalDateKey(new Date(2026, 7, 31, 23, 59))).toBe("2026-08-31");
    expect(toLocalDateKey(new Date(2026, 8, 1, 0, 1))).toBe("2026-09-01");
  });
});
