// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentReading } from "./DocumentReading";

const note = { id: "edition", title: "示例简历", sourcePath: "00-个人资料/完整版/示例简历.md",
  reason: "投递", markdown: "# 示例简历\n\n## 代码对照\n\n这是文字稿。" };
const props = { document: note, questionLinks: new Map(), onOpen: vi.fn(), onOpenQuestion: vi.fn(),
  library: { breadcrumb: "简历", onChoose: vi.fn(), titleRef: { current: null } },
  resumeHtml: "<h2>原版经历</h2>" };

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value() { this.setAttribute("open", ""); } },
    close: { configurable: true, value() { this.removeAttribute("open"); } },
  });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function loadOriginal(valid = true) {
  const iframe = screen.getByTitle("完整版简历原版") as HTMLIFrameElement;
  const doc = new DOMParser().parseFromString("<html data-resume-frame><body></body></html>", "text/html");
  if (!valid) doc.documentElement.removeAttribute("data-resume-frame");
  vi.spyOn(iframe, "contentDocument", "get").mockReturnValue(doc);
  fireEvent.load(iframe);
  return doc;
}

it("leads with the isolated original, derives its contents from that edition and can switch to text", () => {
  render(<DocumentReading {...props} />);
  const iframe = screen.getByTitle("完整版简历原版");
  expect(iframe).toHaveAttribute("sandbox", "allow-same-origin allow-modals");
  expect(iframe.getAttribute("srcdoc")).toContain("data-resume-frame");
  expect(iframe.getAttribute("srcdoc")).not.toContain(props.resumeHtml);
  expect(screen.getByRole("button", { name: "打印原稿" })).toBeDisabled();
  loadOriginal();
  fireEvent.click(screen.getByRole("button", { name: "本文目录" }));
  expect(screen.getByRole("link", { name: "原版经历" })).toBeVisible();
  expect(screen.queryByText("这是文字稿。")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "文字版" }));
  expect(screen.getByText("这是文字稿。")).toBeVisible();
  expect(screen.queryByTitle("完整版简历原版")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "查看原版" }));
  expect(screen.getByTitle("完整版简历原版")).toBeVisible();
});

it("opens a Markdown-only section from an old link and still lets the reader choose the original", () => {
  render(<DocumentReading {...props} heading="代码对照" />);
  loadOriginal();
  expect(screen.getByRole("heading", { name: "代码对照" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "查看原版" }));
  loadOriginal();
  expect(screen.getByTitle("完整版简历原版")).toBeVisible();
});

it("falls back to the readable copy when the original file cannot be loaded", () => {
  render(<DocumentReading {...props} />);
  loadOriginal(false);
  expect(screen.getByRole("status")).toHaveTextContent("已显示文字版");
  expect(screen.getByText("这是文字稿。")).toBeVisible();
  expect(screen.queryByTitle("完整版简历原版")).toBeNull();
});

const annotatedResume = `
  <h2>项目经历</h2>
  <h3 data-interview-topic="delivery">跨端交付</h3>
  <span data-interview-topic="delivery">平台适配</span>
  <span data-interview-topic="outdated">其他</span>
  <template id="resume-interview-topics">
    <section data-topic="delivery">
      <h2>哪些能力放在平台端？</h2><p>共享业务契约，各端处理系统回调。</p>
      <details><summary>拒绝权限怎么办？</summary><p>保留拒绝结果，允许之后重新授权。</p></details>
      <a href="https://interview-cards.invalid/document/project-note#%E9%AA%8C%E6%94%B6">平台验收笔记</a>
      <a href="https://example.org">不受支持的目标</a>
    </section>
  </template>`;

it("opens a topic from each annotated position, exposes its actual follow-up and opens the source section", async () => {
  const onOpen = vi.fn();
  render(<DocumentReading {...props} resumeHtml={annotatedResume} onOpen={onOpen} />);
  const doc = loadOriginal();
  const button = doc.querySelector<HTMLElement>('span[data-interview-topic="delivery"] summary');
  expect(button).toBeTruthy();
  expect(doc.querySelector('[data-interview-topic="outdated"] summary')).toBeNull();
  fireEvent(button!, new MouseEvent("click", { bubbles: true }));
  expect(await screen.findByRole("dialog", { name: "哪些能力放在平台端？" })).toBeVisible();
  expect(screen.getByText("共享业务契约，各端处理系统回调。")).toBeVisible();
  fireEvent.click(screen.getByText("拒绝权限怎么办？"));
  expect(screen.getByText("保留拒绝结果，允许之后重新授权。")).toBeVisible();
  expect(screen.queryByRole("link", { name: "不受支持的目标" })).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "平台验收笔记" }));
  expect(onOpen).toHaveBeenCalledWith("project-note", "验收");
});

it("opens a linked topic only after the edition loads and remembers the precise duplicate trigger", async () => {
  const onInterviewEntryChange = vi.fn();
  const page = render(<DocumentReading {...props} resumeHtml={annotatedResume} interviewEntry="delivery~1" onInterviewEntryChange={onInterviewEntryChange} />);
  const doc = loadOriginal();
  expect(await screen.findByRole("dialog", { name: "哪些能力放在平台端？" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "关闭面试解读" }));
  expect(onInterviewEntryChange).toHaveBeenCalledWith(undefined);
  page.rerender(<DocumentReading {...props} resumeHtml={annotatedResume} onInterviewEntryChange={onInterviewEntryChange} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent(doc.querySelectorAll('[data-interview-topic="delivery"] summary')[1], new MouseEvent('click', { bubbles: true }));
  await waitFor(() => expect(onInterviewEntryChange).toHaveBeenLastCalledWith("delivery~1"));
});
