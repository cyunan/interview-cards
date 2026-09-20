// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardV2 } from "../content/types";
import { KNOWLEDGE_ROUTES } from "../routes/routes";
import { RouteScreen } from "./RouteScreen";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const route = KNOWLEDGE_ROUTES[0];
const cards: CardV2[] = route.steps.flatMap((step) => step.cardIds).map((id, index) => ({
  id, legacyIds: [], question: `虚构练习 ${index}`, category: "测试", topic: "测试",
  decks: ["full"], priority: "P1", quickAnswerMd: "虚构短答",
  followUps: Array.from({ length: 4 }, (_, i) => ({ question: `阶段复述：虚构复述 ${index}-${i}`, answerMd: `虚构完整回答 ${index}-${i}` })),
  source: { path: "fictional.md", heading: "测试" },
}));
const documents = [{
  id: "android-startup",
  title: "应用启动：冷启动与热启动",
  sourcePath: "02-Android/Framework/应用启动-冷启动&热启动.md",
  reason: "解释页面入口与首帧",
  markdown: "## 启动链路\n\n应用先准备进程，再进入页面。\n\n![启动流程](https://interview-cards.invalid/reference-image/abcdef0123456789)",
  images: [{ id: "abcdef0123456789", alt: "启动流程", mimeType: "image/png" as const, data: "AAE=" }],
}];

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

  it("shows the current stage's technical documents behind a floating entry", () => {
    render(<RouteScreen cards={cards} documents={documents} progress={new Map()} selectedRouteId={route.id} onSelectRoute={vi.fn()} onPractice={vi.fn()} />);
    const context = screen.getByRole("complementary", { name: "路线阶段上下文" });
    expect(within(context).getByRole("button", { name: /应用启动：冷启动与热启动/ })).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "技术资料 · 1" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(screen.getAllByRole("complementary", { name: "阶段技术资料" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /应用启动：冷启动与热启动/ })).toHaveLength(2);
    expect(screen.getAllByText("解释页面入口与首帧")).toHaveLength(2);
  });

  it("opens one technical document in a full-screen reader instead of rendering it inside the sidebar", () => {
    render(<RouteScreen cards={cards} documents={documents} progress={new Map()} selectedRouteId={route.id} onSelectRoute={vi.fn()} onPractice={vi.fn()} />);
    const context = screen.getByRole("complementary", { name: "路线阶段上下文" });
    expect(context.querySelector(".markdown")).not.toBeInTheDocument();

    fireEvent.click(within(context).getByRole("button", { name: /应用启动：冷启动与热启动/ }));

    const reader = screen.getByRole("dialog", { name: "技术资料阅读" });
    expect(reader).toBeVisible();
    expect(reader).toHaveTextContent("应用先准备进程，再进入页面。");
    expect(reader.querySelector("img")).toHaveAttribute("src", "data:image/png;base64,AAE=");
    expect(reader).toHaveTextContent("来源：02-Android/Framework/应用启动-冷启动&热启动.md");
    expect(context.querySelector(".markdown")).not.toBeInTheDocument();

    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");
    const readerBody = reader.querySelector<HTMLDivElement>(".route-reference-reader-body");
    expect(readerBody).not.toBeNull();
    Object.defineProperties(readerBody, {
      scrollTop: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 500 },
      clientHeight: { configurable: true, value: 100 },
    });
    const wheel = createEvent.wheel(readerBody!, { deltaY: 120 });
    const preventDefault = vi.spyOn(wheel, "preventDefault");
    fireEvent(readerBody!, wheel);
    expect(preventDefault).toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "技术资料阅读" })).not.toBeInTheDocument();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.position).toBe("");
  });

  it("returns from a technical document to the route detail on browser back", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    render(<RouteScreen cards={cards} documents={documents} progress={new Map()} selectedRouteId={route.id} onSelectRoute={vi.fn()} onPractice={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /应用启动：冷启动与热启动/ }));
    expect(screen.getByRole("dialog", { name: "技术资料阅读" })).toBeVisible();
    expect(pushState).toHaveBeenCalledWith(
      expect.objectContaining({ routeId: route.id, referenceId: "android-startup" }),
      "",
      expect.any(String),
    );

    const routeDetailState = { app: "interview-cards", view: "routes", routeId: route.id };
    window.history.replaceState(routeDetailState, "", "#route-frame-clock");
    fireEvent(window, new PopStateEvent("popstate", { state: routeDetailState }));

    expect(screen.queryByRole("dialog", { name: "技术资料阅读" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "把消息接到帧：VSYNC 怎样变成一次遍历？" })).toBeInTheDocument();
  });

  it("keeps a useful context sidebar when the current stage has no documents", () => {
    render(<RouteScreen cards={cards} progress={new Map()} selectedRouteId={route.id} onSelectRoute={vi.fn()} onPractice={vi.fn()} />);
    const context = screen.getByRole("complementary", { name: "路线阶段上下文" });
    expect(context).toHaveTextContent("当前阶段");
    expect(context).toHaveTextContent("01 · 页面启动");
    expect(context).toHaveTextContent("当前阶段没有附带技术资料");
  });

  it("exposes the stage index as a desktop route rail", () => {
    render(<RouteScreen cards={cards} progress={new Map()} selectedRouteId={route.id} onSelectRoute={vi.fn()} onPractice={vi.fn()} />);
    const rail = screen.getByRole("navigation", { name: "桌面路线阶段" });
    expect(rail).toBeInTheDocument();
    expect(rail.querySelectorAll("a")).toHaveLength(7);
  });
});
