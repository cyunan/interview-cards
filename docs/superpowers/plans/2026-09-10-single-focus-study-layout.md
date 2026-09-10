# 单焦点纵向学习页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将学习页从宽屏左右双栏改为手机、平板、电脑一致的单焦点纵向学习流，消除题目、答案和评分之间的空间断裂。

**Architecture:** `StudyScreen` 继续负责队列、翻面、评分和错误状态，只把题目、回答、评分收进同一个 `study-flow` 容器。`ProgressiveAnswer` 不改数据和解析，只维持 30 秒回答常显、详细内容折叠。CSS 负责按设备调整宽度与评分呈现：手机固定底部，平板和桌面回到内容流，桌面可局部 sticky。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Testing Library、Playwright、原生 CSS 媒体查询。

## Global Constraints

- 不改变卡片字段、题库数量、密码、AES 解密、IndexedDB 进度和 Leitner 排期。
- `30 秒回答`始终显示；`深入理解`、`项目怎么讲`、`易错点`、`高频追问`默认收起。
- 所有设备使用单列学习流，回答始终位于题目下方。
- 手机宽度范围为 320–767px，平板为 768–1199px，桌面为 1200px 以上。
- 手机评分栏固定底部并处理安全区；平板和桌面评分栏不得横跨整个窗口底部。
- 修改必须先写失败测试，再写最小实现；每个任务独立运行相关测试。
- 线上 `main` 不在本计划内修改、合并或推送。

---

### Task 1: 锁定单焦点 DOM 契约

**Files:**
- Modify: `src/app/App.test.tsx:113-145`
- Modify: `tests/app.spec.ts:137-164`

**Interfaces:**
- Consumes: 现有 `StudyScreen` 测试 fixture、`payload.cards[0]`、Playwright 的解锁 helper。
- Produces: 后续实现必须满足的 `.study-flow`、`.study-card`、`.answer-panel` 和 `.rating-dock` 结构契约。

- [ ] **Step 1: 写失败的组件测试**

将 `src/app/App.test.tsx` 中首次翻面测试的断言改为：

```tsx
fireEvent.click(screen.getByRole("button", { name: "查看回答" }));
const flow = container.querySelector(".study-flow");
expect(flow).toBeInTheDocument();
expect(flow?.querySelector(":scope > .study-card")).toBeInTheDocument();
expect(flow?.querySelector(":scope > .answer-panel")).toBeInTheDocument();
expect(flow?.querySelector(":scope > .rating-dock")).toBeInTheDocument();
expect(flow?.children).toHaveLength(3);
```

- [ ] **Step 2: 运行测试确认失败**

运行：

```bash
npm test -- src/app/App.test.tsx
```

预期：失败，当前 DOM 使用 `.study-layout`，且评分栏仍在学习流外部。

- [ ] **Step 3: 写失败的桌面布局 E2E 断言**

将 `tests/app.spec.ts` 原有的 `keeps study content stacked on mobile and splits it on desktop` 测试替换为：

```ts
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
});
```

- [ ] **Step 4: 运行 E2E 确认失败**

运行：

```bash
npx playwright test tests/app.spec.ts --project=mobile-chrome --grep "one focus flow"
```

预期：失败，`.study-flow` 尚不存在。

- [ ] **Step 5: 提交测试契约**

```bash
git add src/app/App.test.tsx tests/app.spec.ts
git commit -m "test: define single-focus study flow contract"
```

### Task 2: 重构 StudyScreen 的纵向结构与换卡滚动

**Files:**
- Modify: `src/app/StudyScreen.tsx:1-190`
- Modify: `src/app/App.test.tsx:10-205`

**Interfaces:**
- Consumes: Task 1 的 `.study-flow` DOM 契约、现有 `ProgressiveAnswer` 和 `Rating` 流程。
- Produces: `StudyScreen` 输出 `study-flow > study-card + answer-panel + rating-dock`，评分成功后下一张卡回到流顶部。

- [ ] **Step 1: 写换卡滚动失败测试**

在 `src/app/App.test.tsx` 的“resets progressive sections when a card is repeated after Again”测试中，评分前记录滚动容器并断言下一张卡仍由同一 `study-flow` 承载：

```tsx
const flowBeforeRating = container.querySelector(".study-flow");
expect(flowBeforeRating).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "不会" }));
expect(await screen.findByRole("button", { name: "查看回答" })).toBeInTheDocument();
expect(container.querySelector(".study-flow")).toBe(flowBeforeRating);
```

- [ ] **Step 2: 运行组件测试确认当前结构不满足**

运行：

```bash
npm test -- src/app/App.test.tsx
```

