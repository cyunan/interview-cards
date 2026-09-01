import { describe, expect, it } from "vitest";

import { parseCardsPayload } from "./payload";

const payload = {
  schema: "cards-v1",
  buildId: "build-fictional-001",
  builtAt: "2026-08-31T08:00:00.000Z",
  cards: [
    {
      id: "fictional-quantum-widget-001",
      question: "熵门是什么？",
      category: "99-虚构分类",
      topic: "QuantumWidget",
      decks: ["sprint", "full"],
      priority: "P0",
      quickAnswerMd: "熵门是虚构测试状态容器。",
      followUps: [],
      source: { path: "fictional.md", heading: "熵门是什么？" },
    },
  ],
};

describe("parseCardsPayload", () => {
  it("validates a versioned decrypted payload", () => {
    expect(parseCardsPayload(payload)).toEqual(payload);
  });

  it("rejects malformed decrypted data with one generic unlock error", () => {
    expect(() => parseCardsPayload({ ...payload, schema: "cards-v2" })).toThrow(
      "解锁失败",
    );
    expect(() =>
      parseCardsPayload({
        ...payload,
        cards: [{ ...payload.cards[0], source: { path: "/private/file.md" } }],
      }),
    ).toThrow("解锁失败");
  });
});
