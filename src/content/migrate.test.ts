import { describe, expect, it } from "vitest";

import { migrateCardDocument, normalizeQuestionKey } from "./migrate";

const RAW_FULL = `# QuantumWidget · 面试题清单

题目整理自 [[QuantumWidget-虚构原理]]。

---

## 一、状态管理

### 1. 熵门和相位槽分别做什么？

**熵门**保存测试态，读取会建立虚构订阅。**相位槽**让值跨越一次测试轮次。

- 相位槽不会跨越模拟器重启。

## 使用说明

- 返回 [[00-虚构索引]]。
`;

describe("normalizeQuestionKey", () => {
  it("ignores numbering, spaces, and terminal punctuation", () => {
    expect(normalizeQuestionKey("1. 熵门 和 相位槽 分别做什么？")).toBe(
      "熵门和相位槽分别做什么",
    );
  });

  it("cleans legacy nested hashes and Q prefixes", () => {
    expect(normalizeQuestionKey("#### Q12: 熵门如何唤醒虚构节点？")).toBe(
      "熵门如何唤醒虚构节点",
    );
  });
});

describe("migrateCardDocument", () => {
  it("adds card metadata and layered answers while preserving the original answer", () => {
    const result = migrateCardDocument({
      path: "09-面试题整理/99-虚构分类/QuantumWidget-面试题清单.md",
      source: RAW_FULL,
      verifiedAt: "2026-08-31",
      knownIdsByQuestion: new Map(),
    });

    expect(result.cardIds).toEqual(["general-quantumwidget-001"]);
    expect(result.source).toContain("card_category: 99-虚构分类");
    expect(result.source).toContain("card_variant: full");
    expect(result.source).toContain(
      "%%card-id: general-quantumwidget-001; priority: P1%%\n### 熵门和相位槽分别做什么？",
    );
    expect(result.source).toContain(
      "> [!summary] 30 秒回答\n> **熵门**保存测试态，读取会建立虚构订阅。**相位槽**让值跨越一次测试轮次。",
    );
    expect(result.source).toContain(
      "#### 展开要点\n\n**熵门**保存测试态，读取会建立虚构订阅。**相位槽**让值跨越一次测试轮次。",
    );
    expect(result.source).toContain("## 参考资料\n\n- [[QuantumWidget-虚构原理]]");
  });

  it("reuses the canonical full id for a matching sprint question", () => {
    const result = migrateCardDocument({
      path: "00-个人资料/简历技术点/速记-05-QuantumWidget.md",
      source: RAW_FULL.replace(
        "**熵门**保存测试态，读取会建立虚构订阅。**相位槽**让值跨越一次测试轮次。",
        "+ **30 秒答**：熵门保存状态，相位槽保留虚构值。",
      ),
      verifiedAt: "2026-08-31",
      knownIdsByQuestion: new Map([
        [normalizeQuestionKey("熵门和相位槽分别做什么？"), "fictional-quantum-widget-001"],
      ]),
    });

    expect(result.cardIds).toEqual(["fictional-quantum-widget-001"]);
    expect(result.source).toContain("card_variant: sprint");
    expect(result.source).toContain("priority: P0");
    expect(result.source).toContain(
      "> [!summary] 30 秒回答\n> 熵门保存状态，相位槽保留虚构值。",
    );
  });

  it("demotes review-navigation headings instead of generating cards", () => {
    const source = RAW_FULL.replace(
      "## 使用说明",
      "### 1.2 导航到哪里？\n\n跳到虚构索引。\n\n## 使用说明",
    );
    const result = migrateCardDocument({
      path: "09-面试题整理/99-虚构分类/QuantumWidget-面试题清单.md",
      source,
      verifiedAt: "2026-08-31",
      knownIdsByQuestion: new Map(),
    });

    expect(result.source).toContain("#### 1.2 导航到哪里？");
    expect(result.cardIds).toHaveLength(1);
  });

  it("removes image dependencies and reports them for manual review", () => {
    const source = RAW_FULL.replace(
      "- 相位槽不会跨越模拟器重启。",
      "![[quantum-widget.png]]\n\n- 相位槽不会跨越模拟器重启。",
    );
    const result = migrateCardDocument({
      path: "09-面试题整理/99-虚构分类/QuantumWidget-面试题清单.md",
      source,
      verifiedAt: "2026-08-31",
      knownIdsByQuestion: new Map(),
    });

    expect(result.source).not.toContain("![[quantum-widget.png]]");
    expect(result.warnings).toContainEqual(expect.stringContaining("已移除图片依赖"));
  });

  it("turns a repeated full question into a card-ref", () => {
    const result = migrateCardDocument({
      path: "09-面试题整理/99-虚构分类/OtherWidget-面试题清单.md",
      source: RAW_FULL,
      verifiedAt: "2026-08-31",
      knownIdsByQuestion: new Map([
        [normalizeQuestionKey("熵门和相位槽分别做什么？"), "fictional-quantum-widget-001"],
      ]),
    });

    expect(result.cardIds).toEqual([]);
    expect(result.source).toContain("%%card-ref: fictional-quantum-widget-001%%");
    expect(result.source).toContain("#### 熵门和相位槽分别做什么？");
    expect(result.source).not.toMatch(/\n###\s+熵门和相位槽分别做什么？/);
  });
});
