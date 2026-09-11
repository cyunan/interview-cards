import { useCallback, useEffect, useState } from "react";

import type { ParsedCardsPayload } from "../content/payload";
import { UnlockError } from "../crypto/envelope";
import type { DecryptedCardsSession } from "./load-cards";
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
import { RouteScreen } from "./RouteScreen";
import { resolveRouteCards, type KnowledgeRoute } from "../routes/routes";
import {
  CardBankUnavailableError,
  loadEncryptedCardsSession,
  restoreRememberedCards as restoreRememberedCardsDefault,
} from "./load-cards";
import { SettingsScreen } from "./SettingsScreen";
import { StudyScreen } from "./StudyScreen";
import { UnlockScreen } from "./UnlockScreen";
import {
  createRememberedUnlockStore as createRememberedUnlockStoreDefault,
  type RememberedUnlockStore,
} from "../security/remembered-unlock";

type View = "home" | "routes" | "browse" | "settings";

export interface AppProps {
  unlockCards?: (password: string) => Promise<ParsedCardsPayload | DecryptedCardsSession>;
  createStore?: () => Promise<ProgressStore>;
  createRememberedUnlockStore?: () => Promise<RememberedUnlockStore>;
  restoreRememberedCards?: (store: RememberedUnlockStore) => Promise<ParsedCardsPayload | undefined>;
  now?: () => Date;
}

function AppHeader({ onLock }: { onLock(): void }) {
  return (
    <header className="app-header">
      <div className="mini-brand">
        <div className="mini-mark" aria-hidden="true"><span /><span /><span /></div>
        <div>
          <strong>面试卡片</strong>
        </div>
      </div>
      <button className="lock-button" type="button" onClick={onLock}>
        <span aria-hidden="true">◇</span> 锁定
      </button>
    </header>
  );
}

function MainNavigation({ view, onView }: { view: View; onView(view: View): void }) {
  return (
    <nav className="main-nav" aria-label="主导航">
      <button aria-current={view === "home" ? "page" : undefined} onClick={() => onView("home")}>
        <span aria-hidden="true">⌂</span><small>首页</small>
      </button>
      <button aria-current={view === "browse" ? "page" : undefined} onClick={() => onView("browse")}>
        <span aria-hidden="true">▤</span><small>浏览</small>
      </button>
      <button aria-current={view === "routes" ? "page" : undefined} onClick={() => onView("routes")}>
        <span aria-hidden="true">↗</span><small>路线</small>
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
  const [selectedRouteId, setSelectedRouteId] = useState<string>();
  const [session, setSession] = useState<{
    deck: Deck;
    queue: QueueItem[];
    returnView: View;
    label?: string;
  }>();
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
        await nextStore.migrateLegacyIds(payload.cards);
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
    setSession({ deck, queue, returnView: view });
  }

  function startRouteStep(route: KnowledgeRoute, stepIndex: number): void {
    const step = route.steps[stepIndex];
    if (!step) return;
    const routeCards = resolveRouteCards(step, payload.cards);
    if (routeCards.length === 0) {
      setNotice("当前阶段暂未找到可练习的卡片，请先更新题库");
      return;
    }
    setNotice(undefined);
    setSelectedRouteId(route.id);
    setView("routes");
    setSession({
      deck: "full",
      queue: routeCards.map((card) => ({
        card,
        kind: progress.has(card.id) ? "review" : "new",
      })),
      returnView: "routes",
      label: "路线练习",
    });
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
        deckLabel={session.label}
        returnLabel={session.returnView === "routes" ? "路线" : "首页"}
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
      <AppHeader onLock={onLock} />
      <MainNavigation view={view} onView={setView} />
      <div className="app-content">
        {notice ? <p className="app-notice" role="status">{notice}</p> : null}
        {view === "home" ? (
          <Dashboard
            cards={payload.cards}
            progress={progress}
            today={toLocalDateKey(now())}
            onStart={startSession}
            onOpenRoutes={() => {
              setSelectedRouteId(undefined);
              setView("routes");
            }}
          />
        ) : null}
        {view === "routes" ? (
          <RouteScreen
            cards={payload.cards}
            progress={progress}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            onPractice={startRouteStep}
          />
        ) : null}
        {view === "browse" ? <BrowseScreen cards={payload.cards} progress={progress} /> : null}
        {view === "settings" ? (
          <SettingsScreen
            buildId={payload.buildId}
            cards={payload.cards}
            dailyLimit={dailyLimit}
            store={store}
            now={now}
            onDailyLimit={setDailyLimit}
            onProgressChanged={() => reloadProgress(store)}
            onLock={onLock}
          />
        ) : null}
      </div>
    </div>
  );
}

export function App({
  unlockCards = loadEncryptedCardsSession,
  createStore = createProgressStore,
  createRememberedUnlockStore = createRememberedUnlockStoreDefault,
  restoreRememberedCards = restoreRememberedCardsDefault,
  now = () => new Date(),
}: AppProps) {
  const [payload, setPayload] = useState<ParsedCardsPayload>();
  const [rememberedStore, setRememberedStore] = useState<RememberedUnlockStore>();
  const [checkingRemembered, setCheckingRemembered] = useState(true);

  useEffect(() => {
    let active = true;
    let openedStore: RememberedUnlockStore | undefined;

    void createRememberedUnlockStore()
      .then(async (store) => {
        openedStore = store;
        let restored: ParsedCardsPayload | undefined;
        try {
          restored = await restoreRememberedCards(store);
        } catch {
          // An unavailable or malformed remembered record must degrade to the
          // normal password screen without exposing storage details.
        }
        if (!active) {
          store.close();
          return;
        }
        setRememberedStore(store);
        if (restored) setPayload(restored);
        setCheckingRemembered(false);
      })
      .catch(() => {
        if (active) setCheckingRemembered(false);
      });

    return () => {
      active = false;
      openedStore?.close();
    };
  }, [createRememberedUnlockStore, restoreRememberedCards]);

  async function unlock(password: string, rememberDevice: boolean): Promise<void> {
    try {
      const result = await unlockCards(password);
      const session = isDecryptedCardsSession(result) ? result : undefined;
      const nextPayload: ParsedCardsPayload = isDecryptedCardsSession(result)
        ? result.payload
        : result;
      setPayload(nextPayload);

      if (rememberedStore) {
        try {
          if (rememberDevice && session) {
            await rememberedStore.put({
              buildId: session.envelope.buildId,
              salt: session.envelope.kdf.salt,
              key: session.key,
              savedAt: new Date().toISOString(),
            });
          } else if (!rememberDevice) {
            await rememberedStore.clear();
          }
        } catch {
          // Remembering the device is optional; a storage failure must not
          // block a valid password unlock.
        }
      }
    } catch (error) {
      if (error instanceof CardBankUnavailableError) {
        throw error;
      }
      throw new UnlockError();
    }
  }

  function lock(): void {
    setPayload(undefined);
    void rememberedStore?.clear().catch(() => undefined);
  }

  if (checkingRemembered) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="loading-ring" />
        <p>正在检查本机解锁…</p>
      </main>
    );
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
      onLock={lock}
    />
  );
}

function isDecryptedCardsSession(
  value: ParsedCardsPayload | DecryptedCardsSession,
): value is DecryptedCardsSession {
  return "payload" in value && "key" in value && "envelope" in value;
}
