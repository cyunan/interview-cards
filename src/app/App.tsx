import { useEffect, useState } from "react";
import type { ParsedCardsPayload } from "../content/payload";
import { UnlockError } from "../crypto/envelope";
import type { DecryptedCardsSession } from "./load-cards";
import { withoutHash } from "./navigation-history";
import {
  CardBankUnavailableError,
  loadEncryptedCardsSession,
  restoreRememberedCards as restoreRememberedCardsDefault,
} from "./load-cards";
import { ReadingWorkspace } from "./ReadingWorkspace";
import { UnlockScreen } from "./UnlockScreen";
import {
  createRememberedUnlockStore as createRememberedUnlockStoreDefault,
  type RememberedUnlockStore,
} from "../security/remembered-unlock";

export interface AppProps {
  unlockCards?: (password: string) => Promise<ParsedCardsPayload | DecryptedCardsSession>;
  createRememberedUnlockStore?: () => Promise<RememberedUnlockStore>;
  restoreRememberedCards?: (store: RememberedUnlockStore) => Promise<ParsedCardsPayload | undefined>;
}

export { ReadingWorkspace as ContentWorkspace };

export function App({
  unlockCards = loadEncryptedCardsSession,
  createRememberedUnlockStore = createRememberedUnlockStoreDefault,
  restoreRememberedCards = restoreRememberedCardsDefault,
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
    window.history.replaceState(null, "", withoutHash());
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
    <ReadingWorkspace
      key={payload.buildId}
      payload={payload}
      onLock={lock}
    />
  );
}

function isDecryptedCardsSession(
  value: ParsedCardsPayload | DecryptedCardsSession,
): value is DecryptedCardsSession {
  return "payload" in value && "key" in value && "envelope" in value;
}
