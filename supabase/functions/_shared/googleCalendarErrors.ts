// Mapeo central de errores de Google Calendar a códigos y mensajes claros en español.

export type GoogleCalendarErrorCode =
  | "not_connected"
  | "auth_expired"
  | "missing_scope"
  | "rate_limited"
  | "calendar_not_found"
  | "invalid_request"
  | "provider_unavailable"
  | "network_error"
  | "unknown_error";

export interface GoogleCalendarError {
  error_code: GoogleCalendarErrorCode;
  message: string;
  hint: string;
  requires_reconnect: boolean;
  retryable: boolean;
  status?: number;
  details?: string;
}

const MESSAGES: Record<GoogleCalendarErrorCode, { message: string; hint: string; requires_reconnect: boolean; retryable: boolean }> = {
  not_connected: {
    message: "No hay una cuenta de Google Calendar conectada.",
    hint: "Conecta tu cuenta de Google desde la pestaña Citas para sincronizar la disponibilidad y las citas.",
    requires_reconnect: true,
    retryable: false,
  },
  auth_expired: {
    message: "El permiso con Google Calendar expiró o fue revocado.",
    hint: "Vuelve a conectar tu cuenta de Google para restablecer la sincronización.",
    requires_reconnect: true,
    retryable: false,
  },
  missing_scope: {
    message: "Faltan permisos de Google Calendar para leer o crear eventos.",
    hint: "Reconecta tu cuenta y acepta todos los permisos de calendario solicitados.",
    requires_reconnect: true,
    retryable: false,
  },
  rate_limited: {
    message: "Google Calendar recibió demasiadas solicitudes en poco tiempo.",
    hint: "Espera unos segundos e inténtalo de nuevo.",
    requires_reconnect: false,
    retryable: true,
  },
  calendar_not_found: {
    message: "No se encontró el calendario principal de la cuenta conectada.",
    hint: "Verifica que la cuenta de Google conectada tenga un calendario activo.",
    requires_reconnect: true,
    retryable: false,
  },
  invalid_request: {
    message: "Google rechazó los datos de la cita (fecha u hora inválidas).",
    hint: "Revisa el formato de fecha (dd/mm/aaaa) y hora (HH:mm) configurado en el bot.",
    requires_reconnect: false,
    retryable: false,
  },
  provider_unavailable: {
    message: "Google Calendar no está disponible en este momento.",
    hint: "Es un problema temporal de Google. Reintenta en unos minutos.",
    requires_reconnect: false,
    retryable: true,
  },
  network_error: {
    message: "No se pudo contactar a Google Calendar.",
    hint: "Revisa la conexión e inténtalo de nuevo.",
    requires_reconnect: false,
    retryable: true,
  },
  unknown_error: {
    message: "Ocurrió un error inesperado con Google Calendar.",
    hint: "Reintenta; si persiste, desconecta y vuelve a conectar la cuenta.",
    requires_reconnect: false,
    retryable: true,
  },
};

export function buildError(code: GoogleCalendarErrorCode, extra?: { status?: number; details?: string }): GoogleCalendarError {
  return { error_code: code, ...MESSAGES[code], ...extra };
}

/** Traduce una respuesta HTTP fallida del gateway/Google a un error estructurado. */
export function mapProviderError(status: number, body: string): GoogleCalendarError {
  const lower = (body || "").toLowerCase();
  let code: GoogleCalendarErrorCode = "unknown_error";

  if (status === 401 || lower.includes("invalid_grant") || lower.includes("invalid credentials")) {
    code = "auth_expired";
  } else if (status === 403) {
    code = lower.includes("rate") || lower.includes("quota") ? "rate_limited" : "missing_scope";
  } else if (status === 404) {
    code = "calendar_not_found";
  } else if (status === 400 || status === 422) {
    code = "invalid_request";
  } else if (status === 429) {
    code = "rate_limited";
  } else if (status >= 500) {
    code = "provider_unavailable";
  }

  return buildError(code, { status, details: body?.slice(0, 500) });
}

/** Traduce una excepción (fetch/red) a un error estructurado. */
export function mapThrownError(err: unknown): GoogleCalendarError {
  const msg = err instanceof Error ? err.message : String(err);
  const isNetwork = /fetch|network|timeout|abort|dns|ecconn/i.test(msg);
  return buildError(isNetwork ? "network_error" : "unknown_error", { details: msg.slice(0, 500) });
}
