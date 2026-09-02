// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Markdown } from "./Markdown";

afterEach(cleanup);

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
});
