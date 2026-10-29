import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { PREVIEW_NOTE, PREVIEW_VAULT } from "./preview-fixture";
test("live note edits refresh real card content and invalid edits show a stale-content warning", async ({ page, request }) => {
  const filename = path.join(PREVIEW_VAULT, "02-Imaginary/note.md");
  await writeFile(filename, PREVIEW_NOTE);
  await page.goto("./");
  await expect(page.getByText("本机内容预览", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "浏览", exact: true }).click();
  await page.getByRole("button", { name: /Imaginary live question/ }).click();
  await expect(page.getByText("Imaginary live answer version one.")).toBeVisible();
  await page.getByText("深入理解", { exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("img", { name: "orb.png" })).toBeVisible();
  await expect(page.locator("[data-mermaid-diagram] svg")).toBeVisible();
  await writeFile(filename, PREVIEW_NOTE.replace("version one.", "version two."));
  await expect(page.getByText("Imaginary live answer version two.")).toBeVisible({ timeout: 10000 });
  await writeFile(filename, PREVIEW_NOTE.replace("[!summary]", "[!note]"));
  await expect(page.getByRole("alert")).toContainText("编译失败");
  await expect(page.getByText("Imaginary live answer version two.")).toBeVisible();
  await writeFile(filename, PREVIEW_NOTE);
  await expect(page.getByText("Imaginary live answer version one.")).toBeVisible({ timeout: 10000 });
  const denied = await request.post("__site/preview", { headers: { Origin: "https://unrelated.invalid" } });
  expect(denied.status()).toBe(403);
  const initial = await request.post("__site/preview", {headers:{Origin:"http://127.0.0.1:5186"}});
  const unchanged = await request.post("__site/preview", {headers:{Origin:"http://127.0.0.1:5186","If-None-Match":initial.headers().etag}});
  expect(unchanged.status()).toBe(304);
  const directFile = await request.get("/interview-cards/@fs" + filename);
  expect(directFile.status()).toBe(403);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name))).toContain("interview-cards-preview-progress");
  await page.getByRole("button", { name: "路线", exact: true }).click();
  await expect(page.getByText("Imaginary route", { exact: true })).toBeVisible();
});


test("preview notice leaves the reader close button accessible even when errors wrap", async ({ page }) => {
  const filename = path.join(PREVIEW_VAULT, "02-Imaginary/note.md");
  await writeFile(filename, PREVIEW_NOTE);
  await page.goto("./");
  await page.getByRole("button", { name: "路线", exact: true }).click();
  await page.getByRole("button", { name: /Imaginary route/ }).click();
  await page.getByRole("button", { name: "技术资料 · 1" }).click();
  await page.getByRole("button", { name: /Imaginary reference/ }).last().click();
  const reader = page.getByRole("dialog", { name: "技术资料阅读" });
  await expect(reader).toBeVisible();
  for (const broken of [false, true]) {
    await writeFile(filename, broken ? PREVIEW_NOTE.replace("[!summary]", "[!note]") : PREVIEW_NOTE);
    if (broken) await expect(page.getByRole("alert")).toContainText("编译失败");
    await expect.poll(async () => {
      const banner = await page.locator(".local-preview-notice").boundingBox();
      const close = await page.getByRole("button", { name: "关闭阅读层" }).boundingBox();
      return Boolean(banner && close && close.y >= banner.y + banner.height);
    }).toBe(true);
  }
  await page.getByRole("button", { name: "关闭阅读层" }).click();
  await expect(reader).not.toBeVisible();
  await writeFile(filename, PREVIEW_NOTE);
});

test("markdown task checkboxes stay beside their text on narrow and wide readers", async ({ page }) => {
  const filename = path.join(PREVIEW_VAULT, "02-Imaginary/note.md");
  const tasks = "\n\n#### Orbital checklist\n\n- [ ] Inspect the imaginary orbital queue and explain how each observation follows from its recorded evidence before changing the simulation.\n\n- [x] Compare the fictional sensor results.\n\n- [ ] Record the final orbital conclusion.\n";
  await writeFile(filename, PREVIEW_NOTE + tasks);
  try {
    await page.goto("./");
    await page.getByRole("button", { name: "路线", exact: true }).click();
    await page.getByRole("button", { name: /Imaginary route/ }).click();
    await page.getByRole("button", { name: "技术资料 · 1" }).click();
    await page.getByRole("button", { name: /Imaginary reference/ }).last().click();
    const reader = page.getByRole("dialog", { name: "技术资料阅读" });
    await expect(reader).toBeVisible();
    const checkboxes = reader.getByRole("checkbox");
    await expect(checkboxes).toHaveCount(3);
    await expect(checkboxes.nth(0)).toBeDisabled();
    await expect(checkboxes.nth(1)).toBeChecked();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const metrics = await reader.locator(".task-list-item").evaluateAll(items => items.map(item => {
        const input = item.querySelector("input")!;
        const box = input.getBoundingClientRect();
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node && !node.textContent?.trim()) node = walker.nextNode();
        const range = document.createRange();
        range.setStart(node!, node!.textContent!.search(/\S/));
        range.setEnd(node!, node!.textContent!.search(/\S/) + 1);
        const text = range.getBoundingClientRect();
        return { width: box.width, height: box.height, gap: text.left - box.right,
          lineOffset: Math.abs(box.top - text.top), marker: getComputedStyle(item).listStyleType };
      }));
      for (const item of metrics) {
        expect(item.width).toBeGreaterThanOrEqual(12);
        expect(item.width).toBeLessThanOrEqual(20);
        expect(item.height).toBeLessThanOrEqual(20);
        expect(item.gap).toBeGreaterThanOrEqual(4);
        expect(item.lineOffset).toBeLessThan(8);
        expect(item.marker).toBe("none");
      }
      expect(await reader.locator(".route-reference-reader-content").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
  } finally {
    await writeFile(filename, PREVIEW_NOTE);
  }
});
