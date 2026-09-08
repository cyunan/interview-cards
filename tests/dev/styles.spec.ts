import { expect, test } from "@playwright/test";

test("development styles load under CSP at mobile and desktop sizes", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", message => {
    if (/violates.*Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "解锁题库" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.styleSheets.length)).toBeGreaterThan(0);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(247, 248, 250)");
  await expect(page.locator(".unlock-card")).toHaveCSS("border-radius", "24px");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(violations).toEqual([]);
});
