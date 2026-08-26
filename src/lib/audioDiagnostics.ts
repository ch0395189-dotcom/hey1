/**
 * Lightweight client-side diagnostics for WhatsApp audio sending.
 * Records, per send attempt: original format/size, conversion result,
 * real detected container, upload info, retries and the exact error.
 */

export type AudioDiagStatus = "running" | "success" | "error";

export interface AudioDiagStep {
  at: number;
  label: string;
  detail?: string;
  ok: boolean;
}

export interface AudioDiagAttempt {
  id: string;
  startedAt: number;
  endedAt?: number;
  status: AudioDiagStatus;
  source: string; // "grabación", "archivo adjunto", "voz clonada"...
  conversationId?: string;
  originalType?: string;
  originalSize?: number;
  convertedSize?: number;
  container?: string;
  mime?: string;
  extension?: string;
  converted?: boolean;
  retries: number;
  transport?: string; // meta / external
  error?: string;
  steps: AudioDiagStep[];
}

const STORAGE_KEY = "heyhey.audioDiagnostics.v1";
const MAX_ATTEMPTS = 25;

let attempts: AudioDiagAttempt[] = load();
const listeners = new Set<(a: AudioDiagAttempt[]) => void>();

function load(): AudioDiagAttempt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AudioDiagAttempt[]) : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts.slice(0, MAX_ATTEMPTS)));
  } catch {
    /* storage full or unavailable */
  }
  listeners.forEach((l) => l(attempts));
}

export function getAudioDiagnostics(): AudioDiagAttempt[] {
  return attempts;
}

export function subscribeAudioDiagnostics(fn: (a: AudioDiagAttempt[]) => void): () => void {
  listeners.add(fn);
  fn(attempts);
  return () => listeners.delete(fn);
}

export function clearAudioDiagnostics() {
  attempts = [];
  persist();
}

export interface AudioDiagHandle {
  id: string;
  step: (label: string, ok?: boolean, detail?: string) => void;
  update: (patch: Partial<AudioDiagAttempt>) => void;
  retry: () => void;
  success: (detail?: string) => void;
  fail: (error: unknown) => void;
}

export function startAudioDiagnostic(
  source: string,
  init: Partial<AudioDiagAttempt> = {},
): AudioDiagHandle {
  const attempt: AudioDiagAttempt = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    startedAt: Date.now(),
    status: "running",
    source,
    retries: 0,
    steps: [],
    ...init,
  };
  attempts = [attempt, ...attempts].slice(0, MAX_ATTEMPTS);
  persist();

  const find = () => attempts.find((a) => a.id === attempt.id);

  return {
    id: attempt.id,
    step(label, ok = true, detail) {
      const a = find();
      if (!a) return;
      a.steps.push({ at: Date.now(), label, ok, detail });
      persist();
    },
    update(patch) {
      const a = find();
      if (!a) return;
      Object.assign(a, patch);
      persist();
    },
    retry() {
      const a = find();
      if (!a) return;
      a.retries += 1;
      a.steps.push({ at: Date.now(), label: `Reintento #${a.retries}`, ok: true });
      persist();
    },
    success(detail) {
      const a = find();
      if (!a) return;
      a.status = "success";
      a.endedAt = Date.now();
      if (detail) a.steps.push({ at: Date.now(), label: detail, ok: true });
      persist();
    },
    fail(error) {
      const a = find();
      if (!a) return;
      a.status = "error";
      a.endedAt = Date.now();
      a.error = error instanceof Error ? error.message : String(error ?? "Error desconocido");
      a.steps.push({ at: Date.now(), label: "Fallo", ok: false, detail: a.error });
      persist();
    },
  };
}

export function formatBytes(bytes?: number): string {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
