// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedCardsPayload } from "../content/payload";
import { deriveEnvelopeKey, encryptEnvelope, UnlockError } from "../crypto/envelope";
import type { RememberedUnlockRecord, RememberedUnlockStore } from "../security/remembered-unlock";
import type { DailyLimit, ProgressCardIdentity, ProgressStore } from "../storage/progress";
import type { CardProgress } from "../study/scheduler";
import { App } from "./App";
import { StudyScreen } from "./StudyScreen";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

const payload: ParsedCardsPayload = {
  schema: "cards-v2",
  buildId: "build-fictional-001",
  builtAt: "2026-08-31T08:00:00.000Z",
  cards: [
    {
      id: "fictional-quantum-widget-001",
      legacyIds: [],
      question: "熵门是什么？",
      category: "99-虚构分类",
      topic: "QuantumWidget",
      decks: ["sprint", "full"],
      priority: "P0",
      quickAnswerMd: "**熵门**是虚构测试状态容器。",
      detailMd: "- 它只存在于测试语料。",
      followUps: [],
      source: { path: "fictional.md", heading: "熵门是什么？" },
    },
  ],
};

class MemoryProgressStore implements ProgressStore {
  readonly records = new Map<string, CardProgress>();
  limit: DailyLimit = 20;
  migrationCards?: ReadonlyArray<ProgressCardIdentity>;

  async get(cardId: string): Promise<CardProgress | undefined> {
    return this.records.get(cardId);
  }

  async getAll(): Promise<CardProgress[]> {
    return [...this.records.values()];
  }

  async put(progress: CardProgress): Promise<void> {
    this.records.set(progress.cardId, progress);
  }

  async clear(): Promise<void> {
    this.records.clear();
  }

  async getDailyLimit(): Promise<DailyLimit> {
    return this.limit;
  }

  async setDailyLimit(limit: DailyLimit): Promise<void> {
    this.limit = limit;
  }

  async exportJson(): Promise<string> {
    return "{}";
  }

  async importJson(): Promise<void> {}

  async migrateLegacyIds(cards: ReadonlyArray<ProgressCardIdentity>): Promise<void> {
    this.migrationCards = cards;
  }

  close(): void {}
}

class MemoryRememberedUnlockStore implements RememberedUnlockStore {
  record?: RememberedUnlockRecord;
  clearCount = 0;

  async get(): Promise<RememberedUnlockRecord | undefined> {
    return this.record;
  }

  async put(record: RememberedUnlockRecord): Promise<void> {
    this.record = record;
  }

  async clear(): Promise<void> {
    this.record = undefined;
    this.clearCount += 1;
  }

  close(): void {}
}

async function submitPassword(password: string, rememberDevice = false): Promise<void> {
  await screen.findByLabelText("题库密码");
  fireEvent.change(screen.getByLabelText("题库密码"), { target: { value: password } });
  if (rememberDevice) {
    fireEvent.click(screen.getByRole("checkbox", { name: "记住此设备" }));
  }
  fireEvent.click(screen.getByRole("button", { name: "解锁" }));
}

