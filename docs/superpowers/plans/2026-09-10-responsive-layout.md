# 面试卡片多设备响应式布局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让面试卡片 PWA 在手机、平板和桌面网页上分别采用合适的导航、内容宽度和学习布局，同时保持现有业务行为不变。

**Architecture:** 保留同一套 React DOM，使用 `768px`、`1200px` 两个 CSS 断点切换布局。手机使用底部导航，平板使用顶部导航，桌面使用左侧导航；学习页在桌面切换为题目/回答左右分栏，其他设备保持纵向阅读。

**Tech Stack:** React 19、TypeScript、Vite、CSS Media Queries、Vitest、Testing Library、Playwright。

## Global Constraints

- 使用 Node 24；不修改密码、加密、题库、进度和调度逻辑。
- 不增加第三方字体、组件库、统计或远程资源。
- 所有交互目标至少 44px；保留安全区、键盘焦点和 `prefers-reduced-motion` 支持。
- 内容变宽但正文行宽保持约 70–80 个中文字符。
- 不直接推送线上；完成后先提供本地预览和验证结果。

### Task 1: 固化响应式外壳与导航语义

**Files:**
- Modify: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- `BottomNavigation` 重命名为 `MainNavigation`，继续接收 `view` 和 `onView`。
- `Workspace` 保留现有业务 props，只增加 `app-content` 包裹层。

- [ ] **Step 1: Write the failing test**

在 `App.test.tsx` 的解锁工作区测试中断言导航具有 `main-nav`，内容具有 `app-content`，并保留三个导航按钮。

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/app/App.test.tsx`

Expected: 新增 class 断言失败，说明结构尚未提供。

- [ ] **Step 3: Write the minimal implementation**

将导航 class 改为 `main-nav`，把 notice、Dashboard、BrowseScreen、SettingsScreen 放入 `<div className="app-content">`；不改变视图切换逻辑。

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- src/app/App.test.tsx`

Expected: App 测试通过。

### Task 2: 实现手机/平板/桌面外壳与首页布局

**Files:**
- Modify: `src/app/app.css`
- Modify: `src/app/Dashboard.tsx`
- Test: `tests/dev/styles.spec.ts`

**Interfaces:**
- CSS 断点固定为 `768px`、`1200px`。
- Dashboard 增加 `deck-section` class，不改变组件数据接口。

- [ ] **Step 1: Write the failing viewport assertions**

扩展开发样式测试，覆盖 `320、390、768、1024、1280、1440` 宽度，并断言：小屏 `.main-nav` 为 fixed；平板为 static；桌面 `.app-shell` 使用两列网格。

- [ ] **Step 2: Run the focused browser test to verify it fails**

Run: `npx playwright test --config playwright.dev.config.ts tests/dev/styles.spec.ts`

Expected: 当前仍只有 `.bottom-nav`，且桌面没有侧栏网格，断言失败。

- [ ] **Step 3: Write the minimal responsive CSS and Dashboard classes**

引入页面 gutter/content max 变量；将 `.bottom-nav` 改为 `.main-nav`；在 `768px` 切换顶部横向导航，在 `1200px` 建立左侧 header + 主内容网格；为 Dashboard 增加桌面双栏区域。

- [ ] **Step 4: Run the focused browser test to verify it passes**

Run: `npx playwright test --config playwright.dev.config.ts tests/dev/styles.spec.ts`

Expected: 六个宽度均无横向溢出，导航和桌面网格断言通过。

### Task 3: 优化浏览页、设置页和内容宽度

**Files:**
- Modify: `src/app/app.css`
- Test: `tests/dev/styles.spec.ts`

- [ ] **Step 1: Write failing responsive assertions**

断言桌面筛选栏为横向网格、桌面浏览列表为两列、展开卡片跨列；平板筛选栏不产生横向溢出。

- [ ] **Step 2: Run the focused browser test to verify it fails**

Run: `npx playwright test --config playwright.dev.config.ts tests/dev/styles.spec.ts`

Expected: 当前浏览列表和筛选区仍为单列，断言失败。

- [ ] **Step 3: Implement responsive browse/settings styles**

在 `1024px` 以上启用浏览摘要双列，`.browse-card.expanded` 跨列；筛选栏在平板以上横向排列；设置卡片沿用现有两列规则并限制正文行宽。

- [ ] **Step 4: Run focused tests**

Run: `npx playwright test --config playwright.dev.config.ts tests/dev/styles.spec.ts`

Expected: 浏览、筛选、设置的尺寸断言通过。

### Task 4: 实现桌面学习页左右分栏

**Files:**
- Modify: `src/app/StudyScreen.tsx`
- Modify: `src/app/app.css`
- Test: `src/app/App.test.tsx`
- Test: `tests/app.spec.ts`

- [ ] **Step 1: Write failing structural assertions**

在 StudyScreen 测试中断言回答显示后存在 `.study-layout.is-revealed` 和独立 `.answer-panel`；在 Playwright 中验证移动端仍为单列、桌面为两列。

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm test -- src/app/App.test.tsx && npx playwright test tests/app.spec.ts --project=mobile-chrome`

Expected: 新的 layout class 和桌面布局断言失败。

- [ ] **Step 3: Implement the study layout**

将问题 article 和回答 panel 放入 `study-layout`；默认移动/平板单列；`1200px` 以上改为题目列与回答列，题目卡 sticky，评分栏继续保持可见且不遮挡内容。

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/app/App.test.tsx && npx playwright test tests/app.spec.ts --project=mobile-chrome`

Expected: 现有学习流程和移动端折叠/评分行为不变。

### Task 5: 完整验证与本地预览交付

**Files:**
- Test: `tests/dev/styles.spec.ts`
- Test: `tests/app.spec.ts`

- [ ] **Step 1: Run unit and type checks**

Run: `npm test && npm run typecheck`

Expected: 所有单测通过，类型检查退出码为 0。

- [ ] **Step 2: Run production build and E2E**

Run: `npm run build && npm run test:e2e && npx playwright test --config playwright.dev.config.ts tests/dev/styles.spec.ts`

Expected: 生产构建、移动 Chromium/WebKit E2E、六尺寸开发样式测试全部通过。

- [ ] **Step 3: Review diff and run whitespace check**

Run: `git diff --check && git status --short`

Expected: 只有响应式代码、测试和计划文档变更，不包含密文、密码或私有题库。

- [ ] **Step 4: Commit the isolated feature branch**

Run:

```bash
git add src/app/App.tsx src/app/App.test.tsx src/app/Dashboard.tsx src/app/StudyScreen.tsx src/app/app.css tests/dev/styles.spec.ts tests/app.spec.ts docs/superpowers/specs/2026-09-10-responsive-layout-design.md docs/superpowers/plans/2026-09-10-responsive-layout.md
git commit -m "feat: adapt interview cards to responsive layouts"
```

Expected: 提交只存在于 `codex/responsive-layout`，等待用户确认后再合并或发布。
