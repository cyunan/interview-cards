# 大屏路线学习工作台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 将路线详情页在桌面端改造成左侧路线导航、中央学习内容、右侧上下文资料的三栏工作台，同时保持手机和平板的现有学习体验。

**Architecture:** `Workspace` 增加桌面侧栏容器，主导航仍由 `MainNavigation` 单一组件提供；`RouteDetail` 继续持有阶段滚动状态，并在桌面端把同一组阶段链接视觉上放入左侧索引，右侧资料栏增加当前阶段上下文。所有断点差异由 `app.css` 控制，题库、进度和解锁数据流不变。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Testing Library、Playwright、现有 CSS 媒体查询。

## Global Constraints

- 手机（宽度小于 768px）继续使用底部主导航、移动阶段目录和技术资料抽屉。
- 平板（768px 至 1199px）继续使用顶部横向主导航与单列路线内容。
- 桌面（至少 1200px）使用约 248px 左侧工作区、中央可伸缩内容和 320～360px 右侧上下文栏。
- 中央正文每行控制在约 76ch，不通过无限拉宽文本填充大屏。
- 阶段索引必须数据驱动，不能写死阶段数量；现有 `aria-current`、hash 定位和键盘焦点行为保持有效。
- 不修改题库内容、学习进度模型、解锁流程或公开密文。
- 本地布局预览文件在正式构建前删除，不进入公开产物。

---

### Task 1: 为桌面侧栏和右侧阶段上下文补充失败测试

**Files:**
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/RouteScreen.test.tsx`
- Modify: `tests/dev/styles.spec.ts`
- Modify: `tests/app.spec.ts`

**Interfaces:**
- Consumes: 现有 `App`、`RouteScreen` 和测试 fixture。
- Produces: 对 `.app-sidebar`、桌面阶段索引、`.route-context-sidebar` 和窄屏回退的可执行验收。

- [ ] **Step 1: Write the failing component tests**

在 `App.test.tsx` 的“migrates progress”测试中，把导航结构断言改为导航位于 `.app-sidebar` 内，并保留四个按钮：

```tsx
const sidebar = screen.getByRole("complementary", { name: "应用工作区" });
expect(sidebar).toContainElement(screen.getByRole("navigation", { name: "主导航" }));
expect(sidebar.querySelectorAll(".main-nav button")).toHaveLength(4);
expect(screen.getByTestId("app-content")).toHaveClass("app-content");
```

在 `RouteScreen.test.tsx` 增加无资料和有资料两个断言：

```tsx
it("keeps a useful context sidebar when the current stage has no documents", () => {
  render(<RouteScreen cards={cards} progress={new Map()} selectedRouteId={route.id} onSelectRoute={vi.fn()} onPractice={vi.fn()} />);
  const context = screen.getByRole("complementary", { name: "路线阶段上下文" });
  expect(context).toHaveTextContent("当前阶段");
  expect(context).toHaveTextContent("阶段 2");
  expect(context).toHaveTextContent("当前阶段没有附带技术资料");
});

it("exposes the stage index as a desktop route rail", () => {
  render(<RouteScreen cards={cards} progress={new Map()} selectedRouteId={route.id} onSelectRoute={vi.fn()} onPractice={vi.fn()} />);
  expect(screen.getByRole("navigation", { name: "桌面路线阶段" })).toBeInTheDocument();
});
```

在 `tests/app.spec.ts` 增加路线页面结构断言：

```ts
await expect(page.getByRole("complementary", { name: "应用工作区" })).toBeVisible();
await expect(page.getByRole("navigation", { name: "桌面路线阶段" })).toBeVisible();
await expect(page.getByRole("complementary", { name: "路线阶段上下文" })).toBeVisible();
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- src/app/App.test.tsx src/app/RouteScreen.test.tsx`

Expected: FAIL because the application has no `.app-sidebar`, desktop route rail, or context sidebar yet.

- [ ] **Step 3: Add the CSS probe expectations**

在 `tests/dev/styles.spec.ts` 的布局探针中加入 `.app-sidebar`，并在 1200px 断点断言 `grid-template-columns` 为两列；在小于 1200px 时断言侧栏不产生横向滚动。先运行该测试确认新断言失败。

- [ ] **Step 4: Commit the failing tests**

```bash
git add src/app/App.test.tsx src/app/RouteScreen.test.tsx tests/dev/styles.spec.ts tests/app.spec.ts
git commit -m "test: define desktop route workspace behavior"
```

### Task 2: 将应用导航组织为桌面侧栏

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: 现有 `AppHeader`、`MainNavigation`、`Workspace` 的 props 和 view 状态。
- Produces: `<aside className="app-sidebar" aria-label="应用工作区">`，内部继续复用唯一的 `AppHeader` 和 `MainNavigation`；内容节点增加 `data-testid="app-content"`。

- [ ] **Step 1: Wrap the existing header and navigation**

在 `Workspace` 返回值中将：

```tsx
<AppHeader onLock={onLock} />
<MainNavigation view={view} onView={setView} />
<div className="app-content">
```

改为：

```tsx
<aside className="app-sidebar" aria-label="应用工作区">
  <AppHeader onLock={onLock} />
  <MainNavigation view={view} onView={setView} />
