import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { compileVault, discoverCardFiles } from "./vault";

const roots: string[] = [];
const cardDocument = (id: string, decks = "full", legacy = "") => `---
card_schema: 2
card_category: 99-虚构分类
card_topic: QuantumWidget
verified_at: 2026-08-31
---
## 一、状态
%%card-id: ${id}; priority: P1; decks: ${decks}%%
${legacy}
### 熵门是什么？
> [!summary] 30 秒回答
> 虚构回答。
`;

async function makeVault(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "interview-cards-vault-v2-"));
  roots.push(root);
  await mkdir(path.join(root, "09-面试题整理", "99-虚构分类"), { recursive: true });
  await mkdir(path.join(root, "00-个人资料", "简历技术点"), { recursive: true });
  await mkdir(path.join(root, "01-Kotlin"), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("discoverCardFiles schema v2", () => {
  it("only discovers interview lists below 09 and ignores all other modules/files", async () => {
    const root = await makeVault();
    await writeFile(path.join(root, "09-面试题整理", "99-虚构分类", "QuantumWidget-面试题清单.md"), cardDocument("fictional-quantum-widget-001"));
    await writeFile(path.join(root, "09-面试题整理", "99-虚构分类", "速记-错误.md"), "不得发现");
    await writeFile(path.join(root, "00-个人资料", "简历技术点", "速记-05-QuantumWidget.md"), cardDocument("fictional-quantum-widget-002"));
    await writeFile(path.join(root, "01-Kotlin", "Kotlin-面试题清单.md"), "不得发现");
    await expect(discoverCardFiles(root)).resolves.toEqual([
      "09-面试题整理/99-虚构分类/QuantumWidget-面试题清单.md",
    ]);
  });
});

describe("compileVault schema v2", () => {
  it("compiles each canonical card once and reports memberships plus digest", async () => {
    const root = await makeVault();
    await writeFile(path.join(root, "09-面试题整理", "99-虚构分类", "QuantumWidget-面试题清单.md"), cardDocument("fictional-quantum-widget-001", "sprint,full", "%%legacy-card-ids: old-quantum-001%%"));
    const result = await compileVault(root);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({ id: "fictional-quantum-widget-001", legacyIds: ["old-quantum-001"], decks: ["sprint", "full"] });
    expect(result.report).toMatchObject({ sourceDocuments: 1, cards: 1, byDeck: { sprint: 1, full: 1 }, byPriority: { P0: 0, P1: 1, P2: 0 }, byCategory: { "99-虚构分类": 1 } });
    expect(result.report.membershipDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["duplicate-canonical-面试题清单.md", cardDocument("fictional-quantum-widget-001"), "fictional-quantum-widget-001"],
    ["duplicate-legacy-面试题清单.md", cardDocument("fictional-quantum-widget-002", "full", "%%legacy-card-ids: old-quantum-001%%"), "old-quantum-001"],
  ])("rejects duplicate canonical or legacy IDs: %s", async (filename, second, id) => {
    const root = await makeVault();
    await writeFile(path.join(root, "09-面试题整理", "99-虚构分类", "first-面试题清单.md"), cardDocument("fictional-quantum-widget-001", "full", "%%legacy-card-ids: old-quantum-001%%"));
    await writeFile(path.join(root, "09-面试题整理", "99-虚构分类", filename), second);
    await expect(compileVault(root)).rejects.toThrow(id);
  });

  it("rejects a legacy ID that conflicts with any canonical ID", async () => {
    const root = await makeVault();
    await writeFile(path.join(root, "09-面试题整理", "99-虚构分类", "first-面试题清单.md"), cardDocument("fictional-quantum-widget-001"));
    await writeFile(path.join(root, "09-面试题整理", "99-虚构分类", "second-面试题清单.md"), cardDocument("fictional-quantum-widget-002", "full", "%%legacy-card-ids: fictional-quantum-widget-001%%"));
    await expect(compileVault(root)).rejects.toThrow("fictional-quantum-widget-001");
  });
});
