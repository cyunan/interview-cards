import { describe, expect, it } from "vitest";

import type { CardV2 } from "../content/types";
import type { CardProgress } from "../study/scheduler";
import {
  KNOWLEDGE_ROUTES,
  getRouteProgress,
  resolveRouteCards,
  type KnowledgeRoute,
} from "./routes";

const cards: CardV2[] = [
  {
    id: "android-activity-002",
    legacyIds: [],
    question: "Activity、Window、View 三者分别负责什么？",
    category: "02-Android",
    topic: "Activity",
    decks: ["full"],
    priority: "P0",
    quickAnswerMd: "Activity、Window、View 是三层边界。",
    followUps: [],
    source: { path: "activity.md", heading: "Activity、Window、View 三者分别负责什么？" },
  },
  {
    id: "android-android-003",
    legacyIds: [],
    question: "Choreographer 如何把 VSYNC 变成一帧回调？",
    category: "02-Android",
    topic: "Android并发编程",
    decks: ["full"],
    priority: "P0",
    quickAnswerMd: "VSYNC 进入消息队列后驱动一帧。",
    followUps: [],
    source: { path: "concurrency.md", heading: "Choreographer 如何把 VSYNC 变成一帧回调？" },
  },
  {
    id: "android-activity-003",
    legacyIds: [],
    question: "Activity 主要生命周期回调各负责什么？",
    category: "02-Android",
    topic: "Activity",
    decks: ["full"],
    priority: "P0",
    quickAnswerMd: "生命周期回调表达可见性和交互边界。",
    followUps: [],
    source: { path: "activity.md", heading: "Activity 主要生命周期回调各负责什么？" },
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
