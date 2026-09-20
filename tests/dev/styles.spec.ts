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
      <aside class="app-sidebar" aria-label="应用工作区">
        <header class="app-header"></header>
        <nav class="main-nav"><button>首页</button><button>浏览</button><button>路线</button><button>设置</button></nav>
      </aside>
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
      const sidebar = getComputedStyle(element.querySelector(".app-sidebar")!);
      const nav = getComputedStyle(element.querySelector(".main-nav")!);
      const navButton = getComputedStyle(element.querySelector(".main-nav button")!);
      const filter = getComputedStyle(element.querySelector(".filter-panel")!);
      const browse = getComputedStyle(element.querySelector(".browse-list")!);
      const expanded = getComputedStyle(element.querySelector(".browse-card.expanded")!);
      const flow = getComputedStyle(element.querySelector(".study-flow")!);
      const rating = getComputedStyle(element.querySelector(".rating-dock")!);
      return {
        shellDisplay: shell.display,
        shellColumns: shell.gridTemplateColumns,
        sidebarDisplay: sidebar.display,
        sidebarWidth: sidebar.width,
        sidebarGridColumn: sidebar.gridColumn,
        navPosition: nav.position,
        navDisplay: nav.display,
        navHeight: nav.height,
        navGap: nav.rowGap,
        navButtonHeight: navButton.height,
        navButtonMinHeight: navButton.minHeight,
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
      expect(layout.shellColumns.startsWith("196px")).toBe(true);
      expect(layout.sidebarDisplay).toBe("block");
      expect(layout.sidebarWidth).toBe("196px");
      expect(layout.sidebarGridColumn).toBe("1");
      expect(layout.navPosition).toBe("absolute");
      expect(layout.navDisplay).toBe("grid");
      expect(layout.navHeight).toBe("188px");
      expect(layout.navGap).toBe("4px");
      expect(layout.navButtonHeight).toBe("44px");
      expect(layout.navButtonMinHeight).toBe("44px");
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
