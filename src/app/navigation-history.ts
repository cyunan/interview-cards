export type AppView = "home" | "routes" | "browse" | "settings";

export type AppHistoryLayer = "reference-catalog" | "reference";

export interface AppHistoryState {
  app: "interview-cards";
  view: AppView;
  routeId?: string;
  layer?: AppHistoryLayer;
  referenceId?: string;
}

export const APP_HISTORY_KEY = "interview-cards" as const;

export function isAppHistoryState(value: unknown): value is AppHistoryState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppHistoryState>;
  return candidate.app === APP_HISTORY_KEY && (
    candidate.view === "home" ||
    candidate.view === "routes" ||
    candidate.view === "browse" ||
    candidate.view === "settings"
  );
}

export function currentAppHistoryState(): AppHistoryState | undefined {
  return isAppHistoryState(window.history.state) ? window.history.state : undefined;
}

export function pushAppHistoryState(
  patch: Partial<Omit<AppHistoryState, "app">> & Pick<AppHistoryState, "view">,
  url = window.location.href,
): AppHistoryState {
  const next: AppHistoryState = {
    ...(currentAppHistoryState() ?? { app: APP_HISTORY_KEY, view: "home" }),
    ...patch,
    app: APP_HISTORY_KEY,
  };
  window.history.pushState(next, "", url);
  return next;
}

export function replaceAppHistoryState(
  patch: Partial<Omit<AppHistoryState, "app">> & Pick<AppHistoryState, "view">,
  url = window.location.href,
): AppHistoryState {
  const next: AppHistoryState = {
    ...(currentAppHistoryState() ?? { app: APP_HISTORY_KEY, view: "home" }),
    ...patch,
    app: APP_HISTORY_KEY,
  };
  window.history.replaceState(next, "", url);
  return next;
}

export function withoutHash(): string {
  const url = new URL(window.location.href);
  url.hash = "";
  return `${url.pathname}${url.search}`;
}
