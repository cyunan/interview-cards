import { describe, expect, it } from "vitest";

import type { CardV2 } from "../content/types";
import type { CardProgress } from "../study/scheduler";
import {
  KNOWLEDGE_ROUTES,
  getRouteProgress,
  resolveRouteCards,
  resolveRouteCheckpoint,
  type KnowledgeRoute,
} from "./routes";

const cards: CardV2[] = [
  {
    id: "android-activity-002",
    legacyIds: [],
    question: "测试卡片 A 用来模拟路线入口",
    category: "测试分类",
    topic: "测试主题",
    decks: ["full"],
    priority: "P0",
    quickAnswerMd: "测试答案 A。",
    followUps: [],
    source: { path: "fixture-a.md", heading: "测试卡片 A" },
  },
  {
    id: "android-android-003",
    legacyIds: [],
    question: "测试卡片 B 用来模拟中间节点",
    category: "测试分类",
    topic: "测试主题",
    decks: ["full"],
    priority: "P0",
    quickAnswerMd: "测试答案 B。",
    followUps: [],
    source: { path: "fixture-b.md", heading: "测试卡片 B" },
  },
  {
    id: "android-activity-003",
    legacyIds: [],
    question: "测试卡片 C 用来模拟路线终点",
    category: "测试分类",
    topic: "测试主题",
    decks: ["full"],
    priority: "P0",
    quickAnswerMd: "测试答案 C。",
    followUps: [],
    source: { path: "fixture-c.md", heading: "测试卡片 C" },
  },
];

const progress: CardProgress = {
  cardId: "android-activity-002",
  level: 2,
  reviewCount: 1,
  lastReviewedAt: "2026-09-11T08:00:00.000Z",
  dueOn: "2026-09-14",
  reviewedOn: ["2026-09-11"],
};

describe("knowledge routes", () => {
  it("gives every route a scenario, learning outcomes and an in-stage encrypted recap reference", () => {
    expect(KNOWLEDGE_ROUTES).toHaveLength(6);
    for (const route of KNOWLEDGE_ROUTES) {
      expect(route.scenario, route.id).toBeTruthy();
      expect(route.outcomes?.length, route.id).toBeGreaterThanOrEqual(2);
      const ids = route.steps.flatMap((step) => step.cardIds);
      expect(new Set(ids).size, route.id).toBe(ids.length);
      for (const step of route.steps) {
        expect(step.checkpoint, `${route.id}/${step.id}`).toBeDefined();
        expect(step.cardIds).toContain(step.checkpoint?.cardId);
        expect(Number.isInteger(step.checkpoint?.followUpIndex)).toBe(true);
        expect(step.checkpoint!.followUpIndex).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("organizes the page route into seven stages and twenty unique cards", () => {
    const route = KNOWLEDGE_ROUTES[0];
    expect(route.steps).toHaveLength(7);
    expect(route.steps.flatMap((step) => step.cardIds)).toHaveLength(20);
    expect(route.steps.flatMap((step) => step.cardIds).filter((id) => id.startsWith("android-page-"))).toHaveLength(12);
    expect(new Set(route.steps.flatMap((step) => step.cardIds)).size).toBe(20);
    expect(route.scenario).toBeTruthy();
    expect(route.steps.every((step) => step.checkpoint?.followUpIndex !== undefined)).toBe(true);
  });

  it("reads recap answers only from the unlocked follow-up and never falls back for a missing index", () => {
    const step = { ...KNOWLEDGE_ROUTES[0].steps[0], checkpoint: { cardId: cards[0].id, followUpIndex: 0 } };
    const unlocked = [{ ...cards[0], followUps: [{ question: "复述问题", answerMd: "密文内的完整答案" }] }];
    expect(resolveRouteCheckpoint(step, unlocked)).toEqual({ question: "复述问题", answerMd: "密文内的完整答案" });
    expect(resolveRouteCheckpoint(step, cards)).toBeUndefined();
    expect(resolveRouteCheckpoint({ ...step, checkpoint: { cardId: cards[0].id } }, cards)?.answerMd).toBe(cards[0].quickAnswerMd);
  });

  it("does not count a partially available stage as reviewed", () => {
    const route = { ...KNOWLEDGE_ROUTES[0], steps: [{ ...KNOWLEDGE_ROUTES[0].steps[0], cardIds: [cards[0].id, "missing"] }] };
    expect(getRouteProgress(route, cards, new Map([[progress.cardId, progress]]))).toMatchObject({ completedSteps: 0, totalCards: 2, reviewedCards: 1 });
  });
  it("keeps the page-rendering route as a chain of existing card ids", () => {
    const route = KNOWLEDGE_ROUTES.find((item) => item.id === "android-page-rendering");
    expect(route).toBeDefined();
    expect(route?.steps.length).toBeGreaterThanOrEqual(4);
    expect(route?.steps.every((step) => step.cardIds.length > 0)).toBe(true);
  });

  it("resolves only cards present in the unlocked payload without changing route order", () => {
    const route: KnowledgeRoute = {
      id: "test-route",
      title: "测试路线",
      summary: "测试",
      level: "基础到进阶",
      estimatedMinutes: 10,
      steps: [
        {
          id: "first",
          title: "第一步",
          purpose: "建立边界",
          cardIds: ["android-android-003", "missing-card", "android-activity-002"],
          transition: "再进入下一步。",
        },
      ],
    };
    expect(resolveRouteCards(route.steps[0], cards).map((card) => card.id)).toEqual([
      "android-android-003",
      "android-activity-002",
    ]);
  });

  it("marks a step complete only after every available card has been reviewed", () => {
    const route = KNOWLEDGE_ROUTES.find((item) => item.id === "android-page-rendering");
    expect(route).toBeDefined();
    const step = route!.steps[0];
    const firstCard = cards.find((card) => card.id === step.cardIds[0]);
    expect(firstCard).toBeDefined();
    const result = getRouteProgress(route!, cards, new Map([[progress.cardId, progress]]));
    expect(result.completedSteps).toBe(0);
    expect(result.nextStepIndex).toBe(0);
  });
});
