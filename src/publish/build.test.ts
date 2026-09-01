import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { decryptEnvelope, type EncryptedEnvelopeV1 } from "../crypto/envelope";
import { buildEncryptedCards } from "./build";

const roots: string[] = [];
const password = "publish-only-passphrase-2026";

async function makeVault(): Promise<{ root: string; output: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "cards-publish-"));
  roots.push(root);
  const directory = path.join(root, "09-面试题整理", "02-Android");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "Widget-面试题清单.md"),
    `---
card_schema: 1
card_category: 02-Android
card_topic: Widget
card_variant: full
verified_at: 2026-08-31
---
## 一、机制
%%card-id: android-widget-001; priority: P1%%
### QuantumWidget 如何工作？
> [!summary] 30 秒回答
> 这是仅用于测试的虚构结论。
`,
  );
  return { root, output: path.join(root, "public", "cards.enc.json") };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("buildEncryptedCards", () => {
  it("writes an envelope that decrypts to the complete payload", async () => {
    const { root, output } = await makeVault();
    const baseline = {
      documents: 1,
      documentsByVariant: { sprint: 0, full: 1 },
      variants: 1,
      cards: 1,
      byDeck: { sprint: 0, full: 1 },
      byPriority: { P0: 0, P1: 1, P2: 0 },
      byCategory: { "02-Android": 1 },
    };

    await buildEncryptedCards({
      vaultRoot: root,
      outputPath: output,
      baseline,
      password,
      buildId: "test-build",
      builtAt: "2026-08-31T00:00:00.000Z",
    });

    const envelope = JSON.parse(await readFile(output, "utf8")) as EncryptedEnvelopeV1;
    const payload = await decryptEnvelope<{
      schema: string;
      cards: Array<{ id: string }>;
    }>(envelope, password);
    expect(payload).toMatchObject({
      schema: "cards-v1",
      buildId: "test-build",
      cards: [{ id: "android-widget-001" }],
    });
  });

  it("keeps the previous ciphertext when validation fails", async () => {
    const { root, output } = await makeVault();
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, "previous-valid-envelope");

    await expect(
      buildEncryptedCards({
        vaultRoot: root,
        outputPath: output,
        baseline: {
          documents: 46,
          documentsByVariant: { sprint: 15, full: 31 },
          variants: 0,
          cards: 0,
          byDeck: { sprint: 0, full: 0 },
          byPriority: { P0: 0, P1: 0, P2: 0 },
          byCategory: {},
        },
        password,
        buildId: "bad-build",
        builtAt: "2026-08-31T00:00:00.000Z",
      }),
    ).rejects.toThrow("题库数量基线发生变化");
    await expect(readFile(output, "utf8")).resolves.toBe("previous-valid-envelope");
  });
});
