// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ParsedCardsPayload } from "../content/payload";
import { ContentWorkspace } from "./App";

afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

it("reads the answer immediately, opens its complete source and returns to that source", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const payload: ParsedCardsPayload = {
    schema: "cards-v3", buildId: "fictional", builtAt: "2026-11-24T00:00:00Z", routes: [],
    cards: [{
      id: "fictional-question", legacyIds: [], category: "02-Imaginary", topic: "Fictional",
      priority: "P0", decks: ["full"], question: "虚构的状态怎么保存？", quickAnswerMd: "保存当前状态。",
      followUps: [{ question: "重启后呢？", answerMd: "读持久化记录。" }],
      source: { path: "02-Imaginary/note.md", heading: "虚构的状态怎么保存？" },
    }],
    documents: [{
      id: "fictional-document", sourcePath: "02-Imaginary/note.md", title: "虚构状态笔记",
      reason: "查阅状态的实现", markdown: "## 原理\n\n保存当前状态。\n\n## 文末验证\n\n读取同一条记录。",
    }],
  };
  render(<ContentWorkspace payload={payload} onLock={() => undefined} />);
  expect(screen.getByRole("heading", { name: "虚构的状态怎么保存？" })).toBeInTheDocument();
  expect(screen.getByLabelText("参考回答")).toHaveTextContent("保存当前状态。");
  expect(screen.queryByRole("button", { name: "查看回答" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("笔记与资料出处"));
  const title = screen.getByRole("button", { name: "阅读全文：虚构状态笔记" });
  fireEvent.click(screen.getByRole("button", { name: "预览：虚构状态笔记" }));
  expect(screen.getByRole("button", { name: "收起：虚构状态笔记" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(title);
  expect(screen.getByRole("heading", { name: "文末验证" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "文末验证" })).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: /返回问答/ })[0]);
  await waitFor(() => expect(title).toHaveFocus());
  expect(screen.getByRole("button", { name: "收起：虚构状态笔记" })).toHaveAttribute("aria-expanded", "true");
});

it("expands question topics independently and restores the reading selection across views", () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  const makeCard = (id: string, category: string, topic: string, question: string): ParsedCardsPayload["cards"][number] => ({
    id, category, topic, question, legacyIds: [], priority: "P1", decks: ["full"],
    quickAnswerMd: "测试答案。", followUps: [], source: { path: "test.md", heading: question },
  });
  render(<ContentWorkspace payload={{
    schema: "cards-v3", buildId: "fictional-scope", builtAt: "2026-11-24T00:00:00Z", routes: [],
    cards: [
      makeCard("test-route-001", "03-开源框架", "ARouter · 面试题与答案", "路由入口是什么？"),
      makeCard("test-route-002", "03-开源框架", "ARouter · 面试题与答案", "路由如何注册？"),
      makeCard("test-http-001", "03-开源框架", "OkHttp · 面试题与答案", "拦截器如何执行？"),
      makeCard("test-network-001", "06-网络", "DNS", "如何解析域名？"),
    ],
  }} />);

  const category = screen.getByRole("combobox", { name: "一级分类" });
  const arouter = screen.getByRole("button", { name: /ARouter/ });
  const okhttp = screen.getByRole("button", { name: /OkHttp/ });
  expect(category).toHaveValue("03-开源框架");
  expect(arouter).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "路由入口是什么？" })).toHaveAttribute("aria-current", "true");
  expect(screen.getByRole("button", { name: "路由如何注册？" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "拦截器如何执行？" })).not.toBeInTheDocument();

  fireEvent.click(okhttp);
  expect(arouter).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("heading", { name: "路由入口是什么？" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "拦截器如何执行？" }));
  expect(screen.getByRole("heading", { name: "拦截器如何执行？" })).toBeInTheDocument();

  for (const view of ["技术文档", "学习路线"]) {
    fireEvent.click(screen.getByRole("button", { name: view }));
    expect(screen.getByRole("heading", { name: view === "学习路线" ? "沿路线建立理解" : view })).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "问答目录" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "面试问答" }));
    expect(screen.getByRole("button", { name: /OkHttp/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "拦截器如何执行？" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { name: "拦截器如何执行？" })).toBeInTheDocument();
  }

  fireEvent.change(category, { target: { value: "06-网络" } });
  expect(screen.getByRole("button", { name: /DNS/ })).toHaveAttribute("aria-expanded", "true");
  expect(screen.queryByRole("button", { name: /OkHttp/ })).not.toBeInTheDocument();
  fireEvent.change(category, { target: { value: "all" } });
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索问答" }), { target: { value: "路由" } });
  expect(screen.getByRole("status")).toHaveTextContent("2 条问答");
  expect(screen.getByRole("button", { name: /开源框架 \/ ARouter/ })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "路由如何注册？" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "拦截器如何执行？" })).toBeInTheDocument();
});

it("opens a full document beside its catalogue and keeps the catalogue open when switching articles", () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  history.replaceState(null, "", "/#view=documents");
  const documents = [
    { id: "first-note", title: "首篇文档", sourcePath: "02-Android/专题/first.md", reason: "知识库原文", markdown: "## 运行机制\n\n机制正文。" },
    { id: "second-note", title: "第二篇文档", sourcePath: "02-Android/专题/second.md", reason: "知识库原文", markdown: "## 验证方法\n\n验证正文。" },
  ];
  render(<ContentWorkspace payload={{ schema: "cards-v3", buildId: "test-library", builtAt: "2026-11-24T00:00:00Z", cards: [], documents, routes: [] }} />);
  expect(screen.getByRole("heading", { name: "首篇文档" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "运行机制" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "第二篇文档" }));
  expect(screen.getByRole("heading", { name: "验证方法" })).toBeVisible();
  expect(screen.getByRole("button", { name: "第二篇文档" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: "本文目录" })).toHaveAttribute("aria-expanded", "false");
  expect(location.hash).toContain("doc=second-note");
});
