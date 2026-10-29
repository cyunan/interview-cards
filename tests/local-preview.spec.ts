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