describe("App", () => {
  it("reads learning routes from the unlocked payload and opens an answer from a stage", async () => {
    const next: ParsedCardsPayload = { ...payload, schema: "cards-v3", routes: [{
      id: "fictional-private-route", title: "Fictional payload route", summary: "Route supplied by content", level: "Demo", estimatedMinutes: 1,
      steps: [{ id: "fictional-private-step", title: "A payload step", purpose: "", transition: "",
        cardIds: [payload.cards[0].id], readingMd: "**Fictional route principle**", featuredCardIds: [payload.cards[0].id] }],
    }] };
    render(<App unlockCards={async () => next} createRememberedUnlockStore={async () => new MemoryRememberedUnlockStore()} restoreRememberedCards={async () => undefined} />);
    await submitPassword("fictional-password");
    fireEvent.click(await screen.findByRole("button", { name: "学习路线" }));
    fireEvent.click(screen.getByRole("button", { name: /Fictional payload route/ }));
    expect(screen.getByText("Fictional route principle", { selector: "strong" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "高频考点" })).toBeVisible();
    const question = screen.getByText("熵门是什么？", { exact: true, selector: "summary span" }).closest("details")!;
    const routeHash = window.location.hash;
    question.open = true;
    fireEvent(question, new Event("toggle"));
    expect(window.location.hash).toBe(routeHash);
    fireEvent.click(screen.getByRole("button", { name: "查看完整问答" }));
    expect(screen.getByRole("heading", { name: "熵门是什么？" })).toBeVisible();
    window.history.back();
    expect(await screen.findByRole("heading", { name: "A payload step" })).toBeVisible();
  });

  it("resets progressive sections when a card is repeated after Again", async () => {
    const store = new MemoryProgressStore();
    const { container } = render(
      <StudyScreen
        deck="full"
        initialQueue={[{ card: payload.cards[0], kind: "new" }]}
        progress={new Map()}
        store={store}
        now={() => new Date(2026, 7, 31, 9)}
        onProgress={() => undefined}
        onExit={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看回答" }));
    const flow = container.querySelector(".study-flow");
    expect(flow).toBeInTheDocument();
    expect(flow?.querySelector(":scope > .study-card")).toBeInTheDocument();
    expect(flow?.querySelector(":scope > .answer-panel")).toBeInTheDocument();
    expect(flow?.querySelector(":scope > .rating-dock")).toBeInTheDocument();
    expect(flow?.children).toHaveLength(3);
    fireEvent.click(screen.getByText("深入理解", { selector: "summary" }));
    expect(container.querySelector("details")!).toHaveAttribute("open");

    const flowBeforeRating = container.querySelector(".study-flow");
    expect(flowBeforeRating).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "不会" }));
    expect(await screen.findByRole("button", { name: "查看回答" })).toBeInTheDocument();
    expect(container.querySelector(".study-flow")).toBe(flowBeforeRating);
    const repeatedProgress = screen.getByRole("progressbar", { name: "本轮已完成 1 / 2" });
    expect(repeatedProgress).toHaveValue(1);
    expect(screen.getByText("已完成 1 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看回答" }));
    expect(container.querySelectorAll("details[open]")).toHaveLength(0);
  });

  it("keeps the quick answer visible and resets progressive sections for the next card", async () => {
    const firstCard = {
      ...payload.cards[0],
      followUps: [
        { question: "第一张追问是什么？", answerMd: "第一张追问答案。" },
        { question: "第一张第二个追问是什么？", answerMd: "第二个追问答案。" },
      ],
    };
    const secondCard = {
      ...payload.cards[0],
      id: "fictional-entropy-gate-002",
      question: "第二张虚构题目是什么？",
      quickAnswerMd: "第二张题目的 30 秒回答。",
      detailMd: "第二张题目的深入理解。",
      followUps: [{ question: "新卡追问是什么？", answerMd: "新卡追问答案。" }],
    };
    const store = new MemoryProgressStore();
    const { container } = render(
      <StudyScreen
        deck="full"
        initialQueue={[
          { card: firstCard, kind: "new" },
          { card: secondCard, kind: "new" },
        ]}
        progress={new Map()}
        store={store}
        now={() => new Date(2026, 7, 31, 9)}
        onProgress={() => undefined}
        onExit={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看回答" }));
    expect(screen.getByText("30 秒回答", { selector: "h3" })).toBeInTheDocument();
    expect(screen.getByText("深入理解", { selector: "summary" })).toBeInTheDocument();
    expect(container.querySelectorAll("details[open]")).toHaveLength(0);
    fireEvent.click(screen.getByText("深入理解", { selector: "summary" }));
    expect(container.querySelector("details")!).toHaveAttribute("open");
    fireEvent.click(screen.getByText("高频追问 · 2", { selector: "summary" }));
    fireEvent.click(screen.getByRole("button", { name: /第一张追问是什么/ }));
    expect(screen.getByText("第一张追问答案。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "掌握" }));
    expect(await screen.findByText("第二张虚构题目是什么？")).toBeInTheDocument();
    expect(container.querySelectorAll("details")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "查看回答" }));
    expect(container.querySelectorAll("details[open]")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /新卡追问是什么/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("keeps card plaintext hidden until unlock and uses a generic failure message", async () => {
    const unlockCards = vi.fn(async (password: string) => {
      if (password !== "correct-password") {
        throw new UnlockError();
      }
      return payload;
    });
    render(
      <App
        unlockCards={unlockCards}
        createRememberedUnlockStore={async () => new MemoryRememberedUnlockStore()}
      />,
    );

    expect(screen.queryByText("熵门是什么？")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("题库密码")).toHaveAttribute("autocomplete", "current-password");
    await submitPassword("wrong-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("解锁失败");
    expect(screen.queryByText("熵门是什么？")).not.toBeInTheDocument();
  });

  it("shows the reference answer on unlock and removes private content on lock", async () => {
    render(<App unlockCards={async () => payload} createRememberedUnlockStore={async () => new MemoryRememberedUnlockStore()} />);
    await submitPassword("correct-password");
    expect(await screen.findByRole("heading", { name: "熵门是什么？" })).toBeVisible();
    expect(screen.getByLabelText("参考回答")).toHaveTextContent("熵门是虚构测试状态容器。");
    expect(screen.queryByRole("button", { name: "开始完整题库" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "锁定" }));
    expect(await screen.findByRole("heading", { name: "解锁题库" })).toBeVisible();
    expect(screen.queryByText("熵门是什么？")).not.toBeInTheDocument();
  });

  it("starts locked again when the unlocked app is refreshed", async () => {
    const appProps = {
      unlockCards: async () => payload,
      createRememberedUnlockStore: async () => new MemoryRememberedUnlockStore(),
    };

    const firstRender = render(<App {...appProps} />);
    await submitPassword("correct-password");
    expect(await screen.findByRole("heading", { name: "熵门是什么？" })).toBeInTheDocument();

    firstRender.unmount();
    render(<App {...appProps} />);

    expect(await screen.findByRole("heading", { name: "解锁题库" })).toBeInTheDocument();
    expect(screen.getByLabelText("题库密码")).toBeInTheDocument();
    expect(screen.queryByText("熵门是什么？")).not.toBeInTheDocument();
  });

  it("restores remembered cards before showing the password form", async () => {
    const rememberedStore = new MemoryRememberedUnlockStore();

    render(
      <App
        unlockCards={async () => payload}
        createRememberedUnlockStore={async () => rememberedStore}
        restoreRememberedCards={async () => payload}
      />,
    );

    expect(screen.getByText("正在检查本机解锁…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "熵门是什么？" })).toBeInTheDocument();
    expect(screen.queryByLabelText("题库密码")).not.toBeInTheDocument();
  });

  it("saves a session key only when the device-memory option is checked", async () => {
    const envelope = await encryptEnvelope(payload, "correct-password", payload.buildId);
    const key = await deriveEnvelopeKey(envelope, "correct-password");
    const rememberedStore = new MemoryRememberedUnlockStore();

    render(
      <App
        unlockCards={async () => ({ payload, envelope, key })}
        createRememberedUnlockStore={async () => rememberedStore}
      />,
    );

    await submitPassword("correct-password", true);
    expect(await screen.findByRole("heading", { name: "熵门是什么？" })).toBeInTheDocument();
    expect(rememberedStore.record).toMatchObject({
      buildId: payload.buildId,
      salt: envelope.kdf.salt,
    });

    fireEvent.click(screen.getByRole("button", { name: "锁定" }));
    expect(await screen.findByText("解锁题库")).toBeInTheDocument();
    expect(rememberedStore.clearCount).toBe(1);
  });
});
