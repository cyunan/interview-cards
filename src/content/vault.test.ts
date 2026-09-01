import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { compileVault, discoverCardFiles } from "./vault";

const roots: string[] = [];

async function makeVault(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "interview-cards-vault-"));
  roots.push(root);
  await mkdir(path.join(root, "09-面试题整理", "99-虚构分类"), { recursive: true });
  await mkdir(path.join(root, "00-个人资料", "简历技术点"), { recursive: true });
  await mkdir(path.join(root, "00-个人资料"), { recursive: true });
  return root;
}

function document(variant: "full" | "sprint", id: string, answer: string): string {
  return `---
card_schema: 1
card_category: 99-虚构分类
card_topic: QuantumWidget
card_variant: ${variant}
verified_at: 2026-08-31
---
# QuantumWidget

## 一、状态

%%card-id: ${id}; priority: P0%%
### 熵门是什么？

> [!summary] 30 秒回答
> ${answer}
`;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("discoverCardFiles", () => {
  it("returns only interview lists and resume sprint notes", async () => {
    const root = await makeVault();
    await writeFile(
      path.join(root, "09-面试题整理", "99-虚构分类", "QuantumWidget-面试题清单.md"),
      document("full", "fictional-quantum-widget-001", "完整虚构回答。"),
    );
    await writeFile(
      path.join(root, "00-个人资料", "简历技术点", "速记-05-QuantumWidget.md"),
      document("sprint", "fictional-quantum-widget-001", "冲刺虚构回答。"),
    );
    await writeFile(path.join(root, "00-个人资料", "个人信息.md"), "不得读取");
    await writeFile(
      path.join(root, "09-面试题整理", "99-虚构分类", "速记-错误目录.md"),
      document("full", "fictional-wrong-path-001", "不应发现。"),
    );
    await writeFile(
      path.join(root, "00-个人资料", "简历技术点", "错误目录-面试题清单.md"),
      document("sprint", "fictional-wrong-path-002", "不应发现。"),
    );

    await expect(discoverCardFiles(root)).resolves.toEqual([
      "00-个人资料/简历技术点/速记-05-QuantumWidget.md",
      "09-面试题整理/99-虚构分类/QuantumWidget-面试题清单.md",
    ]);
  });
});

describe("compileVault", () => {
  it("merges variants and returns a deterministic report", async () => {
    const root = await makeVault();
    await writeFile(
      path.join(root, "09-面试题整理", "99-虚构分类", "QuantumWidget-面试题清单.md"),
      document("full", "fictional-quantum-widget-001", "完整虚构回答。"),
    );
    await writeFile(
      path.join(root, "00-个人资料", "简历技术点", "速记-05-QuantumWidget.md"),
      document("sprint", "fictional-quantum-widget-001", "冲刺虚构回答。"),
    );

    const result = await compileVault(root);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      id: "fictional-quantum-widget-001",
      decks: ["sprint", "full"],
      quickAnswerMd: "冲刺虚构回答。",
    });
    expect(result.report).toEqual({
      documents: 2,
      documentsByVariant: { sprint: 1, full: 1 },
      variants: 2,
      cards: 1,
      byDeck: { sprint: 1, full: 1 },
      byPriority: { P0: 1, P1: 0, P2: 0 },
      byCategory: { "99-虚构分类": 1 },
    });
    expect(result.sourceVariants).toHaveLength(2);
    expect(result.sourceVariants.map((variant) => variant.quickAnswerMd)).toEqual([
      "冲刺虚构回答。",
      "完整虚构回答。",
    ]);
  });

  it("rejects swapped full and sprint metadata even when aggregate counts match", async () => {
    const root = await makeVault();
    await writeFile(
      path.join(root, "09-面试题整理", "99-虚构分类", "QuantumWidget-面试题清单.md"),
      document("sprint", "fictional-quantum-widget-001", "错误的冲刺声明。"),
    );
    await writeFile(
      path.join(root, "00-个人资料", "简历技术点", "速记-05-QuantumWidget.md"),
      document("full", "fictional-quantum-widget-002", "错误的完整声明。"),
    );

    await expect(compileVault(root)).rejects.toThrow(
      "速记-05-QuantumWidget.md:1 card_variant 必须为 sprint",
    );
  });

  it("rejects images anywhere in a target document", async () => {
    const root = await makeVault();
    await writeFile(
      path.join(root, "09-面试题整理", "99-虚构分类", "QuantumWidget-面试题清单.md"),
      `![[private.png]]\n${document("full", "fictional-quantum-widget-001", "虚构回答。")}`,
    );

    await expect(compileVault(root)).rejects.toThrow("卡片文档不能包含图片");
  });

  it("rejects a discovered target document that contains no cards", async () => {
    const root = await makeVault();
    await writeFile(
      path.join(root, "09-面试题整理", "99-虚构分类", "QuantumWidget-面试题清单.md"),
      `---
card_schema: 1
card_category: 99-虚构分类
card_topic: QuantumWidget
card_variant: full
verified_at: 2026-08-31
---
## 使用说明

暂无卡片。
`,
    );

    await expect(compileVault(root)).rejects.toThrow(
      "QuantumWidget-面试题清单.md:1 没有可生成的卡片",
    );
  });

  it("rejects a card-ref whose target does not exist", async () => {
    const root = await makeVault();
    await writeFile(
      path.join(root, "09-面试题整理", "99-虚构分类", "QuantumWidget-面试题清单.md"),
      `${document("full", "fictional-quantum-widget-001", "虚构回答。")}\n%%card-ref: missing-card%%\n#### 旧题\n`,
    );

    await expect(compileVault(root)).rejects.toThrow(
      "card-ref 指向不存在的卡片 missing-card",
    );
  });

  it("rejects malformed or unresolved Obsidian wikilinks with a line number", async () => {
    const root = await makeVault();
    await writeFile(
      path.join(root, "09-面试题整理", "99-虚构分类", "QuantumWidget-面试题清单.md"),
      `${document("full", "fictional-quantum-widget-001", "虚构回答。")}\n残缺双链：[[QuantumWidget\n`,
    );

    await expect(compileVault(root)).rejects.toThrow(
      "QuantumWidget-面试题清单.md:18 存在未解析的 Obsidian 双链",
    );
  });
});
