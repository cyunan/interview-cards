import type { RegisterSWOptions } from "vite-plugin-pwa/types";

export type ServiceWorkerRegistrar = (options?: RegisterSWOptions) => unknown;

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
  });
}
