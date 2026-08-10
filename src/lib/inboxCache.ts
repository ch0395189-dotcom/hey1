/**
 * Caché local de la bandeja (localStorage).
 *
 * Objetivo: que al reabrir la app (APK o navegador) la lista de
 * conversaciones, el chat seleccionado y sus mensajes aparezcan al instante,
 * en lugar de "reiniciarse" mientras se vuelve a consultar el backend.
 * Los datos del backend siguen siendo la fuente de verdad: la caché solo
 * pinta el estado anterior y se sobrescribe en cuanto llega la respuesta.
 */

const PREFIX = "heyhey-inbox-cache:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const MAX_CONVERSATIONS = 300;
const MAX_MESSAGES = 150;
const MAX_MESSAGE_THREADS = 15;

interface CacheEnvelope<T> {
  savedAt: number;
  data: T;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function write<T>(key: string, data: T): void {
  try {
    localStorage.setItem(
      PREFIX + key,
      JSON.stringify({ savedAt: Date.now(), data } satisfies CacheEnvelope<T>)
    );
  } catch {
    // Cuota llena: limpiamos hilos de mensajes viejos y lo intentamos una vez.
    try {
      pruneMessageThreads(0);
      localStorage.setItem(
        PREFIX + key,
        JSON.stringify({ savedAt: Date.now(), data } satisfies CacheEnvelope<T>)
      );
    } catch {
      /* noop */
    }
  }
}

/* ---------------- Lista de conversaciones ---------------- */

export function conversationsCacheKey(parts: {
  viewMode: string;
  platform: string;
  accountId?: string;
}): string {
  return `conversations:${parts.viewMode}:${parts.platform}:${parts.accountId || "all"}`;
}

export function getCachedConversations<T>(key: string): T[] | null {
  const data = read<T[]>(key);
  return Array.isArray(data) ? data : null;
}

export function setCachedConversations<T>(key: string, conversations: T[]): void {
  write(key, conversations.slice(0, MAX_CONVERSATIONS));
}

/* ---------------- Conversación seleccionada ---------------- */

const SELECTED_KEY = "selected-conversation";

export function getCachedSelectedConversation<T>(id: string): T | null {
  const data = read<{ id?: string } & Record<string, unknown>>(SELECTED_KEY);
  if (!data || data.id !== id) return null;
  return data as unknown as T;
}

export function setCachedSelectedConversation(conversation: unknown | null): void {
  if (!conversation) {
    try {
      localStorage.removeItem(PREFIX + SELECTED_KEY);
    } catch {
      /* noop */
    }
    return;
  }
  write(SELECTED_KEY, conversation);
}

/* ---------------- Mensajes por conversación ---------------- */

function messagesKey(conversationId: string): string {
  return `messages:${conversationId}`;
}

export function getCachedMessages<T>(conversationId: string): T[] | null {
  const data = read<T[]>(messagesKey(conversationId));
  return Array.isArray(data) ? data : null;
}

export function setCachedMessages<T>(conversationId: string, messages: T[]): void {
  write(messagesKey(conversationId), messages.slice(-MAX_MESSAGES));
  pruneMessageThreads(MAX_MESSAGE_THREADS);
}

/** Conserva solo los N hilos de mensajes más recientes. */
function pruneMessageThreads(keep: number): void {
  try {
    const entries: { key: string; savedAt: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX + "messages:")) continue;
      let savedAt = 0;
      try {
        savedAt = (JSON.parse(localStorage.getItem(k) || "{}") as CacheEnvelope<unknown>).savedAt || 0;
      } catch {
        /* noop */
      }
      entries.push({ key: k, savedAt });
    }
    entries
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(keep)
      .forEach((e) => localStorage.removeItem(e.key));
  } catch {
    /* noop */
  }
}

/** Borra toda la caché de bandeja (por ejemplo, al cerrar sesión). */
export function clearInboxCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* noop */
  }
}
