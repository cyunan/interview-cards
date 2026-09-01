import { describe, expect, it } from "vitest";

import { CardFormatError, parseCardDocument } from "./parser";

const DOCUMENT = `---
card_schema: 2
card_category: 99-虚构分类
card_topic: QuantumWidget
verified_at: 2026-08-31
---
# QuantumWidget · 面试题清单

## 一、状态管理

%%card-id: fictional-quantum-widget-001; priority: P0; decks: sprint,full%%
%%legacy-card-ids: old-quantum-a,old-quantum-b%%
### 熵门和相位槽分别做什么？

> [!summary] 30 秒回答
> 熵门保存测试态；相位槽让虚构值跨越一次测试轮次。

#### 深入理解

- 读取熵门会建立虚构订阅。
- 相位槽不会跨越模拟器重启。

> [!tip] 项目挂钩
> 示例沙盒用虚构信号流驱动 QuantumWidget。

> [!warning] 易错点
> 相位槽不是持久化方案。

#### 高频追问

##### 可存相位槽和普通相位槽有什么区别？

> 可存相位槽能借助虚构快照跨测试轮次恢复。
`;

describe("parseCardDocument schema v2", () => {
  it("parses one canonical card with memberships and legacy ids", () => {
    expect(parseCardDocument({ path: "cards.md", source: DOCUMENT })).toEqual({
      schema: 2,
      category: "99-虚构分类",
      topic: "QuantumWidget",
      verifiedAt: "2026-08-31",
      cards: [
        expect.objectContaining({
          id: "fictional-quantum-widget-001",
          legacyIds: ["old-quantum-a", "old-quantum-b"],
          decks: ["sprint", "full"],
          priority: "P0",
          quickAnswerMd: "熵门保存测试态；相位槽让虚构值跨越一次测试轮次。",
          detailMd: "- 读取熵门会建立虚构订阅。\n- 相位槽不会跨越模拟器重启。",
          followUps: [{
            question: "可存相位槽和普通相位槽有什么区别？",
            answerMd: "可存相位槽能借助虚构快照跨测试轮次恢复。",
          }],
        }),
      ],
    });
  });

  it("accepts full as the only valid single-deck membership", () => {
    const source = DOCUMENT
      .replace("decks: sprint,full", "decks: full")
      .replace("%%legacy-card-ids: old-quantum-a,old-quantum-b%%\n", "");
    expect(parseCardDocument({ path: "full.md", source }).cards[0].decks).toEqual(["full"]);
  });

  it.each([
    ["card_schema: 1", "card_schema 必须为 2"],
    ["card_schema: 2\ncard_variant: full", "不允许文档级 card_variant"],
  ])("rejects legacy document metadata: %s", (metadata, message) => {
    expect(() => parseCardDocument({ path: "bad.md", source: DOCUMENT.replace("card_schema: 2", metadata) })).toThrow(message);
  });

  it.each([
    "decks: sprint",
    "decks: full,sprint",
    "decks: full,full",
    "decks: unknown",
  ])("rejects invalid deck membership %s", (decks) => {
    expect(() => parseCardDocument({ path: "bad-decks.md", source: DOCUMENT.replace("decks: sprint,full", decks) })).toThrow("decks");
  });

  it("rejects malformed and duplicate legacy ids", () => {
    expect(() => parseCardDocument({
      path: "bad-legacy.md",
      source: DOCUMENT.replace("old-quantum-a,old-quantum-b", "old-quantum-a,old-quantum-a"),
    })).toThrow("legacy");
    expect(() => parseCardDocument({
      path: "bad-legacy.md",
      source: DOCUMENT.replace("old-quantum-a,old-quantum-b", "INVALID ID"),
    })).toThrow("legacy");
  });

  it("requires the v2 detail heading and rejects old heading", () => {
    const source = DOCUMENT.replace("#### 深入理解", "#### 展开要点");
    const result = parseCardDocument({ path: "old-heading.md", source });
    expect(result.cards[0].detailMd).toBeUndefined();
  });

  it("keeps the 30-second answer required and capped at 220 characters", () => {
    const noSummary = DOCUMENT.replace("> [!summary] 30 秒回答\n> 熵门保存测试态；相位槽让虚构值跨越一次测试轮次。\n\n", "");
    expect(() => parseCardDocument({ path: "missing-summary.md", source: noSummary })).toThrow("30 秒回答");
    const long = DOCUMENT.replace("熵门保存测试态；相位槽让虚构值跨越一次测试轮次。", "答".repeat(221));
    expect(() => parseCardDocument({ path: "long-summary.md", source: long })).toThrow("超过 220");
  });

  it("reports malformed card metadata at its source line", () => {
    const source = DOCUMENT.replace(
      "%%card-id: fictional-quantum-widget-001; priority: P0; decks: sprint,full%%",
      "%%card-id: INVALID; priority: P9; decks: sprint%%",
    );
    expect(() => parseCardDocument({ path: "malformed.md", source })).toThrowError(
      new CardFormatError("malformed.md", 11, "card-id 格式非法"),
    );
  });
});
