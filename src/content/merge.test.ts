import { describe, expect, it } from "vitest";

import { mergeCardVariants } from "./merge";
import type { ParsedCardVariant } from "./types";

const full: ParsedCardVariant = {
  id: "fictional-quantum-widget-001",
  question: "熵门和相位槽分别做什么？",
  category: "99-虚构分类",
  topic: "QuantumWidget",
  variant: "full",
  priority: "P1",
  quickAnswerMd: "完整虚构结论。",
  detailMd: "- 完整虚构展开。",
  followUps: [],
  source: { path: "full.md", heading: "熵门和相位槽分别做什么？", line: 13 },
};

const sprint: ParsedCardVariant = {
  ...full,
  variant: "sprint",
  priority: "P0",
  quickAnswerMd: "冲刺虚构结论。",
  source: { path: "sprint.md", heading: "熵门和相位槽分别做什么？", line: 8 },
};

describe("mergeCardVariants", () => {
  it("uses the sprint summary and full expansion while sharing one id", () => {
    expect(mergeCardVariants([full, sprint])).toEqual([
      {
        id: "fictional-quantum-widget-001",
        question: "熵门和相位槽分别做什么？",
        category: "99-虚构分类",
        topic: "QuantumWidget",
        decks: ["sprint", "full"],
        priority: "P0",
        quickAnswerMd: "冲刺虚构结论。",
        detailMd: "- 完整虚构展开。",
        followUps: [],
        source: { path: "full.md", heading: "熵门和相位槽分别做什么？" },
      },
    ]);
  });

  it("keeps the expansion when a card exists only in the sprint deck", () => {
    expect(mergeCardVariants([sprint])).toEqual([
      expect.objectContaining({
        id: "fictional-quantum-widget-001",
        decks: ["sprint"],
        detailMd: "- 完整虚构展开。",
      }),
    ]);
  });

  it("rejects two full variants with the same id", () => {
    expect(() =>
      mergeCardVariants([
        full,
        { ...full, source: { ...full.source, path: "other.md" } },
      ]),
    ).toThrow(
      "full.md:13 fictional-quantum-widget-001 存在多个 full 版本",
    );
  });

  it("allows wording changes while the stable id keeps semantic identity", () => {
    expect(
      mergeCardVariants([
        { ...sprint, question: "熵门与相位槽各负责什么？" },
        full,
      ])[0],
    ).toMatchObject({
      id: "fictional-quantum-widget-001",
      question: full.question,
      quickAnswerMd: sprint.quickAnswerMd,
      decks: ["sprint", "full"],
    });
  });

  it("normalizes Obsidian links in questions, follow-ups, and source headings", () => {
    const linkedQuestion = "[[路径/熵门|熵门]]负责什么？";
    expect(
      mergeCardVariants([
        {
          ...sprint,
          question: linkedQuestion,
          followUps: [{ question: "参见 [[路径/追问|追问]]？" }],
          source: { ...sprint.source, heading: linkedQuestion },
        },
      ])[0],
    ).toMatchObject({
      question: "熵门负责什么？",
      followUps: [{ question: "参见 追问？" }],
      source: { heading: "熵门负责什么？" },
    });
  });

  it("keeps sprint follow-ups when the paired full card has none", () => {
    expect(
      mergeCardVariants([
        full,
        {
          ...sprint,
          followUps: [
            { question: "冲刺追问是什么？", answerMd: "冲刺追问的虚构回答。" },
          ],
        },
      ])[0].followUps,
    ).toEqual([
      { question: "冲刺追问是什么？", answerMd: "冲刺追问的虚构回答。" },
    ]);
  });
});
