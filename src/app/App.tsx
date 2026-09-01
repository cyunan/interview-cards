import { useCallback, useEffect, useState } from "react";

import type { ParsedCardsPayload } from "../content/payload";
import { UnlockError } from "../crypto/envelope";
import {
  createProgressStore,
  type DailyLimit,
  type ProgressStore,
} from "../storage/progress";
import {
  buildDailyQueue,
  remainingDailyQuota,
  toLocalDateKey,
  type CardProgress,
  type Deck,
  type QueueItem,
} from "../study/scheduler";
import { BrowseScreen } from "./BrowseScreen";
import { Dashboard } from "./Dashboard";
import { loadEncryptedCards, CardBankUnavailableError } from "./load-cards";
import { SettingsScreen } from "./SettingsScreen";
import { StudyScreen } from "./StudyScreen";
import { UnlockScreen } from "./UnlockScreen";

type View = "home" | "browse" | "settings";

export interface AppProps {
  unlockCards?: (password: string) => Promise<ParsedCardsPayload>;
  createStore?: () => Promise<ProgressStore>;
  now?: () => Date;
}

function AppHeader({ buildId, onLock }: { buildId: string; onLock(): void }) {
  return (
    <header className="app-header">
      <div className="mini-brand">
        <div className="mini-mark" aria-hidden="true"><span /><span /><span /></div>
        <div>
          <strong>面试卡片</strong>
          <small>BUILD {buildId.slice(0, 8).toUpperCase()}</small>
        </div>
      </div>
      <button className="lock-button" type="button" onClick={onLock}>
        <span aria-hidden="true">◇</span> 锁定
      </button>
    </header>
  );
}

function BottomNavigation({ view, onView }: { view: View; onView(view: View): void }) {
  return (
    <nav className="bottom-nav" aria-label="主导航">
      <button aria-current={view === "home" ? "page" : undefined} onClick={() => onView("home")}>
        <span aria-hidden="true">⌂</span><small>首页</small>
      </button>
      <button aria-current={view === "browse" ? "page" : undefined} onClick={() => onView("browse")}>
        <span aria-hidden="true">▤</span><small>浏览</small>
      </button>
      <button aria-current={view === "settings" ? "page" : undefined} onClick={() => onView("settings")}>
        <span aria-hidden="true">⚙</span><small>设置</small>
      </button>
    </nav>
  );
}

interface WorkspaceProps {
  payload: ParsedCardsPayload;
  createStore(): Promise<ProgressStore>;
  now(): Date;
  onLock(): void;
}

function Workspace({ payload, createStore, now, onLock }: WorkspaceProps) {
  const [store, setStore] = useState<ProgressStore>();
  const [progress, setProgress] = useState(new Map<string, CardProgress>());
  const [dailyLimit, setDailyLimit] = useState<DailyLimit>(20);
  const [view, setView] = useState<View>("home");
  const [session, setSession] = useState<{ deck: Deck; queue: QueueItem[] }>();
  const [notice, setNotice] = useState<string>();
  const [storageError, setStorageError] = useState(false);

  const reloadProgress = useCallback(async (activeStore: ProgressStore) => {
    const [records, limit] = await Promise.all([
      activeStore.getAll(),
      activeStore.getDailyLimit(),
    ]);
    setProgress(new Map(records.map((record) => [record.cardId, record])));
    setDailyLimit(limit);
  }, []);

  useEffect(() => {
    let active = true;
    let openedStore: ProgressStore | undefined;
    void createStore()
      .then(async (nextStore) => {
        openedStore = nextStore;
        if (!active) {
          nextStore.close();
          return;
        }
        await reloadProgress(nextStore);
        if (active) {
          setStore(nextStore);
        }
      })
      .catch(() => {
        if (active) setStorageError(true);
      });
    return () => {
      active = false;
      openedStore?.close();
    };
  }, [createStore, reloadProgress]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [session, view]);

  function startSession(deck: Deck): void {
    const today = toLocalDateKey(now());
    const remaining = remainingDailyQuota(
      progress,
      new Set(payload.cards.map((card) => card.id)),
      today,
      dailyLimit,
    );
    if (remaining === 0) {
      setNotice(`今日 ${dailyLimit} 张已完成`);
      return;
    }
    const queue = buildDailyQueue({
      cards: payload.cards,
      progress,
      deck,
      limit: remaining,
      today,
    });
    if (queue.length === 0) {
      setNotice("当前题库今天没有可安排的卡片");
      return;
    }
    setNotice(undefined);
    setSession({ deck, queue });
  }

  function updateProgress(record: CardProgress): void {
    setProgress((current) => new Map(current).set(record.cardId, record));
  }

  if (storageError) {
    return (
      <main className="fatal-screen">
        <h1>本机存储不可用</h1>
        <p>请允许此站点使用浏览器存储后重试。题库仍保持锁定状态。</p>
        <button className="primary-button" onClick={onLock}>返回锁定页</button>
      </main>
    );
  }

  if (!store) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="loading-ring" />
        <p>正在读取本机进度…</p>
      </main>
    );
  }

  if (session) {
    return (
      <StudyScreen
        deck={session.deck}
        initialQueue={session.queue}
        progress={progress}
        store={store}
        now={now}
        onProgress={updateProgress}
        onExit={() => setSession(undefined)}
      />
    );
  }

  return (
    <div className="app-shell">
      <AppHeader buildId={payload.buildId} onLock={onLock} />
      {notice ? <p className="app-notice" role="status">{notice}</p> : null}
      {view === "home" ? (
        <Dashboard
          cards={payload.cards}
          progress={progress}
          today={toLocalDateKey(now())}
          onStart={startSession}
        />
      ) : null}
      {view === "browse" ? <BrowseScreen cards={payload.cards} progress={progress} /> : null}
      {view === "settings" ? (
        <SettingsScreen
          dailyLimit={dailyLimit}
          store={store}
          now={now}
          onDailyLimit={setDailyLimit}
          onProgressChanged={() => reloadProgress(store)}
          onLock={onLock}
        />
      ) : null}
      <BottomNavigation view={view} onView={setView} />
    </div>
  );
}

export function App({
  unlockCards = loadEncryptedCards,
  createStore = createProgressStore,
  now = () => new Date(),
}: AppProps) {
  const [payload, setPayload] = useState<ParsedCardsPayload>();

  async function unlock(password: string): Promise<void> {
    try {
      setPayload(await unlockCards(password));
    } catch (error) {
      if (error instanceof CardBankUnavailableError) {
        throw error;
      }
      throw new UnlockError();
    }
  }

  if (!payload) {
    return <UnlockScreen onUnlock={unlock} />;
  }

  return (
    <Workspace
      key={payload.buildId}
      payload={payload}
      createStore={createStore}
      now={now}
      onLock={() => setPayload(undefined)}
    />
  );
}