预期：Task 1 的 `.study-flow` 断言失败。

- [ ] **Step 3: 在 StudyScreen 中实现单流容器**

在 `src/app/StudyScreen.tsx` 的 import 中加入 `useEffect` 已有依赖，新增 `useRef`，并将状态区替换为：

```tsx
const flowRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (currentIndex > 0) {
    flowRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }
}, [currentIndex]);
```

将当前 `<div className={revealed ? "study-layout is-revealed" : "study-layout"}>` 替换为：

```tsx
<div ref={flowRef} className={revealed ? "study-flow is-revealed" : "study-flow"}>
  <article className={revealed ? "study-card is-revealed" : "study-card"}>
    <div className="question-meta">
      <span>{card.category}</span>
      <span>{card.topic}</span>
      <span className={`priority priority-${card.priority.toLowerCase()}`}>{card.priority}</span>
    </div>
    <div className="question-panel">
      <Countdown cardKey={`${card.id}:${currentIndex}`} />
      <p className="eyebrow">QUESTION</p>
      <h1>{card.question}</h1>
      {!revealed ? (
        <button aria-label="查看回答" className="reveal-button" type="button" onClick={() => setRevealed(true)}>
          <span>查看回答</span>
          <small>想好后随时翻面，不必等计时结束</small>
        </button>
      ) : null}
    </div>
  </article>

  {revealed ? (
    <section className="answer-panel" aria-label="回答">
      <ProgressiveAnswer key={`${card.id}:${currentIndex}`} card={card}>
        <div className="source-row">
          <span title={card.source.path}>{card.source.heading}</span>
          <SourceAction card={card} />
        </div>
      </ProgressiveAnswer>
    </section>
  ) : null}

  {revealed ? (
    <footer className="rating-dock">
      <p>这次答得怎么样？</p>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <div>
        <button className="rating-again" disabled={saving} onClick={() => void rate("again")}>不会</button>
        <button className="rating-fuzzy" disabled={saving} onClick={() => void rate("fuzzy")}>模糊</button>
        <button className="rating-mastered" disabled={saving} onClick={() => void rate("mastered")}>掌握</button>
      </div>
    </footer>
  ) : null}
</div>
```

删除原来位于 `study-layout` 外部的评分 `<footer>`，保证评分是单焦点流的第三段。

- [ ] **Step 4: 运行组件测试确认通过**

运行：

```bash
npm test -- src/app/App.test.tsx
```

预期：StudyScreen 相关测试全部通过，评分、重试和展开状态行为不变。

- [ ] **Step 5: 提交结构改动**

```bash
git add src/app/StudyScreen.tsx src/app/App.test.tsx
git commit -m "feat: make study screen a single vertical flow"
```

### Task 3: 重写学习流 CSS 与设备断点

**Files:**
- Modify: `src/app/app.css:110-180,210-270`
- Modify: `tests/dev/styles.spec.ts:1-100`

**Interfaces:**
- Consumes: Task 2 生成的 `.study-flow` DOM。
- Produces: 320px～1440px 下的一致单列布局，以及设备相关评分策略。

- [ ] **Step 1: 增加响应式样式失败断言**

在 `tests/dev/styles.spec.ts` 的 layout probe 中加入 `.study-flow` 与 `.rating-dock`，并把断言改为：

```ts
const flow = getComputedStyle(element.querySelector(".study-flow")!);
const rating = getComputedStyle(element.querySelector(".rating-dock")!);
return {
  shellDisplay: shell.display,
  navPosition: nav.position,
  navDisplay: nav.display,
  filterDisplay: filter.display,
  flowColumns: flow.gridTemplateColumns,
  ratingPosition: rating.position,
  ratingWidth: rating.width,
};
```

并在 probe HTML 中使用：

```html
<div class="study-flow">
  <article class="study-card"></article>
  <section class="answer-panel"></section>
  <footer class="rating-dock"><div><button>不会</button><button>模糊</button><button>掌握</button></div></footer>
</div>
```

对每个宽度增加断言：

```ts
expect(layout.flowColumns.split(" ")).toHaveLength(1);
if (width < 768) {
  expect(layout.ratingPosition).toBe("fixed");
} else {
  expect(layout.ratingPosition).toBe("sticky");
}
```

- [ ] **Step 2: 运行样式测试确认失败**

运行：

```bash
npx playwright test --config playwright.dev.config.ts tests/dev/styles.spec.ts
```

预期：失败，当前样式没有 `.study-flow` 规则。

- [ ] **Step 3: 实现基础单列样式**

将学习区域基础样式替换为：

