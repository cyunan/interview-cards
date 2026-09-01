// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { CardV2 } from "../content/types";
import { BrowseScreen } from "./BrowseScreen";

afterEach(cleanup);

const card: CardV2 = {
  id: "fictional-browse-card-001",
  legacyIds: [],
  question: "虚构装置如何校准？",
  category: "99-虚构分类",
  topic: "QuantumWidget",
  decks: ["full"],
  priority: "P1",
  quickAnswerMd: "先校准虚构相位。",
  detailMd: "- 核对测试刻度。",
  projectHookMd: "项目使用虚构校准器。",
  pitfallsMd: "不要忽略蓝色偏移边界。",
  followUps: [
    { question: "为什么要重试？", answerMd: "为了消除虚构噪声。" },
  ],
  source: { path: "fictional-browse.md", heading: "虚构装置如何校准？" },
};

describe("BrowseScreen", () => {
  it("searches every answer section and keeps the complete answer available", () => {
    const { container } = render(<BrowseScreen cards={[card]} progress={new Map()} />);

    fireEvent.change(screen.getByLabelText("关键词"), {
      target: { value: "蓝色偏移" },
    });
    expect(screen.getByText("虚构装置如何校准？")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /虚构装置如何校准/ }));
    expect(screen.getByText("30 秒回答", { selector: "h3" })).toBeInTheDocument();
    expect(container.querySelectorAll("details")).toHaveLength(4);
    expect(container.querySelectorAll("details[open]")).toHaveLength(0);
    expect(screen.getByText("深入理解", { selector: "summary" })).toBeInTheDocument();
    expect(screen.getByText("项目怎么讲", { selector: "summary" })).toBeInTheDocument();
    expect(screen.getByText("易错点", { selector: "summary" })).toBeInTheDocument();
    expect(screen.getByText("高频追问 · 1", { selector: "summary" })).toBeInTheDocument();
    expect(screen.getByText("为了消除虚构噪声。")).toBeInTheDocument();
  });

  it("does not render empty detail sections", () => {
    const sparseCard: CardV2 = {
      ...card,
      id: "fictional-browse-card-002",
      detailMd: undefined,
      projectHookMd: undefined,
      pitfallsMd: undefined,
      followUps: [],
    };

    const { container } = render(<BrowseScreen cards={[sparseCard]} progress={new Map()} />);
    fireEvent.click(screen.getByRole("button", { name: /虚构装置如何校准/ }));

    expect(screen.getByText("30 秒回答", { selector: "h3" })).toBeInTheDocument();
    expect(container.querySelectorAll("details")).toHaveLength(0);
  });

  it("allows each progressive section to be opened independently", () => {
    const { container } = render(<BrowseScreen cards={[card]} progress={new Map()} />);
    fireEvent.click(screen.getByRole("button", { name: /虚构装置如何校准/ }));

    const details = [...container.querySelectorAll("details")];
    const summaries = details.map((detail) => detail.querySelector("summary"));
    fireEvent.click(summaries[0]!);
    fireEvent.click(summaries[2]!);

    expect(details[0]).toHaveAttribute("open");
    expect(details[1]).not.toHaveAttribute("open");
    expect(details[2]).toHaveAttribute("open");
    expect(details[3]).not.toHaveAttribute("open");
  });

  it("resets detail state when the browse card is collapsed and reopened", () => {
    const { container } = render(<BrowseScreen cards={[card]} progress={new Map()} />);
    const cardButton = () => screen.getByRole("button", { name: /虚构装置如何校准/ });

    fireEvent.click(cardButton());
    fireEvent.click(screen.getByText("深入理解", { selector: "summary" }));
    expect(container.querySelector("details")!).toHaveAttribute("open");
    fireEvent.click(cardButton());
    fireEvent.click(cardButton());

    expect(container.querySelectorAll("details[open]")).toHaveLength(0);
  });
});
