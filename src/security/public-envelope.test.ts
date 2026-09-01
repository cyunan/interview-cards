import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { encryptEnvelope } from "../crypto/envelope";
import { validateEnvelopeFile } from "./public-envelope";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("validateEnvelopeFile", () => {
  it("requires the encrypted card bank before publication", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "interview-envelope-"));
    roots.push(root);

    await expect(
      validateEnvelopeFile(path.join(root, "cards.enc.json")),
    ).rejects.toThrow("缺少加密题库");
  });

  it("accepts only an exact versioned envelope", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "interview-envelope-"));
    roots.push(root);
    const pathname = path.join(root, "cards.enc.json");
    const envelope = await encryptEnvelope(
      { schema: "fictional-payload" },
      "fictional-password-2026",
      "fictional-build",
    );
    await writeFile(pathname, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    await expect(validateEnvelopeFile(pathname)).resolves.toEqual(envelope);

    const duplicateCiphertext = `${JSON.stringify({
      ciphertext: "forbidden plaintext",
    }).slice(0, -1)},${JSON.stringify(envelope).slice(1)}`;
    await writeFile(pathname, duplicateCiphertext, "utf8");
    await expect(validateEnvelopeFile(pathname)).rejects.toThrow(
      "加密题库信封格式无效",
    );

    await writeFile(
      pathname,
      JSON.stringify({ ...envelope, debugPlaintext: "forbidden" }),
      "utf8",
    );
    await expect(validateEnvelopeFile(pathname)).rejects.toThrow(
      "加密题库信封格式无效",
    );
  });
});
