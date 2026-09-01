import { afterEach, describe, expect, it, vi } from "vitest";

import type { CardsPayloadV1 } from "../content/payload";
import { encryptEnvelope } from "../crypto/envelope";
import { loadEncryptedCards } from "./load-cards";

const password = "fictional-cache-password-2026";
const payload: CardsPayloadV1 = {
  schema: "cards-v1",
  buildId: "fictional-cache-build",
  builtAt: "2026-08-31T08:00:00.000Z",
  cards: [
    {
      id: "fictional-cache-card-001",
      question: "离线熵门是什么？",
      category: "99-虚构分类",
      topic: "QuantumWidget",
      decks: ["full"],
      priority: "P1",
      quickAnswerMd: "它是离线测试使用的虚构结构。",
      followUps: [],
      source: { path: "fictional-cache.md", heading: "离线熵门是什么？" },
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("loadEncryptedCards", () => {
  it("falls back to cached ciphertext when the network request fails", async () => {
    const envelope = await encryptEnvelope(payload, password, payload.buildId);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const cacheMatch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("caches", {
      match: cacheMatch,
    });

    await expect(loadEncryptedCards(password)).resolves.toEqual(payload);
    expect(cacheMatch).toHaveBeenCalledWith(
      "/cards.enc.json",
      { ignoreSearch: true },
    );
  });
});
