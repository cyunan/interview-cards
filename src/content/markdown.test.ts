import { describe, expect, it } from "vitest";

import { normalizeObsidianMarkdown } from "./markdown";

describe("normalizeObsidianMarkdown", () => {
  it("turns wikilinks into safe display text", () => {
    expect(
      normalizeObsidianMarkdown(
        "参见 [[02-Android/Compose-声明式UI|Compose 原理]] 与 [[面试题模板#摘要]]。",
      ),
    ).toBe("参见 Compose 原理 与 面试题模板。");
  });

  it("handles escaped aliases used inside markdown tables", () => {
    expect(normalizeObsidianMarkdown("[[路径/笔记\\|显示名]]")).toBe("显示名");
  });
});
