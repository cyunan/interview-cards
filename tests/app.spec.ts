import { expect, test } from "@playwright/test";

import { E2E_PASSWORD } from "./fixture-payload";

test("keeps reference code readable against its dark code surface", async ({ page }) => {
  await page.goto("./");

  const colors = await page.evaluate(() => {
    const referenceBody = document.createElement("div");
    referenceBody.className = "route-reference-item-body";
    referenceBody.innerHTML = '<div class="markdown"><pre><code>fun enqueueMessage() {}</code></pre></div>';
    document.body.append(referenceBody);

    const pre = referenceBody.querySelector("pre")!;
    const code = referenceBody.querySelector("code")!;
    return {
      preBackground: getComputedStyle(pre).backgroundColor,
      codeColor: getComputedStyle(code).color,
    };
  });

  expect(colors.preBackground).toBe("rgb(38, 52, 49)");
  expect(colors.codeColor).toBe("rgb(240, 246, 243)");
});

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

test("organizes existing cards into knowledge routes without exposing answers before practice", async ({ page }) => {
  await page.goto("./");
  await unlock(page);
  await page.getByRole("button", { name: "路线", exact: true }).click();

  await expect(page.getByRole("heading", { name: "沿路线建立理解" })).toBeVisible();
  await expect(page.locator(".route-card")).toHaveCount(6);
  await expect(page.getByText("一条路线 = 一条可口述的因果链")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.locator(".route-card").first().click();
  await expect(page.getByRole("heading", { name: "Android 页面是怎样跑起来的？" })).toBeVisible();
  await expect(page.locator(".route-step")).toHaveCount(7);
  await expect(page.locator(".route-stage-nav a")).toHaveCount(7);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("navigation", { name: "桌面路线阶段" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "路线阶段上下文" })).toBeVisible();
  const desktopStageRail = await page.getByRole("navigation", { name: "桌面路线阶段" }).boundingBox();
  const routeFlowColumn = await page.locator(".route-flow-column").boundingBox();
  expect(desktopStageRail?.x).toBeGreaterThanOrEqual(196);
  const desktopStageRailRight = desktopStageRail ? desktopStageRail.x + desktopStageRail.width : undefined;
  expect(desktopStageRailRight).toBeLessThanOrEqual((routeFlowColumn?.x ?? 0) - 16);
  const stickyPanelStyles = await page.locator(".route-desktop-stage-rail, .route-context-sidebar").evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return { top: Number.parseFloat(style.top), zIndex: Number.parseInt(style.zIndex, 10) };
    }),
  );
  expect(stickyPanelStyles).toHaveLength(2);
  for (const panel of stickyPanelStyles) {
    expect(panel.top).toBe(72);
    expect(panel.zIndex).toBeLessThan(40);
  }
  const routeOverviewBar = page.locator(".route-back-bar");
  const routeOverviewPosition = await routeOverviewBar.evaluate((element) => {
    const style = getComputedStyle(element);
    return { position: style.position, top: Number.parseFloat(style.top), background: style.backgroundColor };
  });
  expect(routeOverviewPosition.position).toBe("sticky");
  expect(routeOverviewPosition.background).not.toBe("rgba(0, 0, 0, 0)");
  const routeDetailScreen = await page.locator(".route-detail-screen").boundingBox();
  const routeOverviewBeforeScroll = await routeOverviewBar.boundingBox();
  expect(routeOverviewBeforeScroll?.width).toBeGreaterThan((routeDetailScreen?.width ?? 0) * 0.9);
  const sidebarBeforeScroll = await page.locator(".app-sidebar").boundingBox();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const routeOverviewAfterScroll = await routeOverviewBar.boundingBox();
  expect(routeOverviewAfterScroll?.y).toBeGreaterThanOrEqual(routeOverviewPosition.top - 1);
  const sidebarAfterScroll = await page.locator(".app-sidebar").boundingBox();
  expect(Math.abs(sidebarBeforeScroll?.y ?? 0)).toBeLessThanOrEqual(1);
  expect(Math.abs(sidebarAfterScroll?.y ?? 0)).toBeLessThanOrEqual(1);
  expect(sidebarAfterScroll?.height).toBeGreaterThanOrEqual(900);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("navigation", { name: "桌面路线阶段" }).getByRole("link").nth(3).click();
  await expect(page.locator("#route-frame-clock")).toBeFocused();
  await expect(page.getByRole("navigation", { name: "桌面路线阶段" }).getByRole("link").nth(3)).toHaveAttribute("aria-current", "step");
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.getByRole("navigation", { name: "桌面路线阶段" })).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".route-learning-guide")).not.toHaveAttribute("open", "");
  await page.locator(".route-mobile-directory > summary").click();
  await expect(page.getByRole("navigation", { name: "手机学习阶段目录" }).getByRole("link")).toHaveCount(7);
  await page.locator(".route-mobile-directory a").nth(2).click();
  await expect(page.locator(".route-mobile-directory")).not.toHaveAttribute("open", "");
  await expect(page.locator("#route-ui-owner")).toBeFocused();
  await expect(page.locator(".route-mobile-directory a").nth(2)).toHaveAttribute("aria-current", "step");
  await page.locator("#route-frame-clock").evaluate((element) => element.scrollIntoView());
  await expect(page.locator(".route-mobile-directory a").nth(3)).toHaveAttribute("aria-current", "step");
  const dock = await page.locator(".route-navigation-dock").boundingBox();
  const stage = await page.locator("#route-frame-clock").boundingBox();
  expect(dock!.y).toBeLessThanOrEqual(2);
  expect(stage!.y).toBeGreaterThanOrEqual(dock!.y + dock!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "练习本阶段" })).toBeDisabled();
  await expect(page.getByText("当前密文版本暂未包含本阶段卡片，更新题库后会自动出现。").first()).toBeVisible();
});