```css
.study-screen { min-height: 100dvh; padding-bottom: calc(32px + env(safe-area-inset-bottom)); }
.study-flow {
  width: min(calc(100% - 32px), 900px);
  margin: 32px auto 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  align-content: start;
  scroll-margin-top: 92px;
}
.study-card { width: 100%; margin: 0; background: white; border: 1px solid var(--line); border-radius: 20px; }
.study-card.is-revealed { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.answer-panel {
  min-width: 0;
  padding: 0 24px 28px;
  background: white;
  border: 1px solid var(--line);
  border-top: 0;
  border-radius: 0 0 20px 20px;
}
.rating-dock {
  position: sticky;
  bottom: 16px;
  z-index: 10;
  width: 100%;
  margin-top: 16px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fffffff5;
  box-shadow: 0 8px 28px #25312f12;
}
```

桌面和大平板不再使用 `.study-layout` 的两列规则；删除 `@media (min-width: 1200px)` 中的 `grid-template-columns: minmax(340px, .78fr) minmax(0, 1.22fr)`、`.study-card { position: sticky; }` 和整条窗口底部评分样式。

- [ ] **Step 4: 实现手机固定评分栏**

在基础样式后加入：

```css
@media (max-width: 767px) {
  .study-screen { padding-bottom: calc(150px + env(safe-area-inset-bottom)); }
  .study-flow { width: min(calc(100% - 32px), 900px); margin-top: 24px; }
  .rating-dock {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    margin: 0;
    border-width: 1px 0 0;
    border-radius: 0;
    padding: 12px 16px max(16px, env(safe-area-inset-bottom));
  }
}
```

- [ ] **Step 5: 实现平板和桌面阅读宽度**

在现有断点中替换学习页规则：

```css
@media (min-width: 768px) {
  .study-flow { width: min(calc(100% - 64px), 840px); margin-top: 36px; }
  .question-panel { padding: 32px 40px; }
  .question-meta { padding: 24px 40px 0; }
  .answer-panel { padding: 0 40px 36px; }
}

@media (min-width: 1200px) {
  .study-flow { width: min(calc(100% - 80px), 900px); margin-top: 48px; }
  .study-card.is-revealed .question-panel { padding-top: 22px; padding-bottom: 22px; }
  .study-card.is-revealed .question-panel h1 { margin-top: 12px; margin-bottom: 0; font-size: 24px; }
  .rating-dock { padding: 12px 20px; }
}
```

- [ ] **Step 6: 运行样式测试确认通过**

运行：

```bash
npx playwright test --config playwright.dev.config.ts tests/dev/styles.spec.ts
```

预期：1 个样式测试通过，六个宽度均无横向溢出。

- [ ] **Step 7: 提交样式改动**

```bash
git add src/app/app.css tests/dev/styles.spec.ts
git commit -m "style: make study flow responsive and single-column"
```

### Task 4: 更新生产 E2E 与回归验证

**Files:**
- Modify: `tests/app.spec.ts:5-165`
- Modify: `docs/superpowers/specs/2026-09-10-single-focus-study-layout-design.md` only if an observed implementation detail needs clarification; do not change requirements silently.

**Interfaces:**
- Consumes: Task 3 的 CSS 断点、Task 2 的 DOM 结构。
- Produces: 覆盖解锁、翻面、折叠、评分、换卡和六个屏幕宽度的回归证据。

- [ ] **Step 1: 增加评分不横跨窗口的 E2E 断言**

在单焦点 E2E 中加入：

```ts
const ratingRect = await page.locator(".rating-dock").evaluate((element) => {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, width: rect.width };
});
expect(ratingRect.left).toBeGreaterThan(0);
expect(ratingRect.width).toBeLessThan(1440);
```

- [ ] **Step 2: 运行完整生产 E2E**

运行：

```bash
npm run test:e2e
```

预期：Chrome 与 Safari 的 10 个测试全部通过，覆盖离线解锁、回答折叠、触控评分和单焦点布局。

- [ ] **Step 3: 运行单元、类型和生产构建**

运行：

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

预期：Vitest 全部通过，TypeScript 无错误，Vite 生产构建成功，差异无空白错误。

- [ ] **Step 4: 提交并检查工作树**

```bash
git status --short --branch
git log --oneline -5
```

预期：工作树只保留本计划相关提交，无 `dist`、测试缓存或密文意外变化。

## 执行顺序与检查点

按 Task 1 → Task 2 → Task 3 → Task 4 顺序执行。每个 Task 完成后先运行其局部测试再提交；Task 4 完成后提供本地预览地址，用户确认视觉效果后才讨论是否合并 `main` 或重新发布 GitHub Pages。
