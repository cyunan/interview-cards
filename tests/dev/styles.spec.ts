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
  await page.evaluate(() => {
    const shell = document.createElement("div");
    shell.className = "app-shell layout-probe";
    shell.innerHTML = `
      <nav class="main-nav"><button>首页</button></nav>
      <div class="app-content">
        <section class="filter-panel">
          <input aria-label="关键词" />
          <div class="select-grid"><select><option>全部</option></select></div>
        </section>
        <section class="browse-list">
          <article class="browse-card"></article>
          <article class="browse-card expanded"></article>
        </section>
        <div class="study-flow">
          <article class="study-card"></article>
          <section class="answer-panel"></section>
          <footer class="rating-dock"><div><button>不会</button><button>模糊</button><button>掌握</button></div></footer>
        </div>
      </div>`;
    document.body.append(shell);
  });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const width of [320, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator(".layout-probe").evaluate((element) => {
      const shell = getComputedStyle(element);
      const nav = getComputedStyle(element.querySelector(".main-nav")!);
      const filter = getComputedStyle(element.querySelector(".filter-panel")!);
      const browse = getComputedStyle(element.querySelector(".browse-list")!);
      const expanded = getComputedStyle(element.querySelector(".browse-card.expanded")!);
      const flow = getComputedStyle(element.querySelector(".study-flow")!);
      const rating = getComputedStyle(element.querySelector(".rating-dock")!);
      return {
        shellDisplay: shell.display,
        navPosition: nav.position,
        navDisplay: nav.display,
        filterDisplay: filter.display,
        browseColumns: browse.gridTemplateColumns,
        expandedColumn: expanded.gridColumn,
        flowColumns: flow.gridTemplateColumns,
        ratingPosition: rating.position,
        ratingWidth: rating.width,
      };
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 768) {
      expect(layout.navPosition).toBe("fixed");
    } else if (width < 1200) {
      expect(layout.shellDisplay).not.toBe("grid");
      expect(layout.navPosition).toBe("static");
      expect(layout.filterDisplay).toBe("grid");
    } else {
      expect(layout.shellDisplay).toBe("grid");
      expect(layout.navPosition).toBe("static");
      expect(layout.navDisplay).toBe("flex");
      expect(layout.filterDisplay).toBe("grid");
      expect(layout.browseColumns.split(" ")).toHaveLength(2);
      expect(layout.expandedColumn).toContain("1 / -1");
    }
    expect(layout.flowColumns.split(" ")).toHaveLength(1);
    if (width < 768) {
      expect(layout.ratingPosition).toBe("fixed");
    } else {
      expect(layout.ratingPosition).toBe("sticky");
    }
  }
  expect(violations).toEqual([]);
});
