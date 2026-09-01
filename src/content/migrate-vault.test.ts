import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prepareVaultMigration, writeVaultMigration } from "./migrate-vault";
import { parseCardDocument } from "./parser";

const roots: string[] = [];

async function makeRawVault(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "interview-cards-migrate-"));
  roots.push(root);
  await mkdir(path.join(root, "09-面试题整理", "99-虚构分类"), { recursive: true });
  await mkdir(path.join(root, "00-个人资料", "简历技术点"), { recursive: true });
  return root;
}

const FULL = `# QuantumWidget · 面试题清单

## 一、状态

### 1. 熵门是什么？

熵门保存虚构测试状态。
`;

const SPRINT = `# QuantumWidget · 面试速记

## 一、状态

### 1. 熵门是什么？

+ **30 秒答**：熵门是虚构测试状态容器。
`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("prepareVaultMigration", () => {
  it("prepares every target in memory and validates merged ids", async () => {
    const root = await makeRawVault();
    await writeFile(
      path.join(root, "09-面试题整理", "99-虚构分类", "QuantumWidget-面试题清单.md"),
      FULL,
    );
    await writeFile(
      path.join(root, "00-个人资料", "简历技术点", "速记-05-QuantumWidget.md"),
      SPRINT,
    );

    const plan = await prepareVaultMigration(root, "2026-08-31");

    expect(plan.report).toMatchObject({ documents: 2, variants: 2, cards: 1 });
    expect(plan.documents.map((document) => document.path)).toEqual([
      "00-个人资料/简历技术点/速记-05-QuantumWidget.md",
      "09-面试题整理/99-虚构分类/QuantumWidget-面试题清单.md",
    ]);
    for (const document of plan.documents) {
      expect(() =>
        parseCardDocument({ path: document.path, source: document.source }),
      ).not.toThrow();
    }
  });

  it("does not write any file until the complete migration is valid", async () => {
    const root = await makeRawVault();
    const validPath = path.join(
      root,
      "09-面试题整理",
      "99-虚构分类",
      "QuantumWidget-面试题清单.md",
    );
    const invalidPath = path.join(
      root,
      "09-面试题整理",
      "99-虚构分类",
      "EmptyWidget-面试题清单.md",
    );
    await writeFile(validPath, FULL);
    await writeFile(invalidPath, "# EmptyWidget\n\n## 使用说明\n\n没有卡片。\n");

    await expect(writeVaultMigration(root, "2026-08-31")).rejects.toThrow(
      "没有可生成的卡片",
    );
    await expect(readFile(validPath, "utf8")).resolves.toBe(FULL);
  });
});
