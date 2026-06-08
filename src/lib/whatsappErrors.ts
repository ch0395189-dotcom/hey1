// Mapeo de códigos de error comunes de la WhatsApp Cloud API (Meta)
// a mensajes claros para el usuario final.

export interface MetaErrorLike {
  code?: number;
  message?: string;
  error_subcode?: number;
  error_data?: { details?: string };
}

const FRIENDLY_BY_CODE: Record<number, string> = {
  131037:
    "Tu número de WhatsApp aún no tiene aprobado el nombre comercial (display name) en Meta. Entra a WhatsApp Manager → Configuración del número y solicita la aprobación del nombre antes de enviar mensajes.",
  131047:
    "Han pasado más de 24 horas desde el último mensaje del cliente. Por las reglas de Meta debes usar una plantilla aprobada para reabrir la conversación.",
  131051:
    "Tipo de mensaje no soportado por WhatsApp para este destinatario.",
  131052:
    "El archivo multimedia no se pudo descargar. Verifica que la URL sea pública y accesible.",
  131053:
    "El archivo multimedia no pudo ser subido a WhatsApp. Verifica el formato y el tamaño (máx. 16MB).",
  131056:
    "Demasiados mensajes a este número en poco tiempo. Espera unos minutos antes de reintentar.",
  131026:
    "El número de destino no está disponible en WhatsApp o no puede recibir mensajes.",
  131031:
    "La cuenta de WhatsApp Business está bloqueada por Meta. Revisa tu Business Manager.",
  133010:
    "El número aún no está registrado en la WhatsApp Cloud API. Vuelve a conectar la cuenta desde Configuración.",
  368:
    "Meta restringió temporalmente tu cuenta por políticas de WhatsApp. Revisa tu Business Manager.",
  190:
    "El token de acceso de WhatsApp expiró. Reconecta tu cuenta de WhatsApp en Configuración.",
  10:
    "Permisos insuficientes en tu cuenta de WhatsApp. Reconéctala desde Configuración.",
  100:
    "Parámetro inválido enviado a WhatsApp. Verifica el contenido del mensaje.",
};

/**
 * Devuelve un mensaje amigable en español dado el cuerpo de error que retorna
 * la edge function `whatsapp-send-message` (que reenvía `error.message` y
 * `details` provenientes de Meta).
 */
export function getFriendlyWhatsappError(
  data: { error?: string; message?: string; details?: MetaErrorLike } | null | undefined,
  fallback = "No se pudo enviar el mensaje."
): string {
  if (!data) return fallback;
  const code = data.details?.code;
  if (code && FRIENDLY_BY_CODE[code]) return FRIENDLY_BY_CODE[code];

  const raw = (data.message || data.details?.message || data.error || "").toString();
  const lowered = raw.toLowerCase();
  if (lowered.includes('business account locked') || lowered.includes('failed_131031')) {
    return FRIENDLY_BY_CODE[131031];
  }
  // Intentar extraer (#NNNN) del mensaje crudo si Meta lo incluye
  const match = raw.match(/\(#(\d+)\)|failed_(\d+)/);
  if (match) {
    const parsed = Number(match[1] || match[2]);
    if (FRIENDLY_BY_CODE[parsed]) return FRIENDLY_BY_CODE[parsed];
  }
  return raw || fallback;
}