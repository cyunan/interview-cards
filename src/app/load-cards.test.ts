import { afterEach, describe, expect, it, vi } from "vitest";

import type { CardsPayloadV1 } from "../content/payload";
import { decryptEnvelopeWithKey, encryptEnvelope, deriveEnvelopeKey } from "../crypto/envelope";
import type { RememberedUnlockRecord, RememberedUnlockStore } from "../security/remembered-unlock";
import {
  loadEncryptedCards,
  loadEncryptedCardsSession,
  restoreRememberedCards,
} from "./load-cards";

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

class MemoryRememberedUnlockStore implements RememberedUnlockStore {
  constructor(public record?: RememberedUnlockRecord) {}
  clearCount = 0;

  async get(): Promise<RememberedUnlockRecord | undefined> {
    return this.record;
  }

  async put(record: RememberedUnlockRecord): Promise<void> {
    this.record = record;
  }

  async clear(): Promise<void> {
    this.clearCount += 1;
    this.record = undefined;
  }

  close(): void {}
}

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

    await expect(loadEncryptedCards(password)).resolves.toEqual({
      ...payload,
      cards: [{ ...payload.cards[0], legacyIds: [] }],
    });
    expect(cacheMatch).toHaveBeenCalledWith(
      "/cards.enc.json",
      { ignoreSearch: true },
    );
  });

  it("returns a non-exportable session key together with the decrypted payload", async () => {
    const envelope = await encryptEnvelope(payload, password, payload.buildId);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope), { status: 200 }),
    ));

    const session = await loadEncryptedCardsSession(password);

    expect(session.payload).toMatchObject({ buildId: payload.buildId });
    expect(session.key.extractable).toBe(false);
    await expect(decryptEnvelopeWithKey(envelope, session.key)).resolves.toEqual(
      expect.objectContaining({ buildId: payload.buildId }),
    );
    expect(await deriveEnvelopeKey(envelope, password)).toBeInstanceOf(CryptoKey);
  });

  it("restores the current envelope with a matching remembered key", async () => {
    const envelope = await encryptEnvelope(payload, password, payload.buildId);
    const key = await deriveEnvelopeKey(envelope, password);
    const store = new MemoryRememberedUnlockStore({
      buildId: envelope.buildId,
      salt: envelope.kdf.salt,
      key,
      savedAt: "2026-09-10T09:00:00.000Z",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope), { status: 200 }),
    ));

    await expect(restoreRememberedCards(store)).resolves.toMatchObject({
      buildId: payload.buildId,
    });
    expect(store.clearCount).toBe(0);
  });

  it("clears a remembered key when the publication salt changes", async () => {
    const envelope = await encryptEnvelope(payload, password, payload.buildId);
    const key = await deriveEnvelopeKey(envelope, password);
    const store = new MemoryRememberedUnlockStore({
      buildId: envelope.buildId,
      salt: "stale-salt",
      key,
      savedAt: "2026-09-10T09:00:00.000Z",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope), { status: 200 }),
    ));

    await expect(restoreRememberedCards(store)).resolves.toBeUndefined();
    expect(store.clearCount).toBe(1);
  });
});
