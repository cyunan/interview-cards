// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { Markdown } from "./Markdown";

afterEach(cleanup);

beforeAll(() => {
  if (typeof SVGElement === "undefined") return;

  const svgPrototype = SVGElement.prototype as unknown as {
    getBBox?: () => DOMRect;
  };
  if (!svgPrototype.getBBox) {
    svgPrototype.getBBox = () => ({
      x: 0,
      y: 0,
      width: 120,
      height: 36,
      top: 0,
      right: 120,
      bottom: 36,
      left: 0,
    }) as DOMRect;
  }
});

describe("Markdown", () => {
  it("does not render raw HTML, scripts, or event handlers", () => {
    const { container } = render(
      <Markdown>
        {'安全文本\n\n<div onclick="alert(1)">原始 HTML</div>\n\n<script>alert("xss")</script>\n\n<img src="x" onerror="alert(2)" />'}
      </Markdown>,
    );

    expect(screen.getByText("安全文本")).toBeInTheDocument();
    expect(screen.queryByText("原始 HTML")).not.toBeInTheDocument();
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("[onclick], [onerror]")).not.toBeInTheDocument();
  });

  it("does not keep javascript links", () => {
    const { container } = render(
      <Markdown>{"[危险链接](javascript:alert('xss'))"}</Markdown>,
    );

    const link = container.querySelector("a");
    expect(link).toBeInTheDocument();
    expect(link).not.toHaveAttribute("href", expect.stringMatching(/^javascript:/i));
    expect(link).not.toHaveAttribute("onclick");
  });

  it("renders packaged reference images from the encrypted payload", () => {
    const { container } = render(
      <Markdown images={[{ id: "abcdef0123456789", alt: "启动流程", mimeType: "image/png", data: "AAE=" }]}>
        {"![启动流程](https://interview-cards.invalid/reference-image/abcdef0123456789)"}
      </Markdown>,
    );

    expect(container.querySelector("img")).toHaveAttribute("src", "data:image/png;base64,AAE=");
    expect(container.querySelector("img")).toHaveAttribute("alt", "启动流程");
  });

  it("keeps the allowlisted document image URL for online reference diagrams", () => {
    const { container } = render(
      <Markdown>{"![启动流程](https://cdn.nlark.com/yuque/startup.svg)"}</Markdown>,
    );

    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn.nlark.com/yuque/startup.svg");
    expect(container.querySelector("img")).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("renders Mermaid fences as diagram containers instead of unreadable code blocks", () => {
    const { container } = render(
      <Markdown>{"```mermaid\nflowchart LR\n  A[开始] --> B[结束]\n```"}</Markdown>,
    );

    expect(container.querySelector("[data-mermaid-diagram]")).toBeInTheDocument();
    expect(container.querySelector("pre code.language-mermaid")).not.toBeInTheDocument();
    expect(container.querySelector("[data-mermaid-diagram]")?.closest("pre")).not.toBeInTheDocument();
  });

  it("renders valid Mermaid source as an SVG", async () => {
    const { container } = render(
      <Markdown>{"```mermaid\nflowchart LR\n  A[开始] --> B[结束]\n```"}</Markdown>,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-mermaid-diagram] svg")).toBeInTheDocument();
    });
  });

  it("provides readable controls for wide Mermaid diagrams", async () => {
    const { container } = render(
      <Markdown>
        {"```mermaid\nsequenceDiagram\n  participant A as 页面\n  participant B as 系统\n  A->>B: 发起请求\n  B-->>A: 返回结果\n```"}
      </Markdown>,
    );

    expect(await screen.findByRole("button", { name: "适应宽度" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "放大图示" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "缩小图示" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全屏查看图示" })).toBeInTheDocument();
    expect(container.querySelector("[data-mermaid-viewport]")).toBeInTheDocument();

    await waitFor(() => {
      const svg = container.querySelector("[data-mermaid-diagram] svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveStyle({ maxWidth: "none" });
      expect(svg?.getAttribute("width")).not.toBe("100%");
    });

    fireEvent.click(screen.getByRole("button", { name: "全屏查看图示" }));
    expect(container.querySelector('[data-mermaid-fullscreen="true"]')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector('[data-mermaid-fullscreen="true"]')).not.toBeInTheDocument();
  });

  it("keeps state diagram nodes and transitions readable", async () => {
    const { container } = render(
      <Markdown>
        {"```mermaid\nstateDiagram-v2\n  [*] --> Idle\n  Idle --> Started\n  Started --> [*]\n```"}
      </Markdown>,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-mermaid-diagram] svg")).toBeInTheDocument();
    });

    const state = container.querySelector<SVGRectElement>(".statediagram-state rect.basic");
    const transition = container.querySelector<SVGPathElement>("path.transition");
    expect(state).toHaveStyle({ fill: "#edf7f2", stroke: "#79ae9a" });
    expect(transition).toHaveStyle({ stroke: "#5b756b" });
    expect(transition?.style.fill).toBe("none");
  });

  it("keeps flowchart nodes, labels, and links readable", async () => {
    const { container } = render(
      <Markdown>
        {"```mermaid\nflowchart TD\n  A[提交任务 execute] --> B{线程数 < corePoolSize?}\n  B -- 是 --> C[创建核心线程执行]\n  B -- 否 --> D{队列未满?}\n  D -- 是 --> E[任务入队排队]\n```"}
      </Markdown>,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-mermaid-diagram] svg")).toBeInTheDocument();
    });

    const nodeShape = container.querySelector<SVGElement>(".node rect.label-container");
    const decisionShape = container.querySelector<SVGElement>(".node polygon.label-container");
    const label = container.querySelector<SVGElement>(".nodeLabel");
    const link = container.querySelector<SVGPathElement>(".flowchart-link");
    expect(nodeShape).toHaveStyle({ fill: "#edf7f2", stroke: "#79ae9a" });
    expect(decisionShape).toHaveStyle({ fill: "#fff8df", stroke: "#d8bc66" });
    expect(label).toHaveStyle({ color: "#263b34" });
    expect(link).toHaveStyle({ stroke: "#5b756b" });
    expect(nodeShape?.getAttribute("style")).toMatch(/fill: (?:#edf7f2|rgb\(237, 247, 242\))/i);
    expect(decisionShape?.getAttribute("style")).toMatch(/fill: (?:#fff8df|rgb\(255, 248, 223\))/i);
    expect(label?.getAttribute("style")).toMatch(/color: (?:#263b34|rgb\(38, 59, 52\))/i);
    expect(link?.getAttribute("style")).toMatch(/stroke: (?:#5b756b|rgb\(91, 117, 107\))/i);
    expect(link?.getAttribute("style")).toContain("fill: none");
  });

  it("keeps flowchart subgraph backgrounds light and labels readable", async () => {
    const { container } = render(
      <Markdown>
        {"```mermaid\nflowchart LR\n  subgraph compose [Compose 侧]\n    S[State / Snapshot] --> R[Recomposer 调度]\n  end\n  R --> A[AndroidComposeView]\n```"}
      </Markdown>,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-mermaid-diagram] svg")).toBeInTheDocument();
    });

    const cluster = container.querySelector<SVGRectElement>(".cluster rect");
    const clusterLabel = container.querySelector<SVGElement>(".cluster-label .nodeLabel");
    const svg = container.querySelector<SVGElement>("[data-mermaid-diagram] svg");
    expect(cluster).toHaveStyle({ fill: "#f4f7f5", stroke: "#b8cbc2" });
    expect(clusterLabel).toHaveStyle({ color: "#263b34", fill: "#263b34" });
    expect(svg?.style.getPropertyValue("background-color")).toBe("transparent");
  });

  it("keeps sequence self-message arrowheads readable", async () => {
    const { container } = render(
      <Markdown>
        {"```mermaid\nsequenceDiagram\n  participant Registry\n  Registry ->> Registry: sync()\n```"}
      </Markdown>,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-mermaid-diagram] svg")).toBeInTheDocument();
    });

    const arrowhead = container.querySelector<SVGPathElement>(
      'marker[id$="-arrowhead"] path',
    );
    expect(arrowhead).toBeInTheDocument();
    expect(arrowhead).toHaveStyle({ fill: "#5b756b", stroke: "#5b756b" });
    expect(arrowhead).toHaveAttribute("fill", "#5b756b");
    expect(arrowhead).toHaveAttribute("stroke", "#5b756b");
  });

  it("keeps sequence control label boxes light", async () => {
    const { container } = render(
      <Markdown>
        {"```mermaid\nsequenceDiagram\n  participant Registry\n  alt 向前同步\n    Registry ->> Registry: forwardPass\n  else 向后同步\n    Registry ->> Registry: backwardPass\n  end\n```"}
      </Markdown>,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-mermaid-diagram] svg")).toBeInTheDocument();
    });

    const labelBox = container.querySelector<SVGElement>(".labelBox");
    expect(labelBox).toBeInTheDocument();
    expect(labelBox).toHaveStyle({ fill: "#fff6c8", stroke: "#d8bc66" });
    expect(labelBox).toHaveAttribute("fill", "#fff6c8");
    expect(labelBox).toHaveAttribute("stroke", "#d8bc66");
  });
});
