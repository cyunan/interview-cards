// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { CardV2 } from "../content/types";
import { ProgressiveAnswer } from "./ProgressiveAnswer";

afterEach(cleanup);

const card = {
  id: "followup-card-001",
  legacyIds: [],
  question: "主问题",
  category: "99-测试",
  topic: "测试",
  decks: ["full"],
  priority: "P1",
  quickAnswerMd: "30 秒回答。",
  detailMd: "深入理解。",
  followUps: [
    { question: "追问一", answerMd: "答案一。" },
    { question: "追问二", answerMd: "答案二。" },
  ],
  source: { path: "fixture.md", heading: "主问题" },
} satisfies CardV2;

describe("ProgressiveAnswer follow-ups", () => {
  it("keeps every follow-up answer closed initially", () => {
    render(<ProgressiveAnswer card={card} />);

    expect(screen.getByText("高频追问 · 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /追问一/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("答案一。")).not.toBeInTheDocument();
  });

  it("opens one answer and closes the previous answer", () => {
    render(<ProgressiveAnswer card={card} />);

    fireEvent.click(screen.getByText("高频追问 · 2"));
    const first = screen.getByRole("button", { name: /追问一/ });
    const second = screen.getByRole("button", { name: /追问二/ });
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("答案一。")).toBeInTheDocument();

    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("答案一。")).not.toBeInTheDocument();
    expect(screen.getByText("答案二。")).toBeInTheDocument();
  });

  it("clears the open follow-up when the card id changes", () => {
    const { rerender } = render(<ProgressiveAnswer card={card} />);

    fireEvent.click(screen.getByText("高频追问 · 2"));
    fireEvent.click(screen.getByRole("button", { name: /追问一/ }));
    rerender(<ProgressiveAnswer card={{ ...card, id: "followup-card-002" }} />);

    expect(screen.getByRole("button", { name: /追问一/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the outer follow-up section free of inner answer indentation", () => {
    const { container } = render(<ProgressiveAnswer card={card} />);

    const section = container.querySelector("details.followup-answer, details.followup-section");
    expect(section).toHaveClass("followup-section");
    expect(section).not.toHaveClass("followup-item-answer");

    fireEvent.click(screen.getByText("高频追问 · 2"));
    fireEvent.click(screen.getByRole("button", { name: /追问一/ }));
    expect(container.querySelector(".followup-item-answer")).toBeInTheDocument();
  });
});
