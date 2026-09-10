import { expect, test } from "@playwright/test";

import { E2E_PASSWORD } from "./fixture-payload";

test("reading layout preserves production CSP and daily navigation", async ({ page }, testInfo) => {
  await page.goto("./");
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(policy).toContain("script-src 'self'; style-src 'self';");
  expect(policy).not.toMatch(/unsafe-inline|nonce-/);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(247, 248, 250)");
  await unlock(page);
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "开始今日复习" }).click();
  await page.getByRole("button", { name: "查看回答" }).click();
  await page.screenshot({ path: testInfo.outputPath("study-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "退出本轮学习" }).click();
  await page.getByRole("button", { name: "浏览", exact: true }).click();
  await expect(page.getByRole("heading", { name: "自由浏览" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("browse-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByText("题库版本 · fictional-e2e-build")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("settings-mobile.png"), fullPage: true });
});

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

  const followupSummary = page.getByText("高频追问 · 1", { exact: true });
  await followupSummary.click();
  const followupQuestion = page.getByRole("button", { name: "相位失配时怎么办？" });
  await expect(followupQuestion).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("丢弃虚构令牌并重新进入测试轮次。")).toHaveCount(0);
  await followupQuestion.press("Enter");
  await expect(followupQuestion).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("丢弃虚构令牌并重新进入测试轮次。")).toBeVisible();
  await followupSummary.click();
  await expect(page.locator(".answer-panel details[open]")).toHaveCount(0);

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

test("refreshes directly from an unlocked session back to the lock screen", async ({ page }) => {
  await page.goto("./");
  await unlock(page);

  await page.reload();

  await expect(page.getByRole("heading", { name: "解锁题库" })).toBeVisible();
  await expect(page.getByText("熵门如何保护测试状态？")).toHaveCount(0);
});

test("keeps study content stacked on mobile and splits it on desktop", async ({ page }) => {
  await page.goto("./");
  await unlock(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "开始完整题库" }).click();
  await page.getByRole("button", { name: "查看回答" }).click();
  const mobileLayout = await page.locator(".study-layout").evaluate((element) => {
    const card = element.querySelector(".study-card")!.getBoundingClientRect();
    const answer = element.querySelector(".answer-panel")!.getBoundingClientRect();
    return { cardLeft: card.left, answerLeft: answer.left, cardWidth: card.width, answerWidth: answer.width };
  });
  expect(Math.abs(mobileLayout.cardLeft - mobileLayout.answerLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(mobileLayout.cardWidth - mobileLayout.answerWidth)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopLayout = await page.locator(".study-layout").evaluate((element) => {
    const card = element.querySelector(".study-card")!.getBoundingClientRect();
    const answer = element.querySelector(".answer-panel")!.getBoundingClientRect();
    return { cardRight: card.right, answerLeft: answer.left, columns: getComputedStyle(element).gridTemplateColumns };
  });
  expect(desktopLayout.answerLeft).toBeGreaterThan(desktopLayout.cardRight);
  expect(desktopLayout.columns.split(" ")).toHaveLength(2);
});