test("uses browser history for route overview and route detail", async ({ page }) => {
  await page.goto("./");
  await unlock(page);

  await page.getByRole("button", { name: "路线", exact: true }).click();
  await expect(page.getByRole("heading", { name: "沿路线建立理解" })).toBeVisible();
  await page.locator(".route-card").first().click();
  await expect(page.getByRole("heading", { name: "Android 页面是怎样跑起来的？" })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "沿路线建立理解" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "今日复习" })).toBeVisible();
});

async function unlock(
  page: import("@playwright/test").Page,
  rememberDevice = false,
): Promise<void> {
  await page.getByLabel("题库密码").fill(E2E_PASSWORD);
  if (rememberDevice) {
    await page.getByRole("checkbox", { name: "记住此设备" }).check();
  }
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
  await expect(page.locator(".answer-panel [data-mermaid-diagram] svg")).toBeVisible();
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

test("restores an opted-in device unlock after refresh", async ({ page }) => {
  await page.goto("./");
  await unlock(page, true);

  await page.reload();

  await expect(page.getByRole("heading", { name: "今日复习" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "解锁题库" })).toHaveCount(0);
});

test("keeps study content in one focus flow on every viewport", async ({ page }) => {
  await page.goto("./");
  await unlock(page);

  await page.getByRole("button", { name: "开始完整题库" }).click();
  await page.getByRole("button", { name: "查看回答" }).click();

  for (const width of [390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator(".study-flow").evaluate((element) => {
      const flow = element.getBoundingClientRect();
      const question = element.querySelector(".study-card")!.getBoundingClientRect();
      const answer = element.querySelector(".answer-panel")!.getBoundingClientRect();
      const rating = element.querySelector(".rating-dock")!.getBoundingClientRect();
      return {
        flowLeft: flow.left,
        flowWidth: flow.width,
        questionLeft: question.left,
        answerLeft: answer.left,
        questionBottom: question.bottom,
        answerTop: answer.top,
        ratingWidth: rating.width,
      };
    });

    expect(Math.abs(layout.questionLeft - layout.answerLeft)).toBeLessThanOrEqual(1);
    expect(layout.answerTop).toBeGreaterThanOrEqual(layout.questionBottom - 1);
    if (width >= 768) {
      expect(layout.ratingWidth).toBeLessThan(width * 0.95);
    }
    expect(layout.flowWidth).toBeLessThan(width);
  }

  const ratingRect = await page.locator(".rating-dock").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, width: rect.width };
  });
  expect(ratingRect.left).toBeGreaterThan(0);
  expect(ratingRect.width).toBeLessThan(1440);
});