</aside>
<div className="app-content" data-testid="app-content">
```

- [ ] **Step 2: Implement the desktop sidebar CSS**

保留现有小屏 `.main-nav` 规则；在 `@media (min-width: 1200px)` 中新增：

```css
.app-shell { grid-template-columns: 248px minmax(0, 1fr); grid-template-rows: 1fr; }
.app-sidebar { position: sticky; top: 0; grid-column: 1; grid-row: 1; min-width: 0; height: 100dvh; border-right: 1px solid var(--line); background: white; }
.app-header { height: 100%; min-height: 100dvh; flex-direction: column; align-items: stretch; padding: 32px 24px; border: 0; }
.app-header .lock-button { width: 100%; margin-top: auto; }
.app-sidebar .main-nav { position: absolute; top: 112px; left: 24px; right: 24px; width: auto; max-width: none; margin: 0; display: grid; grid-template-columns: 1fr; gap: 6px; border: 0; border-radius: 0; padding: 0; background: transparent; box-shadow: none; }
.app-sidebar .main-nav button { width: 100%; justify-content: flex-start; flex: none; min-height: 48px; padding: 10px 12px; }
.app-content { grid-column: 2; grid-row: 1; min-width: 0; }
```

在 `@media (max-width: 1199px)` 中把 `.app-sidebar` 设为 `display: contents`，保证 header、主导航和内容仍按原来的窄屏文档流排列。

- [ ] **Step 3: Run component and style tests**

Run: `npm test -- src/app/App.test.tsx`

Expected: PASS, including the sidebar containment assertion.

Run: `npx playwright test tests/dev/styles.spec.ts --project=chromium`

Expected: PASS at 320、390、768、1024、1280、1440px and no horizontal overflow.

### Task 3: 将阶段导航放入桌面左侧并增加上下文资料栏

**Files:**
- Modify: `src/app/RouteScreen.tsx`
- Modify: `src/app/RouteScreen.test.tsx`
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: `currentIndex`、`route.steps`、`cards`、`progress`、`activeReferences`、`stageLinks`。
- Produces: `.route-desktop-stage-rail`（桌面阶段索引）和 `.route-context-sidebar`（始终有内容的右栏），移动端继续复用现有 `route-mobile-directory` 与资料抽屉。

- [ ] **Step 1: Derive current-stage context**

在 `RouteDetail` 中 `activeReferences` 之后增加：

```tsx
const activeStep = route.steps[currentIndex];
const activeStepCards = resolveRouteCards(activeStep, cards);
const activeStepReviewed = activeStepCards.filter((card) => (progress.get(card.id)?.reviewCount ?? 0) > 0).length;
```

- [ ] **Step 2: Add the desktop stage rail**

复用 `stageLinks()` 生成链接，额外渲染：

```tsx
<nav className="route-desktop-stage-rail" aria-label="桌面路线阶段">
  <p className="eyebrow">当前路线</p>
  <strong>{route.title}</strong>
  <div className="route-desktop-stage-links">{stageLinks()}</div>
