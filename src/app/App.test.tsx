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
});

afterEach(() => {
  cleanup();
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

class DelayedMigrationStore extends MemoryProgressStore {
  private migrationRelease!: () => void;
  readonly migrationFinished: Promise<void>;

  constructor() {
    super();
    this.migrationFinished = new Promise((resolve) => {
      this.migrationRelease = resolve;
    });
  }

  override async migrateLegacyIds(cards: ReadonlyArray<ProgressCardIdentity>): Promise<void> {
    this.migrationCards = cards;
    await this.migrationFinished;
  }

  releaseMigration(): void {
    this.migrationRelease();
  }
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

  it("does not show the workspace until progress migration finishes", async () => {
    const store = new DelayedMigrationStore();

    render(
      <App
        unlockCards={async () => payload}
        createStore={async () => store}
        createRememberedUnlockStore={async () => new MemoryRememberedUnlockStore()}
      />,
    );

    await submitPassword("correct-password");
    await waitFor(() => expect(store.migrationCards).toEqual(payload.cards));
    expect(screen.queryByText("今日复习")).not.toBeInTheDocument();
    expect(screen.getByText("正在读取本机进度…")).toBeInTheDocument();

    store.releaseMigration();
    expect(await screen.findByText("今日复习")).toBeInTheDocument();
  });

  it("migrates progress before showing the unlocked workspace", async () => {
    const store = new MemoryProgressStore();
    const migratedPayload: ParsedCardsPayload = {
      ...payload,
      cards: [{ ...payload.cards[0], legacyIds: ["old-quantum-widget-001"] }],
    };

    render(
      <App
        unlockCards={async () => migratedPayload}
        createStore={async () => store}
        createRememberedUnlockStore={async () => new MemoryRememberedUnlockStore()}
      />,
    );

    await submitPassword("correct-password");
    expect(await screen.findByText("今日复习")).toBeInTheDocument();
    expect(store.migrationCards).toEqual(migratedPayload.cards);
    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(navigation).toHaveClass("main-nav");
    expect(navigation.querySelectorAll("button")).toHaveLength(3);
    expect(navigation.nextElementSibling).toHaveClass("app-content");
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
        createStore={async () => new MemoryProgressStore()}
        createRememberedUnlockStore={async () => new MemoryRememberedUnlockStore()}
        now={() => new Date(2026, 7, 31, 9)}
      />,
    );

    expect(screen.queryByText("熵门是什么？")).not.toBeInTheDocument();
    expect(await screen.findByLabelText("题库密码")).toHaveAttribute("autocomplete", "current-password");
    await submitPassword("wrong-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("解锁失败");
    expect(screen.queryByText("熵门是什么？")).not.toBeInTheDocument();
  });

  it("runs a study session, records mastery, and forgets cards on manual lock", async () => {
    const store = new MemoryProgressStore();
    render(
      <App
        unlockCards={async () => payload}
        createStore={async () => store}
        createRememberedUnlockStore={async () => new MemoryRememberedUnlockStore()}
        now={() => new Date(2026, 7, 31, 9)}
      />,
    );

    await submitPassword("correct-password");
    expect(await screen.findByText("今日复习")).toBeInTheDocument();
    expect(screen.queryByText("熵门是什么？")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开始完整题库" }));
    expect(await screen.findByText("熵门是什么？")).toBeInTheDocument();
    const initialProgress = screen.getByRole("progressbar", { name: "本轮已完成 0 / 1" });
    expect(initialProgress).toHaveValue(0);
    expect(screen.getByText("已完成 0 / 1")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "30 秒回答" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看回答" }));
    expect(screen.getByRole("heading", { name: "30 秒回答" }).parentElement).toHaveTextContent(
      "熵门是虚构测试状态容器。",
    );
    fireEvent.click(screen.getByRole("button", { name: "掌握" }));

    expect(await screen.findByText("本轮完成")).toBeInTheDocument();
    await waitFor(() => {
      expect(store.records.get("fictional-quantum-widget-001")).toMatchObject({
        level: 1,
        reviewCount: 1,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "返回首页" }));
    fireEvent.click(screen.getByRole("button", { name: "锁定" }));
    expect(await screen.findByText("解锁题库")).toBeInTheDocument();
    expect(screen.queryByText("熵门是什么？")).not.toBeInTheDocument();
  });

  it("starts locked again when the unlocked app is refreshed", async () => {
    const store = new MemoryProgressStore();
    const appProps = {
      unlockCards: async () => payload,
      createStore: async () => store,
      createRememberedUnlockStore: async () => new MemoryRememberedUnlockStore(),
      now: () => new Date(2026, 7, 31, 9),
    };

    const firstRender = render(<App {...appProps} />);
    await submitPassword("correct-password");
    expect(await screen.findByText("今日复习")).toBeInTheDocument();

    firstRender.unmount();
    render(<App {...appProps} />);

    expect(await screen.findByRole("heading", { name: "解锁题库" })).toBeInTheDocument();
    expect(screen.getByLabelText("题库密码")).toBeInTheDocument();
    expect(screen.queryByText("熵门是什么？")).not.toBeInTheDocument();
  });

  it("restores remembered cards before showing the password form", async () => {
    const store = new MemoryProgressStore();
    const rememberedStore = new MemoryRememberedUnlockStore();

    render(
      <App
        unlockCards={async () => payload}
        createStore={async () => store}
        createRememberedUnlockStore={async () => rememberedStore}
        restoreRememberedCards={async () => payload}
      />,
    );

    expect(screen.getByText("正在检查本机解锁…")).toBeInTheDocument();
    expect(await screen.findByText("今日复习")).toBeInTheDocument();
    expect(screen.queryByLabelText("题库密码")).not.toBeInTheDocument();
  });

  it("saves a session key only when the device-memory option is checked", async () => {
    const envelope = await encryptEnvelope(payload, "correct-password", payload.buildId);
    const key = await deriveEnvelopeKey(envelope, "correct-password");
    const rememberedStore = new MemoryRememberedUnlockStore();

    render(
      <App
        unlockCards={async () => ({ payload, envelope, key })}
        createStore={async () => new MemoryProgressStore()}
        createRememberedUnlockStore={async () => rememberedStore}
      />,
    );

    await submitPassword("correct-password", true);
    expect(await screen.findByText("今日复习")).toBeInTheDocument();
    expect(rememberedStore.record).toMatchObject({
      buildId: payload.buildId,
      salt: envelope.kdf.salt,
    });

    fireEvent.click(screen.getByRole("button", { name: "锁定" }));
    expect(await screen.findByText("解锁题库")).toBeInTheDocument();
    expect(rememberedStore.clearCount).toBe(1);
  });
});
