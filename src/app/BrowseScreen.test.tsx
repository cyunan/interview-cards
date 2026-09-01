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
  it("searches every answer section and shows the complete card without changing progress", () => {
    render(<BrowseScreen cards={[card]} progress={new Map()} />);

    fireEvent.change(screen.getByLabelText("关键词"), {
      target: { value: "蓝色偏移" },
    });
    expect(screen.getByText("虚构装置如何校准？")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /虚构装置如何校准/ }));
    expect(screen.getByRole("heading", { name: "项目挂钩" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "易错点" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "高频追问" })).toBeInTheDocument();
    expect(screen.getByText("为了消除虚构噪声。")).toBeInTheDocument();
  });
});
