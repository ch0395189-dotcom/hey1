// Detecta códigos de verificación (OTP) en mensajes de WhatsApp
// Soporta español e inglés y formatos comunes: "código: 123456",
// "Your code is 123-456", "G-123456" (Google), etc.

const KEYWORDS = [
  "código", "codigo", "code", "otp", "pin",
  "verificación", "verificacion", "verification",
  "confirmación", "confirmacion", "confirmation",
  "contraseña de un solo uso", "one-time", "one time",
  "acceso", "ingreso", "login", "iniciar sesión", "iniciar sesion",
  "autenticación", "autenticacion", "autentica",
];

/**
 * Devuelve el código detectado si el mensaje parece un OTP, o null.
 * Considera el contenido OTP cuando incluye una palabra clave + un código
 * de 4 a 8 dígitos (permitiendo un guion intermedio), o un patrón G-NNNNNN.
 */
export function detectOTP(content: string | null | undefined): string | null {
  if (!content) return null;
  const text = content.toLowerCase();

  // Google-style: G-123456
  const gMatch = content.match(/\bG-(\d{4,8})\b/);
  if (gMatch) return gMatch[1];

  const hasKeyword = KEYWORDS.some((k) => text.includes(k));
  if (!hasKeyword) return null;

  // Código de 4-8 dígitos, opcionalmente con un guion o espacio en medio
  const codeMatch = content.match(/\b(\d{3,4}[-\s]?\d{3,4}|\d{4,8})\b/);
  if (!codeMatch) return null;
  return codeMatch[1].replace(/[-\s]/g, "");
}
