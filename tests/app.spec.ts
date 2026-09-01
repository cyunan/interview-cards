import { expect, test } from "@playwright/test";

import { E2E_PASSWORD } from "./fixture-payload";

async function unlock(page: import("@playwright/test").Page): Promise<void> {
  await page.getByLabel("题库密码").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "解锁", exact: true }).click();
  await expect(page.getByRole("heading", { name: "今日复习" })).toBeVisible();
}

test("keeps plaintext locked and completes a touch-friendly study flow", async ({ page }) => {
  const failedResponses: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(response.url());
  });
  await page.goto("./");

  await expect(page.getByRole("heading", { name: "解锁题库" })).toBeVisible();
  await expect(page.getByText("熵门如何保护测试状态？")).toHaveCount(0);
  await unlock(page);
  await expect(page.getByText("熵门如何保护测试状态？")).toHaveCount(0);

  await page.getByRole("button", { name: "开始完整题库" }).click();
  await expect(page.getByRole("heading", { name: "熵门如何保护测试状态？" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("heading", { name: "30 秒回答" })).toHaveCount(0);
  await page.getByRole("button", { name: "查看回答" }).click();
  await expect(page.getByRole("heading", { name: "30 秒回答" })).toBeVisible();

  const progressiveSections = page.locator(".answer-panel details");
  await expect(progressiveSections).toHaveCount(4);
  await expect(page.locator(".answer-panel details[open]")).toHaveCount(0);
  for (const summary of await progressiveSections.locator("summary").all()) {
    await expect(summary).toHaveCSS("display", "list-item");
    const size = await summary.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(size.height).toBeGreaterThanOrEqual(44);
    expect(size.width).toBeGreaterThanOrEqual(44);
  }

  const detailSummary = page.getByText("深入理解", { exact: true });
  await detailSummary.press("Enter");
  await expect(progressiveSections.nth(0)).toHaveAttribute("open", "");
  await page.getByText("项目怎么讲", { exact: true }).click();
  await expect(page.locator(".answer-panel details[open]")).toHaveCount(2);
  await detailSummary.press(" ");
  await expect(progressiveSections.nth(0)).not.toHaveAttribute("open", "");

  await detailSummary.press("Enter");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(page.locator(".rating-dock")).toBeInViewport();
  await expect(page.getByRole("button", { name: "掌握", exact: true })).toBeEnabled();

  await expect(page.locator(".rating-dock")).toBeVisible();

  const ratingButtons = page.locator(".rating-dock button");
  for (const button of await ratingButtons.all()) {
    const size = await button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(size.height).toBeGreaterThanOrEqual(44);
    expect(size.width).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole("button", { name: "掌握", exact: true }).click();
  await expect(page.getByRole("heading", { name: "本轮完成" })).toBeVisible();
  expect(failedResponses).toEqual([]);
});

test("restarts locked and unlocks from cached ciphertext while offline", async ({
  context,
  page,
}) => {
  await page.goto("./");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await unlock(page);
  await page.getByRole("button", { name: "锁定" }).click();
  await expect(page.getByRole("heading", { name: "解锁题库" })).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.location.reload());
  await expect(page.getByRole("heading", { name: "解锁题库" })).toBeVisible();
  await unlock(page);
  await expect(page.getByRole("heading", { name: "今日复习" })).toBeVisible();
});
