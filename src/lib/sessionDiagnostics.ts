/**
 * Session diagnostics ring buffer.
 *
 * Records session lifecycle events (persist / hydrate / refresh / expire /
 * signed-out) so we can inspect what happened on the APK when a user
 * reports "me sacó la sesión". The buffer is kept in localStorage (which,
 * inside the Capacitor WebView, sits on top of the app's private storage)
 * so it survives navigations and restarts of the WebView within the same
 * install.
 *
 * Web builds also record — the panel just isn't shown outside of native.
 */

export type SessionEventType =
  | "boot"
  | "hydrate"
  | "persist"
  | "mirror-remove-ignored"
  | "mirror-clear-ignored"
  | "clear-backup"
  | "signed-in"
  | "initial-session"
  | "no-initial-session"
  | "recovered"
  | "recovery-failed"
  | "token-refreshed"
  | "refresh-error"
  | "expiring-soon"
  | "expired"
  | "signed-out-explicit"
  | "signed-out-spurious"
  | "native-restore"
  | "visibility-check"
  | "online-check";

export interface SessionEvent {
  ts: number;
  type: SessionEventType;
  detail?: string;
  meta?: Record<string, unknown>;
}

const STORAGE_KEY = "heyhey-session-diagnostics";
const MAX_EVENTS = 250;
const listeners = new Set<() => void>();

function safeRead(): SessionEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SessionEvent[];
  } catch {
    return [];
  }
}

function safeWrite(events: SessionEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {}
}

export function logSessionEvent(
  type: SessionEventType,
  detail?: string,
  meta?: Record<string, unknown>
): void {
  const evt: SessionEvent = { ts: Date.now(), type, detail, meta };
  const events = safeRead();
  events.push(evt);
  safeWrite(events);
  try {
    // Also log to console so `adb logcat` / DevTools captures it.
    // eslint-disable-next-line no-console
    console.log(`[SessionDiag] ${type}${detail ? " " + detail : ""}`, meta ?? "");
  } catch {}
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
}

export function getSessionEvents(): SessionEvent[] {
  return safeRead();
}

export function clearSessionEvents(): void {
  safeWrite([]);
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
}

export function subscribeSessionEvents(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function formatSessionEvents(events: SessionEvent[]): string {
  return events
    .map((e) => {
      const stamp = new Date(e.ts).toISOString();
      const meta = e.meta ? " " + JSON.stringify(e.meta) : "";
      return `${stamp} ${e.type}${e.detail ? " — " + e.detail : ""}${meta}`;
    })
    .join("\n");
}