import { describe, expect, it } from "vitest";

import { CardFormatError, parseCardDocument } from "./parser";

const FULL_DOCUMENT = `---
card_schema: 1
card_category: 99-虚构分类
card_topic: QuantumWidget
card_variant: full
verified_at: 2026-08-31
---
# QuantumWidget · 面试题清单

## 一、状态管理

%%card-id: fictional-quantum-widget-001; priority: P0%%
### 熵门和相位槽分别做什么？

> [!summary] 30 秒回答
> 熵门保存测试态；相位槽让虚构值跨越一次测试轮次。

#### 展开要点

- 读取熵门会建立虚构订阅。
- 相位槽不会跨越模拟器重启。

> [!tip] 项目挂钩
> 示例沙盒用虚构信号流驱动 QuantumWidget。

> [!warning] 易错点
> 相位槽不是持久化方案。

#### 高频追问

##### 可存相位槽和普通相位槽有什么区别？

> 可存相位槽能借助虚构快照跨测试轮次恢复。

## 使用说明

这里不是卡片。
`;

describe("parseCardDocument", () => {
  it("parses a full interview card and excludes document guidance", () => {
    const result = parseCardDocument({
      path: "09-面试题整理/99-虚构分类/QuantumWidget-面试题清单.md",
      source: FULL_DOCUMENT,
    });

    expect(result).toEqual({
      schema: 1,
      category: "99-虚构分类",
      topic: "QuantumWidget",
      variant: "full",
      verifiedAt: "2026-08-31",
      cards: [
        {
          id: "fictional-quantum-widget-001",
          question: "熵门和相位槽分别做什么？",
          category: "99-虚构分类",
          topic: "QuantumWidget",
          variant: "full",
          priority: "P0",
          quickAnswerMd: "熵门保存测试态；相位槽让虚构值跨越一次测试轮次。",
          detailMd: "- 读取熵门会建立虚构订阅。\n- 相位槽不会跨越模拟器重启。",
          projectHookMd: "示例沙盒用虚构信号流驱动 QuantumWidget。",
          pitfallsMd: "相位槽不是持久化方案。",
          followUps: [
            {
              question: "可存相位槽和普通相位槽有什么区别？",
              answerMd: "可存相位槽能借助虚构快照跨测试轮次恢复。",
            },
          ],
          source: {
            path: "09-面试题整理/99-虚构分类/QuantumWidget-面试题清单.md",
            heading: "熵门和相位槽分别做什么？",
            line: 13,
          },
        },
      ],
    });
  });

  it("rejects a question without a stable card id", () => {
    const source = FULL_DOCUMENT.replace(
      "%%card-id: fictional-quantum-widget-001; priority: P0%%\n",
      "",
    );

    expect(() =>
      parseCardDocument({ path: "bad.md", source }),
    ).toThrowError(new CardFormatError("bad.md", 12, "三级标题缺少 card-id 元数据"));
  });

  it("reports malformed reserved card metadata on its own line", () => {
    const source = FULL_DOCUMENT.replace(
      "%%card-id: fictional-quantum-widget-001; priority: P0%%",
      "%%card-id: INVALID ID; priority: P9%%",
    );

    expect(() =>
      parseCardDocument({ path: "malformed-id.md", source }),
    ).toThrowError(new CardFormatError("malformed-id.md", 12, "card-id 格式非法"));

    const insideBody = FULL_DOCUMENT.replace(
      "> 熵门保存测试态；相位槽让虚构值跨越一次测试轮次。",
      "> 熵门保存测试态；相位槽让虚构值跨越一次测试轮次。\n%%card-id: INVALID%%",
    );
    expect(() =>
      parseCardDocument({ path: "body-id.md", source: insideBody }),
    ).toThrowError(new CardFormatError("body-id.md", 17, "card-id 格式非法"));
  });

  it("rejects images and summaries that are too long", () => {
    const withImage = FULL_DOCUMENT.replace(
      "- 相位槽不会跨越模拟器重启。",
      "- 相位槽不会跨越模拟器重启。\n![[quantum-widget.png]]",
    );
    expect(() => parseCardDocument({ path: "image.md", source: withImage })).toThrow(
      "卡片内容不能包含图片",
    );

    const longAnswer = "答".repeat(221);
    const withLongAnswer = FULL_DOCUMENT.replace(
      "熵门保存测试态；相位槽让虚构值跨越一次测试轮次。",
      longAnswer,
    );
    expect(() =>
      parseCardDocument({ path: "long.md", source: withLongAnswer }),
    ).toThrow("30 秒回答超过 220 个字符");
  });

  it("rejects a normalized but impossible frontmatter calendar date", () => {
    expect(() =>
      parseCardDocument({
        path: "invalid-date.md",
        source: FULL_DOCUMENT.replace("2026-08-31", "2026-99-99"),
      }),
    ).toThrow("verified_at 必须为真实日期 YYYY-MM-DD");
  });

  it("wraps malformed frontmatter YAML with the document path and line", () => {
    const source = FULL_DOCUMENT.replace(
      "card_topic: QuantumWidget",
      "card_topic: [QuantumWidget",
    );

    expect(() =>
      parseCardDocument({ path: "invalid-yaml.md", source }),
    ).toThrowError(
      new CardFormatError("invalid-yaml.md", 5, "Frontmatter YAML 格式非法"),
    );
  });

  it("rejects overwritten or dangling card metadata at its own line", () => {
    const consecutive = FULL_DOCUMENT.replace(
      "%%card-id: fictional-quantum-widget-001; priority: P0%%",
      "%%card-id: fictional-unused-card-001; priority: P1%%\n%%card-id: fictional-quantum-widget-001; priority: P0%%",
    );
    expect(() =>
      parseCardDocument({ path: "double-id.md", source: consecutive }),
    ).toThrow("double-id.md:12 card-id 后缺少三级题目标题");

    const dangling = FULL_DOCUMENT.replace(
      "\n## 使用说明",
      "\n%%card-id: fictional-unused-card-002; priority: P1%%\n\n## 使用说明",
    );
    expect(() =>
      parseCardDocument({ path: "dangling-id.md", source: dangling }),
    ).toThrow(/dangling-id\.md:\d+ card-id 后缺少三级题目标题/);
  });

  it("keeps nested fourth-level headings inside expanded details", () => {
    const source = FULL_DOCUMENT.replace(
      "- 读取熵门会建立虚构订阅。\n- 相位槽不会跨越模拟器重启。",
      "#### 机制\n\n- 读取熵门会建立虚构订阅。\n\n#### 边界\n\n- 相位槽不会跨越模拟器重启。",
    );

    const result = parseCardDocument({ path: "nested.md", source });

    expect(result.cards[0].detailMd).toBe(
      "#### 机制\n\n- 读取熵门会建立虚构订阅。\n\n#### 边界\n\n- 相位槽不会跨越模拟器重启。",
    );
  });

  it("parses consecutive cards without skipping the next metadata line", () => {
    const secondCard = `
%%card-id: fictional-quantum-widget-002; priority: P1%%
### 熵折叠是什么？

> [!summary] 30 秒回答
> 虚构信号变化后，QuantumWidget 会重新计算关联区域。
`;
    const source = FULL_DOCUMENT.replace("\n## 使用说明", `${secondCard}\n## 使用说明`);

    const result = parseCardDocument({ path: "two-cards.md", source });

    expect(result.cards.map((card) => card.id)).toEqual([
      "fictional-quantum-widget-001",
      "fictional-quantum-widget-002",
    ]);
  });
});
