import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import { encryptEnvelope, deriveEnvelopeKey } from "../crypto/envelope";
import { createRememberedUnlockStore } from "./remembered-unlock";

describe("remembered unlock store", () => {
  it("persists one device key record without storing the password", async () => {
    const envelope = await encryptEnvelope({ schema: "cards-v1" }, "test-password", "build-001");
    const key = await deriveEnvelopeKey(envelope, "test-password");
    const store = await createRememberedUnlockStore(`remembered-unlock-${crypto.randomUUID()}`);

    await store.put({
      buildId: envelope.buildId,
      salt: envelope.kdf.salt,
      key,
      savedAt: "2026-09-10T09:00:00.000Z",
    });

    await expect(store.get()).resolves.toMatchObject({
      buildId: "build-001",
      salt: envelope.kdf.salt,
      savedAt: "2026-09-10T09:00:00.000Z",
    });
    expect(JSON.stringify(await store.get())).not.toContain("test-password");

    await store.clear();
    await expect(store.get()).resolves.toBeUndefined();
    store.close();
  });
});
