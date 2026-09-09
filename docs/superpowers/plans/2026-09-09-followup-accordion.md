# 高频追问两层折叠展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在学习页和自由浏览页把长“高频追问”改成两层折叠，并保证一次只展开一个追问。

**Architecture:** 保留 `ProgressiveAnswer` 作为所有回答区的入口；在其中增加受控的 `FollowUpAccordion`，外层继续使用原生 `<details>`，内层使用 React 状态控制问题按钮和答案区域。卡片 ID 变化时清空内层展开索引，Markdown 继续由现有 `Markdown` 组件渲染。

**Tech Stack:** React 19、TypeScript、原生 `<details>`、Testing Library、Playwright、Vite。

## Global Constraints

- 30 秒回答保持固定可见；高频追问默认收起。
- 外层展开后先显示问题列表；每次最多展开一个追问。
- 学习页和自由浏览页共用同一套追问组件。
- 切换卡片时不继承上一张卡的展开状态。
- 问题行触控目标至少 44px，支持 Tab、Enter、Space 和屏幕阅读器。
- 答案不截断；代码块和表格沿用现有 Markdown 样式及横向滚动。
- 搜索继续检索追问问题和答案；展示折叠不改变数据。
- 不新增依赖，不修改卡片内容、进度调度、加密格式或 `cards-baseline.json`。

---

## 文件结构

- Modify: `src/app/ProgressiveAnswer.tsx` — 增加内层追问手风琴和卡片切换时的状态重置。
- Modify: `src/app/app.css` — 添加追问问题行、展开状态和答案容器样式。
- Create: `src/app/ProgressiveAnswer.test.tsx` — 覆盖默认关闭、单题互斥和卡片切换重置。
- Modify: `src/app/BrowseScreen.test.tsx` — 调整自由浏览的追问交互断言。
- Modify: `src/app/App.test.tsx` — 覆盖学习页换卡后追问状态清空。
- Modify: `tests/app.spec.ts` — 覆盖真实手机尺寸下的外层、内层折叠和固定评分栏。

### Task 1: 为追问手风琴写失败测试

**Files:**
- Create: `src/app/ProgressiveAnswer.test.tsx`

**Interfaces:**
- Consumes: `ProgressiveAnswer`、`CardV2`、Testing Library 的 `render`、`fireEvent`、`screen`。
- Produces: 问题按钮的 `aria-expanded` 契约，以及答案仅在打开时出现的行为。

- [ ] **Step 1: 创建最小夹具和三个失败测试**

使用两条追问，覆盖初始关闭、互斥展开和卡片 ID 变化重置：

```tsx
const card = {
  id: "followup-card-001", legacyIds: [], question: "主问题",
  category: "99-测试", topic: "测试", decks: ["full"], priority: "P1",
  quickAnswerMd: "30 秒回答。", detailMd: "深入理解。",
  followUps: [
    { question: "追问一", answerMd: "答案一。" },
    { question: "追问二", answerMd: "答案二。" },
  ],
  source: { path: "fixture.md", heading: "主问题" },
} satisfies CardV2;

it("keeps follow-up answers closed initially", () => {
  render(<ProgressiveAnswer card={card} />);
  expect(screen.getByText("高频追问 · 2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /追问一/ })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("答案一。")).not.toBeInTheDocument();
});

it("opens one answer and closes the previous answer", () => {
  render(<ProgressiveAnswer card={card} />);
  fireEvent.click(screen.getByText("高频追问 · 2"));
  const first = screen.getByRole("button", { name: /追问一/ });
  const second = screen.getByRole("button", { name: /追问二/ });
  fireEvent.click(first);
  fireEvent.click(second);
  expect(first).toHaveAttribute("aria-expanded", "false");
  expect(second).toHaveAttribute("aria-expanded", "true");
  expect(screen.queryByText("答案一。")).not.toBeInTheDocument();
  expect(screen.getByText("答案二。")).toBeInTheDocument();
});

it("clears the open follow-up when the card id changes", () => {
  const { rerender } = render(<ProgressiveAnswer card={card} />);
  fireEvent.click(screen.getByText("高频追问 · 2"));
  fireEvent.click(screen.getByRole("button", { name: /追问一/ }));
  rerender(<ProgressiveAnswer card={{ ...card, id: "followup-card-002" }} />);
  expect(screen.getByRole("button", { name: /追问一/ })).toHaveAttribute("aria-expanded", "false");
});
```

- [ ] **Step 2: 运行测试确认当前实现失败**

