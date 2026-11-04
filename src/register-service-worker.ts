import type { RegisterSWOptions } from "vite-plugin-pwa/types";

export type ServiceWorkerRegistrar = (options?: RegisterSWOptions) => unknown;

const WORKER_ACTIVATION_TIMEOUT_MS = 20_000;
let appRegistration: ServiceWorkerRegistration | undefined;

function waitForActivation(worker: ServiceWorker): Promise<void> {
  if (worker.state === "activated") return Promise.resolve();
  if (worker.state === "redundant") return Promise.reject(new Error("网页更新安装失败"));

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.removeEventListener("statechange", onStateChange);
      reject(new Error("网页更新安装超时，请检查网络后重试"));
    }, WORKER_ACTIVATION_TIMEOUT_MS);
    const onStateChange = () => {
      if (worker.state === "activated") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", onStateChange);
        resolve();
      } else if (worker.state === "redundant") {
        window.clearTimeout(timeout);
        worker.removeEventListener("statechange", onStateChange);
        reject(new Error("网页更新安装失败"));
      }
    };
    worker.addEventListener("statechange", onStateChange);
    onStateChange();
  });
}

/**
 * Keep a live session in memory when a new worker takes control.
 *
 * The app deliberately never persists the decryption password. A worker
 * update must therefore wait for the next user navigation/reload instead of
 * forcing one in the middle of a session.
 */
export function registerAppServiceWorker(
  register: ServiceWorkerRegistrar,
): void {
  register({
    immediate: true,
    onNeedReload: () => undefined,
    onRegisteredSW: (_scriptUrl, registration) => {
      appRegistration = registration;
    },
  });
}

/** Check for a new service worker, wait for it to activate, then reload. */
export async function forceRefreshLatestResources(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    window.location.reload();
    return;
  }

  const scope = new URL(import.meta.env.BASE_URL, window.location.origin).href;
  const registration = appRegistration?.scope === scope
    ? appRegistration
    : await navigator.serviceWorker.getRegistration(scope);

  if (!registration) {
    window.location.reload();
    return;
  }

  let installing = registration.installing ?? undefined;
  const onUpdateFound = () => {
    installing = registration.installing ?? installing;
  };
  registration.addEventListener("updatefound", onUpdateFound, { once: true });
  try {
    await registration.update();
  } finally {
    registration.removeEventListener("updatefound", onUpdateFound);
  }

  installing ??= registration.installing ?? undefined;
  if (installing) await waitForActivation(installing);

  const waiting = registration.waiting;
  if (waiting) {
    waiting.postMessage({ type: "SKIP_WAITING" });
    await waitForActivation(waiting);
  }

  window.location.reload();
}
