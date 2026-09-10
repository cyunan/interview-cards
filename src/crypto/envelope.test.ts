import { describe, expect, it } from "vitest";

import {
  decryptEnvelopeWithKey,
  decryptEnvelope,
  deriveEnvelopeKey,
  encryptEnvelope,
  UnlockError,
  validateEncryptedEnvelope,
  type EncryptedEnvelopeV1,
} from "./envelope";

const payload = {
  schema: "cards-v1",
  cards: [{ id: "fictional-widget-001", question: "虚构装置如何校准？" }],
};
const password = "正确的 Unicode 强口令🔐-2026";

describe("encrypted card envelope", () => {
  it("round-trips JSON with the required algorithms and parameters", async () => {
    const envelope = await encryptEnvelope(payload, password, "build-001");

    expect(envelope).toMatchObject({
      schema: "cards-envelope-v1",
      kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 600_000 },
      cipher: { name: "AES-GCM" },
      buildId: "build-001",
    });
    expect(envelope.kdf.salt).not.toContain("正确");
    expect(envelope.ciphertext).not.toContain("State");
    await expect(decryptEnvelope(envelope, password)).resolves.toEqual(payload);
  });

  it("uses a fresh salt and IV for every publication", async () => {
    const first = await encryptEnvelope(payload, password, "build-001");
    const second = await encryptEnvelope(payload, password, "build-001");

    expect(first.kdf.salt).not.toBe(second.kdf.salt);
    expect(first.cipher.iv).not.toBe(second.cipher.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("returns one generic error for a wrong password or tampered ciphertext", async () => {
    const envelope = await encryptEnvelope(payload, password, "build-001");
    const bytes = envelope.ciphertext.split("");
    bytes[bytes.length - 2] = bytes[bytes.length - 2] === "A" ? "B" : "A";
    const tampered: EncryptedEnvelopeV1 = {
      ...envelope,
      ciphertext: bytes.join(""),
    };

    await expect(
      decryptEnvelope(envelope, "错误但长度足够的密码-2026"),
    ).rejects.toEqual(new UnlockError());
    await expect(decryptEnvelope(tampered, password)).rejects.toEqual(
      new UnlockError(),
    );
  });

  it("derives a non-exportable key that can unlock the same envelope after reload", async () => {
    const envelope = await encryptEnvelope(payload, password, "build-001");
    const key = await deriveEnvelopeKey(envelope, password);

    expect(key.extractable).toBe(false);
    await expect(decryptEnvelopeWithKey(envelope, key)).resolves.toEqual(payload);
  });

  it("strictly rejects extra fields and malformed encoded parameters", async () => {
    const envelope = await encryptEnvelope(payload, password, "build-001");

    expect(() =>
      validateEncryptedEnvelope({ ...envelope, plaintext: "must never ship" }),
    ).toThrowError(new UnlockError());
    expect(() =>
      validateEncryptedEnvelope({
        ...envelope,
        kdf: { ...envelope.kdf, salt: "AA==" },
      }),
    ).toThrowError(new UnlockError());
    expect(() =>
      validateEncryptedEnvelope({
        ...envelope,
        cipher: { ...envelope.cipher, iv: "not-base64" },
      }),
    ).toThrowError(new UnlockError());
  });

  it("does not create an envelope that its own build-id contract rejects", async () => {
    await expect(
      encryptEnvelope(payload, password, "invalid build id"),
    ).rejects.toThrow("buildId 格式非法");
  });
});
