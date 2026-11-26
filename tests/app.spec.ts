import { expect, test } from "@playwright/test";

import { E2E_PASSWORD } from "./fixture-payload";
import { E2E_PAYLOAD } from "./fixture-payload";
import { encryptEnvelope } from "../src/crypto/envelope";

test.describe("full-size v3 bank", () => {
  test.use({ serviceWorkers: "block" });
  test("unlocks a bank above six MiB without overflowing base64 validation", async ({ page }) => {
    const payload = {
      schema: "cards-v3", buildId: "fictional-large-v3", builtAt: "2026-01-01T00:00:00Z",
      cards: E2E_PAYLOAD.cards.map((card) => ({ ...card, legacyIds: [] })),
      documents: [{ id: "fictional-large-doc", title: "Fictional large note", sourcePath: "02-Imaginary/large.md", reason: "Fictional reference", markdown: "Fictional padding for an oversized test bank. ".repeat(130000) }],
      routes: [],
    };
    const envelope = await encryptEnvelope(payload, E2E_PASSWORD, payload.buildId);
    expect(envelope.ciphertext.length).toBeGreaterThan(6 * 1024 * 1024);
    await page.route("**/cards.enc.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(envelope) }));
    await page.goto("./");
    await page.getByLabel("题库密码").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "解锁", exact: true }).click();
    await expect(page.getByRole("heading", { name: question })).toBeVisible();
    await page.getByRole("button", { name: "技术文档", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Fictional large note", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "换一篇" }).click();
    await expect(page.getByRole("button", { name: "Fictional large note", exact: true })).toBeVisible();
  });
});

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


const question = E2E_PAYLOAD.cards[0].question;

async function unlock(
  page: import("@playwright/test").Page,
  rememberDevice = false,
): Promise<void> {
  await page.getByLabel("题库密码").fill(E2E_PASSWORD);
  if (rememberDevice) {
    await page.getByRole("checkbox", { name: "记住此设备" }).check();
  }
  await page.getByRole("button", { name: "解锁", exact: true }).click();
  await expect(page.getByRole("heading", { name: question })).toBeVisible();
}


test("keeps the reading layout usable on mobile and desktop under the production CSP", async ({ page }) => {
  await page.goto("./");
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(policy).toContain("script-src 'self'; style-src 'self';");
  expect(policy).not.toMatch(/unsafe-inline|nonce-/);
  await unlock(page);
  for (const width of [320, 390, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const navigation = (await page.getByRole("navigation", { name: "主导航" }).boundingBox())!;
    const directory = page.getByRole("navigation", { name: "问答目录" });
    const article = (await page.locator(".reading-answer").boundingBox())!;
    const context = (await page.locator(".reading-context").boundingBox())!;
    expect(navigation && article && context).toBeTruthy();
    if (width >= 700) {
      const directoryBox = (await directory.boundingBox())!;
      expect(directoryBox.y).toBeGreaterThan(navigation.y + navigation.height);
      expect(article.x).toBeGreaterThan(directoryBox.x + directoryBox.width);
      if (width === 1920) expect(context.x + context.width - directoryBox.x).toBeGreaterThan(width * 0.9);
    } else {
      await expect(directory).toBeHidden();
      await expect(page.getByRole("region", { name: "参考回答" })).toBeInViewport();
      await page.getByRole("button", { name: "换一道题" }).click();
      await expect(directory).toBeVisible();
      await page.getByRole("searchbox", { name: "搜索问答" }).fill("熵门");
      await directory.getByRole("button", { name: question, exact: true }).click();
      await expect(directory).toBeHidden();
      await expect(page.getByRole("heading", { name: question })).toBeInViewport();
    }
    if (width >= 1280) expect(context.x).toBeGreaterThan(article.x + article.width);
    else expect(context.y).toBeGreaterThan(article.y + article.height);
  }
  await expect(page.getByRole("region", { name: "参考回答" })).toBeVisible();
  await expect(page.getByRole("button", { name: "查看回答" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "掌握" })).toHaveCount(0);
});

test("keeps plaintext locked and supports direct reading after unlock", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: question })).toHaveCount(0);
  await page.getByLabel("题库密码").fill("incorrect-fixture-password");
  await page.getByRole("button", { name: "解锁", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("解锁失败");
  await unlock(page);
  await expect(page.getByRole("region", { name: "参考回答" })).toContainText("虚构量子锁");
  await page.getByRole("button", { name: "学习路线" }).click();
  await expect(page.getByRole("heading", { name: "沿路线建立理解" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: question })).toBeVisible();
  await page.getByRole("button", { name: "锁定" }).click();
  await expect(page.getByRole("heading", { name: "解锁题库" })).toBeVisible();
  await expect(page.getByRole("heading", { name: question })).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: question })).toBeVisible();
});