Run: `npm test -- --run src/app/ProgressiveAnswer.test.tsx`

Expected: FAIL，因为当前组件没有追问问题按钮和逐题折叠状态。

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/app/ProgressiveAnswer.test.tsx
git commit -m "test: define follow-up accordion behavior"
```

### Task 2: 实现内层追问手风琴

**Files:**
- Modify: `src/app/ProgressiveAnswer.tsx`

**Interfaces:**
- Consumes: `CardV2["followUps"]`、`card.id` 和 `Markdown`。
- Produces: `FollowUpAccordion({ followUps, cardId })`，供外层“高频追问”区域调用。

- [ ] **Step 1: 添加组件并替换静态追问列表**

引入 `useEffect`、`useId`、`useState`。答案关闭时不渲染 Markdown，避免所有长答案同时进入页面流：

```tsx
function FollowUpAccordion({
  followUps, cardId,
}: { followUps: CardV2["followUps"]; cardId: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const baseId = useId();
  useEffect(() => setOpenIndex(null), [cardId]);

  return <div className="followup-list">
    {followUps.map((followUp, index) => {
      const open = openIndex === index;
      const answerId = `${baseId}-answer-${index}`;
      return <div className={open ? "followup-item is-open" : "followup-item"} key={`${followUp.question}-${index}`}>
        <button type="button" className="followup-question"
          aria-expanded={open} aria-controls={answerId}
          onClick={() => setOpenIndex(open ? null : index)}>
          <span className="followup-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="followup-question-text">{followUp.question}</span>
          <span className="followup-toggle" aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
        {open && followUp.answerMd ? <div id={answerId} className="followup-answer">
          <Markdown>{followUp.answerMd}</Markdown>
        </div> : null}
      </div>;
    })}
  </div>;
}
```

外层 `<details>` 内使用 `<FollowUpAccordion followUps={card.followUps} cardId={card.id} />` 替换现有 `card.followUps.map`。

- [ ] **Step 2: 运行组件测试**

Run: `npm test -- --run src/app/ProgressiveAnswer.test.tsx`

Expected: PASS，三个追问折叠测试全部通过。

- [ ] **Step 3: Commit the component behavior**

```bash
git add src/app/ProgressiveAnswer.tsx
git commit -m "feat: collapse follow-up answers individually"
```

### Task 3: 调整样式和可访问性

**Files:**
- Modify: `src/app/app.css`

**Interfaces:**
- Consumes: `.followup-list`、`.followup-item`、`.followup-question`、`.followup-answer`。
- Produces: 移动端单列、44px 触控目标、展开态视觉反馈和答案正文布局。

- [ ] **Step 1: 添加追问样式并替换旧列表分隔规则**

```css
.followup-list { display: grid; gap: 8px; }
.followup-item { overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
.followup-item.is-open { border-color: #95bdae; background: #fbfdfc; }
.followup-question { width: 100%; min-height: 52px; display: grid; grid-template-columns: 28px minmax(0, 1fr) 24px; gap: 10px; align-items: center; padding: 12px; border: 0; background: transparent; color: var(--ink); text-align: left; font: inherit; cursor: pointer; }
.followup-question:hover, .followup-question:focus-visible { background: #f1f7f4; }
.followup-index, .followup-toggle { color: var(--muted); font-size: 12px; }
.followup-question-text { min-width: 0; overflow-wrap: anywhere; font-size: 14px; line-height: 1.55; font-weight: 600; }
.followup-toggle { text-align: center; font-size: 20px; line-height: 1; }
.followup-answer { padding: 4px 14px 16px 50px; border-top: 1px solid var(--line); }
```

删除当前 `.followup-list > div + div` 规则，避免新组件出现重复分隔线。

- [ ] **Step 2: 运行类型检查和组件测试**

Run: `npm run typecheck && npm test -- --run src/app/ProgressiveAnswer.test.tsx`

Expected: typecheck 和组件测试通过；320px 宽度下问题文本可换行且页面不横向溢出。

- [ ] **Step 3: Commit the visual behavior**

```bash
git add src/app/app.css
git commit -m "style: make follow-up answers scannable"
```

### Task 4: 更新页面级测试

**Files:**
- Modify: `src/app/BrowseScreen.test.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `tests/app.spec.ts`

- [ ] **Step 1: 更新 BrowseScreen 断言**

打开卡片后先打开外层“高频追问 · 1”，确认问题按钮出现但答案仍隐藏；再点击问题按钮确认答案出现。保留前三个回答区的独立展开测试，并增加追问互斥断言：

```tsx
fireEvent.click(screen.getByRole("button", { name: /虚构装置如何校准/ }));
fireEvent.click(screen.getByText("高频追问 · 1", { selector: "summary" }));
const followUp = screen.getByRole("button", { name: /为什么要重试/ });
expect(followUp).toHaveAttribute("aria-expanded", "false");
expect(screen.queryByText("为了消除虚构噪声。")).not.toBeInTheDocument();
fireEvent.click(followUp);
expect(screen.getByText("为了消除虚构噪声。")).toBeInTheDocument();
```

- [ ] **Step 2: 增加 StudyScreen 换卡断言**

在换卡测试中用局部夹具给第一张卡增加两条追问，打开第一条后进入第二张卡，确认第二张卡没有残留展开状态：

```tsx
const firstCard = { ...payload.cards[0], followUps: [
  { question: "第一张追问", answerMd: "第一张答案。" },
  { question: "第二张追问", answerMd: "第二张答案。" },
] };
const secondCard = { ...payload.cards[0], id: "fictional-entropy-gate-002" };
initialQueue={[{ card: firstCard, kind: "new" }, { card: secondCard, kind: "new" }]}
fireEvent.click(screen.getByRole("button", { name: "查看回答" }));
fireEvent.click(screen.getByText("高频追问 · 2", { selector: "summary" }));
fireEvent.click(screen.getByRole("button", { name: /第一张追问/ }));
fireEvent.click(screen.getByRole("button", { name: "掌握" }));
expect(await screen.findByText("第二张虚构题目是什么？")).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "查看回答" }));
expect(screen.queryByRole("button", { name: /第一张追问/ })).not.toHaveAttribute("aria-expanded", "true");
```

- [ ] **Step 3: 扩展 Playwright 手机流程**

在 `tests/app.spec.ts` 学习流程中验证外层打开不显示答案，内层打开后显示答案，并且评分栏仍在视口：

```ts
await page.getByText("高频追问 · 1", { exact: true }).click();
await expect(page.getByRole("button", { name: /相位失配时怎么办/ })).toBeVisible();
await expect(page.getByText("丢弃虚构令牌并重新进入测试轮次。")).toHaveCount(0);
await page.getByRole("button", { name: /相位失配时怎么办/ }).click();
await expect(page.getByText("丢弃虚构令牌并重新进入测试轮次。")).toBeVisible();
await expect(page.locator(".rating-dock")).toBeInViewport();
```

- [ ] **Step 4: 运行页面测试**

Run: `npm test -- --run src/app/BrowseScreen.test.tsx src/app/App.test.tsx`

Expected: PASS，页面测试覆盖外层关闭、内层单题展开和换卡重置。

### Task 5: 全量验证并提交

**Files:**
- Verify: `src/app/ProgressiveAnswer.tsx`、`src/app/app.css`、`src/app/ProgressiveAnswer.test.tsx`、`src/app/BrowseScreen.test.tsx`、`src/app/App.test.tsx`、`tests/app.spec.ts`。

- [ ] **Step 1: 运行单元测试、类型检查和生产构建**

```bash
npm test -- --run
npm run typecheck
npm run build
```

Expected: Vitest、TypeScript 和 Vite build 全部退出码为 0。

- [ ] **Step 2: 运行 Playwright E2E**

Run: `npm run test:e2e`

Expected: 320px、390px 与桌面宽度流程通过；无页面横向溢出；切换卡片后无残留展开内容。

- [ ] **Step 3: 检查工作树并提交实现**

Run: `git diff --check && git status --short`

只暂存本次组件、样式和测试文件，保留用户已有 `cards-baseline.json` 修改，然后提交：

```bash
git add src/app/ProgressiveAnswer.tsx src/app/app.css src/app/ProgressiveAnswer.test.tsx src/app/BrowseScreen.test.tsx src/app/App.test.tsx tests/app.spec.ts
git commit -m "feat: add nested follow-up accordion"
```

## Self-review checklist

- Spec coverage: 两层折叠、单题互斥、换卡重置、键盘/触控、惰性渲染、响应式和两页一致性由 Tasks 1–5 覆盖。
- Placeholder scan: 计划没有未定内容；每一步都有文件、命令和预期结果。
- Type consistency: `FollowUpAccordion` 接收 `CardV2["followUps"]` 与 `cardId: string`，由 `ProgressiveAnswer` 调用；测试使用同一按钮和 ARIA 契约。
- Existing worktree state: `cards-baseline.json` 只作为已有未提交变更保留，不参与实现提交。
