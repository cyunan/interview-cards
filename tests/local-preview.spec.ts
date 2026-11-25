import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { PREVIEW_NOTE, PREVIEW_VAULT } from "./preview-fixture";

async function openRouteReference(page: import("@playwright/test").Page) {
  const trigger = page.getByRole("button", { name: /技术资料 ·/ });
  if (await trigger.isVisible()) await trigger.click();
  await page.getByRole("button", { name: /Imaginary reference/ }).last().click();
}

test("live note edits refresh real card content and invalid edits show a stale-content warning", async ({ page, request }) => {
  const filename = path.join(PREVIEW_VAULT, "02-Imaginary/note.md");
  await writeFile(filename, PREVIEW_NOTE);
  await page.goto("./");
  await expect(page.getByText("本机内容预览", { exact: true })).toBeVisible();
  const answer = page.getByRole("region", { name: "参考回答" });
  await expect(answer.getByText("Imaginary live answer version one.")).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("img", { name: "orb.png" })).toBeVisible();
  await page.getByRole("button", { name: "放大查看：orb.png" }).click();
  const imagePreview = page.getByRole("dialog", { name: "图片放大查看" });
  await expect(imagePreview.getByRole("img", { name: "orb.png" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(imagePreview).not.toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "放大查看：动态回放 · reduced motion fallback marker" })).toBeHidden();
  await expect(page.getByRole("button", { name: "放大查看：orb.png" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator(".reading-answer [data-mermaid-diagram] svg")).toBeVisible();
  await writeFile(filename, PREVIEW_NOTE.replace("version one.", "version two."));
  await expect(answer.getByText("Imaginary live answer version two.")).toBeVisible({ timeout: 10000 });
  await writeFile(filename, PREVIEW_NOTE.replace("[!summary]", "[!note]"));
  await expect(page.getByRole("alert")).toContainText("编译失败");
  await expect(answer.getByText("Imaginary live answer version two.")).toBeVisible();
  await writeFile(filename, PREVIEW_NOTE);
  await expect(answer.getByText("Imaginary live answer version one.")).toBeVisible({ timeout: 10000 });
  const denied = await request.post("__site/preview", { headers: { Origin: "https://unrelated.invalid" } });
  expect(denied.status()).toBe(403);
  const initial = await request.post("__site/preview", {headers:{Origin:"http://127.0.0.1:5186"}});
  const unchanged = await request.post("__site/preview", {headers:{Origin:"http://127.0.0.1:5186","If-None-Match":initial.headers().etag}});
  expect(unchanged.status()).toBe(304);
  const directFile = await request.get("/interview-cards/@fs" + filename);
  expect(directFile.status()).toBe(403);
  await page.getByRole("button", { name: "学习路线", exact: true }).click();
  await expect(page.getByText("Imaginary route", { exact: true })).toBeVisible();
  const catalogue = page.getByRole("region", { name: "学习路线列表" });
  await catalogue.getByRole("button", { name: /Imaginary route/ }).click();
  const stage = page.getByRole("region", { name: "Imaginary route学习阶段" });
  const question = stage.getByText("Imaginary live question?", { exact: true });
  const routeUrl = page.url();
  await expect(stage.getByText("Imaginary live answer version one.")).toBeHidden();
  await question.click();
  await expect(stage.getByText("Imaginary live answer version one.")).toBeVisible();
  await expect(page).toHaveURL(routeUrl);
  await expect(stage.getByRole("button", { name: "查看完整问答" })).toBeVisible();
  await question.click();
  await expect(stage.getByText("Imaginary live answer version one.")).toBeHidden();

});


test("preview notice leaves the reader close button accessible even when errors wrap", async ({ page }) => {
  const filename = path.join(PREVIEW_VAULT, "02-Imaginary/note.md");
  await writeFile(filename, PREVIEW_NOTE);
  await page.goto("./");
  await page.getByRole("button", { name: "学习路线", exact: true }).click();
  await page.getByRole("button", { name: /Imaginary route/ }).click();
  await openRouteReference(page);
  const reader = page.getByRole("main", { name: "Imaginary reference" });
  await expect(reader).toBeVisible();
  const chapters = reader.getByRole("button", { name: "本文目录" });
  await expect(chapters).toHaveAttribute("aria-expanded", "false");
  await expect(reader.getByRole("navigation", { name: "本文目录" })).toBeHidden();
  await chapters.click();
  await expect(reader.getByRole("navigation", { name: "本文目录" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reader).toBeVisible();
  await expect(chapters).toHaveAttribute("aria-expanded", "false");
  for (const broken of [false, true]) {
    await writeFile(filename, broken ? PREVIEW_NOTE.replace("[!summary]", "[!note]") : PREVIEW_NOTE);
    if (broken) await expect(page.getByRole("alert")).toContainText("编译失败");
    await expect.poll(async () => {
      const banner = await page.locator(".local-preview-notice").boundingBox();
      const close = await reader.getByRole("button", { name: /返回路线/ }).first().boundingBox();
      return Boolean(banner && close && close.y >= banner.y + banner.height);
    }).toBe(true);
  }
  await reader.getByRole("button", { name: /返回路线/ }).first().click();
  await expect(reader).not.toBeVisible();
  await writeFile(filename, PREVIEW_NOTE);
});

test("Escape closes the current media layer before the article", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "学习路线", exact: true }).click();
  await page.getByRole("button", { name: /Imaginary route/ }).click();
  await openRouteReference(page);
  const reader = page.getByRole("main", { name: "Imaginary reference" });

  await reader.getByRole("button", { name: "放大查看：orb.png" }).click();
  const image = page.getByRole("dialog", { name: "图片放大查看" });
  await expect(image).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(image).toBeHidden();
  await expect(reader).toBeVisible();

  await reader.getByRole("button", { name: "全屏查看图示" }).click();
  const diagram = reader.locator('[data-mermaid-fullscreen="true"]');
  await expect(diagram).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(diagram).toBeHidden();
  await expect(reader).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(reader).toBeHidden();
});

test("markdown task checkboxes stay beside their text on narrow and wide readers", async ({ page }) => {
  const filename = path.join(PREVIEW_VAULT, "02-Imaginary/note.md");
  const tasks = "\n\n#### Orbital checklist\n\n- [ ] Inspect the imaginary orbital queue and explain how each observation follows from its recorded evidence before changing the simulation.\n\n- [x] Compare the fictional sensor results.\n\n- [ ] Record the final orbital conclusion.\n";
  await writeFile(filename, PREVIEW_NOTE + tasks);
  try {
    await page.goto("./");
    await page.getByRole("button", { name: "学习路线", exact: true }).click();
    await page.getByRole("button", { name: /Imaginary route/ }).click();
    await openRouteReference(page);
    const reader = page.getByRole("main", { name: "Imaginary reference" });
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
      expect(await reader.locator(".reading-reader-grid article").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
  } finally {
    await writeFile(filename, PREVIEW_NOTE);
  }
});
