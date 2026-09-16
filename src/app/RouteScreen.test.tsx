// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardV2 } from "../content/types";
import { KNOWLEDGE_ROUTES } from "../routes/routes";
import { RouteScreen } from "./RouteScreen";

afterEach(cleanup);

const route = KNOWLEDGE_ROUTES[0];
const cards: CardV2[] = route.steps.flatMap((step) => step.cardIds).map((id, index) => ({
  id, legacyIds: [], question: `虚构练习 ${index}`, category: "测试", topic: "测试",
  decks: ["full"], priority: "P1", quickAnswerMd: "虚构短答",
  followUps: Array.from({ length: 4 }, (_, i) => ({ question: `阶段复述：虚构复述 ${index}-${i}`, answerMd: `虚构完整回答 ${index}-${i}` })),
  source: { path: "fictional.md", heading: "测试" },
}));

describe("route detail", () => {
  it("shows seven stages with collapsed recap answers from the payload", () => {
    const { container } = render(<RouteScreen cards={cards} progress={new Map()} selectedRouteId={route.id} onSelectRoute={vi.fn()} onPractice={vi.fn()} />);
    expect(container.querySelectorAll(".route-step")).toHaveLength(7);
    expect(container.querySelectorAll(".route-checkpoint[open]")).toHaveLength(0);
    expect(screen.getByText("虚构完整回答 1-1")).toBeInTheDocument();
    expect(screen.getByText("阶段复述：虚构复述 1-1")).toBeInTheDocument();
    expect(screen.queryByText(/阶段复述：阶段复述/)).not.toBeInTheDocument();
    expect(screen.queryByText("虚构短答")).not.toBeInTheDocument();
    expect(screen.getByText(/练过表示完成过评分/)).toBeInTheDocument();
    const links = screen.getByRole("navigation", { name: "跳转学习阶段" }).querySelectorAll("a");
    expect(links).toHaveLength(7);
    for (const link of links) expect(container.querySelector(link.hash)).not.toBeNull();
  });

  it("starts a chosen stage with its index and keeps missing answers explicit", () => {
    const practice = vi.fn();
    render(<RouteScreen cards={cards.map((card) => ({ ...card, followUps: [] }))} progress={new Map()} selectedRouteId={route.id} onSelectRoute={vi.fn()} onPractice={practice} />);
    fireEvent.click(screen.getAllByRole("button", { name: "练习这一阶段" })[0]);
    expect(practice).toHaveBeenCalledWith(route, 1);
    expect(screen.getAllByText("当前题库缺少对应参考回答，更新题库后再试。")).toHaveLength(7);
  });
});