test("refreshes directly from an unlocked session back to the lock screen", async ({ page }) => {
  await page.goto("./");
  await unlock(page);

  await page.reload();

  await expect(page.getByRole("heading", { name: "解锁题库" })).toBeVisible();
  await expect(page.getByText("熵门如何保护测试状态？")).toHaveCount(0);
});

test("reads the encrypted résumé, follows a chapter, then reopens it offline after locking", async ({ page, context }) => {
  const previewRequests: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/__site/")) previewRequests.push(request.url());
  });
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.getByRole("heading", { name: "解锁题库" })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  const bank = await page.request.get("./cards.enc.json");
  expect(await bank.text()).not.toContain("Read the spare moonstone.");
  await unlock(page);
  await page.getByRole("button", { name: "简历", exact: true }).click();

  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("heading", { name: "Lunar beacon workshop" })).toBeVisible();
  const shell = await frame.owner().getAttribute("srcdoc");
  expect(shell).toContain("default-src 'none'");
  expect(shell).not.toContain("Lunar beacon workshop");
  expect(await frame.owner().getAttribute("sandbox")).not.toContain("allow-scripts");
  const tools = frame.locator(".sample-tools");
  await expect(tools).toHaveCSS("background-color", "rgb(239, 245, 249)");
  const prism = frame.getByRole("button", { name: "Prism", exact: true });
  const dial = frame.getByRole("button", { name: "Moon dial", exact: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const first = (await prism.boundingBox())!;
    const second = (await dial.boundingBox())!;
    expect(Math.abs(first.y - second.y)).toBeLessThan(2);
    expect(second.x).toBeGreaterThan(first.x + first.width);
  }
  await prism.click();
  await expect(page.getByRole("dialog", { name: "How does the prism glow?" })).toBeVisible();
  await page.getByRole("button", { name: "关闭面试解读" }).click();
  await dial.click();
  const panel = page.getByRole("dialog", { name: "How do crews read the moon dial?" });
  await panel.getByText("What if one notch fades?").click();
  await expect(panel.getByText("Read the spare moonstone.")).toBeVisible();
  await panel.getByRole("link", { name: /Open the field guide/ }).click();
  await expect(page.getByRole("heading", { name: "Bench notes", exact: true })).toBeVisible();
  await expect(page.getByText("A spare moonstone restores the beacon.")).toBeVisible();
  await page.getByRole("button", { name: /返回简历问答/ }).click();
  await expect(panel.getByText("Read the spare moonstone.")).toBeVisible();
  await panel.getByRole("button", { name: "关闭面试解读" }).click();
  await expect(dial).toBeFocused();

  await page.getByRole("button", { name: "锁定" }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await context.setOffline(true);
  await page.goto("./#view=resume&doc=fictional-edition&entry=dial");
  await page.evaluate(() => window.location.reload());
  await expect(page.getByRole("heading", { name: "解锁题库" })).toBeVisible();
  await page.getByLabel("题库密码").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "解锁", exact: true }).click();
  await expect(panel.getByText("Compare the two notches.")).toBeVisible();
  await expect(tools).toHaveCSS("background-color", "rgb(239, 245, 249)");
  expect(previewRequests).toEqual([]);
});

test("restores an opted-in device unlock after refresh", async ({ page }) => {
  await page.goto("./");
  await unlock(page, true);

  await page.reload();

  await expect(page.getByRole("heading", { name: question })).toBeVisible();
  await expect(page.getByRole("heading", { name: "解锁题库" })).toHaveCount(0);
});
