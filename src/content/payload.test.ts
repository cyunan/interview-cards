import { describe, expect, it } from "vitest";

import { parseCardsPayload } from "./payload";

const card = {
  id: "fictional-quantum-widget-001",
  question: "熵门是什么？",
  category: "99-虚构分类",
  topic: "QuantumWidget",
  decks: ["full"],
  priority: "P1",
  quickAnswerMd: "熵门是虚构测试状态容器。",
  followUps: [],
  source: { path: "fictional.md", heading: "熵门是什么？" },
};

describe("parseCardsPayload", () => {
  it("accepts strict cards-v2 payloads", () => {
    expect(parseCardsPayload({
      schema: "cards-v2",
      buildId: "build-fictional-001",
      builtAt: "2026-08-31T08:00:00.000Z",
      cards: [{ ...card, legacyIds: [] }],
    })).toMatchObject({ schema: "cards-v2", cards: [{ legacyIds: [] }] });
  });

  it("accepts cards-v1 and normalizes its cards to v2 internally", () => {
    expect(parseCardsPayload({
      schema: "cards-v1",
      buildId: "build-fictional-001",
      builtAt: "2026-08-31T08:00:00.000Z",
      cards: [card],
    })).toMatchObject({ schema: "cards-v1", cards: [{ id: card.id, legacyIds: [] }] });
  });

  it.each([
    { schema: "cards-v2", cards: [{ ...card, legacyIds: ["old-id", "old-id"] }] },
    { schema: "cards-v2", cards: [{ ...card, legacyIds: [card.id] }] },
    { schema: "cards-v2", cards: [{ ...card, legacyIds: ["INVALID ID"] }] },
    { schema: "cards-v2", cards: [{ ...card, decks: ["sprint"], legacyIds: [] }] },
    { schema: "cards-v2", cards: [{ ...card, unknown: true, legacyIds: [] }] },
  ])("rejects malformed payloads with one generic unlock error", (invalid) => {
    expect(() => parseCardsPayload({ buildId: "build-fictional-001", builtAt: "2026-08-31T08:00:00.000Z", ...invalid })).toThrow("解锁失败");
  });

  it("rejects a canonical ID that follows another card's legacy ID", () => {
    const second = { ...card, id: "old-id", legacyIds: [] };
    expect(() => parseCardsPayload({
      schema: "cards-v2",
      buildId: "build-fictional-001",
      builtAt: "2026-08-31T08:00:00.000Z",
      cards: [{ ...card, legacyIds: ["old-id"] }, second],
    })).toThrow("解锁失败");
  });
});