</nav>
```

把它放在 `route-detail-screen` 内、`route-learning-layout` 之前；桌面显示，1200px 以下隐藏。原有 `.route-stage-nav` 保留给平板和移动端，避免改变窄屏目录行为。

- [ ] **Step 3: Add the context sidebar component**

新增 `RouteContextPanel`：

```tsx
function RouteContextPanel({
  route,
  step,
  stepIndex,
  reviewed,
  total,
  references,
}: {
  route: KnowledgeRoute;
  step: KnowledgeRoute["steps"][number];
  stepIndex: number;
  reviewed: number;
  total: number;
  references: ResolvedRouteDocument[];
}) {
  return (
    <aside className="route-context-sidebar" aria-label="路线阶段上下文">
      <p className="eyebrow">当前阶段</p>
      <h2>{String(stepIndex + 1).padStart(2, "0")} · {step.shortTitle ?? step.title}</h2>
      <p className="route-context-purpose">{step.purpose}</p>
      <div className="route-context-progress"><strong>{reviewed}/{total}</strong><span>张卡片已练过</span></div>
      {references.length > 0 ? <RouteReferencePanel references={references} /> : <p className="route-reference-empty">当前阶段没有附带技术资料，先沿阶段卡片建立主线。</p>}
      {stepIndex < route.steps.length - 1 ? <p className="route-context-next">下一阶段：{route.steps[stepIndex + 1].shortTitle ?? route.steps[stepIndex + 1].title}</p> : null}
    </aside>
  );
}
```

`RouteDetail` 桌面端无条件渲染这个面板；移动端通过 CSS 隐藏它，并保留现有浮动技术资料入口。为避免嵌套两个 `aside`，`RouteReferencePanel` 增加 `embedded` 参数：嵌入上下文栏时使用 `div.route-reference-embedded`，只复用标题、折叠资料列表和复制路径逻辑，不再声明第二个 `complementary` 角色。

- [ ] **Step 4: Make the existing reference panel embeddable**

给 `RouteReferencePanel` 增加 `embedded?: boolean`。`embedded` 为 `true` 时返回 `<div className="route-reference-embedded">`，复用 `RouteReferenceList` 和复制路径回调；默认行为仍返回现有的 `<aside aria-label="阶段技术资料">`，保证移动抽屉和原有测试不变。嵌入版本不重复显示完整说明，只保留“技术资料 · N”标题和折叠内容。

- [ ] **Step 5: Style the desktop rail and context panel**

在 `@media (min-width: 1200px)` 中：

```css
.route-desktop-stage-rail { position: fixed; z-index: 20; top: 176px; left: 24px; width: 200px; }
.route-desktop-stage-rail > strong { display: block; margin: -3px 0 14px; font-size: 14px; line-height: 1.45; }
.route-desktop-stage-links { display: grid; gap: 4px; }
.route-desktop-stage-links a { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 7px 8px; border-radius: 9px; color: var(--muted); font-size: 11px; line-height: 1.35; text-decoration: none; }
.route-desktop-stage-links a .route-stage-number { width: 26px; height: 26px; }
.route-desktop-stage-links a[aria-current="step"] { color: var(--forest); background: #e9f3ee; font-weight: 700; }
.route-navigation-dock { display: none; }
.route-learning-layout { grid-template-columns: minmax(0, 1fr) 340px; gap: 28px; }
.route-detail-screen { width: min(calc(100% - 80px), 1640px); max-width: none; }
.route-flow-column { max-width: 1120px; }
.route-context-sidebar { position: sticky; top: 24px; align-self: start; max-height: calc(100dvh - 48px); overflow: hidden auto; padding: 20px; border: 1px solid var(--line); border-radius: 18px; background: white; box-shadow: 0 10px 28px #25312f0b; }
```

`@media (max-width: 1199px)` 隐藏 `.route-desktop-stage-rail` 和 `.route-context-sidebar`，并恢复 `.route-navigation-dock { display: block; }`，保持现有 `.route-reference-sidebar` 的移动/平板行为。

- [ ] **Step 6: Run focused route tests**

Run: `npm test -- src/app/RouteScreen.test.tsx`

Expected: PASS, including stage rail count, no-reference context fallback, and existing mobile reference drawer assertions.

### Task 4: 调整响应式样式并补充桌面 E2E 验收

**Files:**
- Modify: `src/app/app.css`
- Modify: `tests/app.spec.ts`
- Modify: `tests/dev/styles.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `.app-sidebar` 和 Task 3 的阶段/上下文类名。
- Produces: 1280、1440、1920、2560px 不横向溢出，手机和平板仍走旧布局的可执行验收。

- [ ] **Step 1: Add desktop E2E checks**

在路线 E2E 中进入第一条路线后，追加：

```ts
await page.setViewportSize({ width: 1440, height: 900 });
await expect(page.getByRole("navigation", { name: "桌面路线阶段" })).toBeVisible();
await expect(page.getByRole("complementary", { name: "路线阶段上下文" })).toBeVisible();
expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
await page.getByRole("navigation", { name: "桌面路线阶段" }).getByRole("link").nth(3).click();
await expect(page.locator("#route-frame-clock")).toBeFocused();
await expect(page.getByRole("navigation", { name: "桌面路线阶段" }).getByRole("link").nth(3)).toHaveAttribute("aria-current", "step");
```

再切换到 `1024px`，断言桌面阶段栏和常驻上下文栏隐藏，手机目录入口仍存在。

- [ ] **Step 2: Run all browser layout checks**

Run: `npx playwright test tests/dev/styles.spec.ts tests/app.spec.ts --project=chromium`

Expected: PASS, including no horizontal overflow and preserved mobile route directory behavior.

- [ ] **Step 3: Inspect visual output at four desktop widths**

Run: `npm run dev -- --host 127.0.0.1 --port 5176` and open the route page at 1280、1440、1920、2560px. Confirm the left rail is populated, central text does not stretch beyond the reading width, and the right panel remains readable.

### Task 5: 删除临时预览并执行完整验证

**Files:**
- Delete: `public/layout-previews.html`
- Modify: no production files unless verification exposes a regression.

**Interfaces:**
- Consumes: 完成的桌面工作台实现和全部测试。
- Produces: 不向 Vite 生产构建暴露方案对比页的干净工作树状态。

- [ ] **Step 1: Remove the local-only preview**

使用 `apply_patch` 删除 `public/layout-previews.html`，因为正式页面已经采用方案 A，公开站点不需要暴露设计实验页。

- [ ] **Step 2: Run unit tests, typecheck, production build and leak scan**

Run: `npm run verify`

Expected: all Vitest tests pass, TypeScript emits no errors, Vite produces `dist`, and public leak scan passes.

- [ ] **Step 3: Run mobile and desktop E2E**

Run: `npm run test:e2e`

Expected: Chromium/WebKit mobile and desktop route checks pass with no failed network responses.

- [ ] **Step 4: Review the final diff without touching unrelated work**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; existing unrelated user changes remain intact; only the planned layout files, tests, spec/plan documents and preview deletion are attributable to this task.
