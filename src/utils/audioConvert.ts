/**
 * Audio pipeline for WhatsApp — deterministic, 100% local.
 *
 * Historia: antes dependíamos de ffmpeg.wasm descargado desde un CDN para
 * convertir WebM → OGG/Opus. Eso fallaba de forma intermitente (CDN bloqueado,
 * falta de SharedArrayBuffer/COOP-COEP, WebViews del APK, iOS) y por eso los
 * audios "a veces salían y a veces no".
 *
 * Solución de raíz: nunca dependemos de la red ni de wasm. Decodificamos la
 * grabación con la Web Audio API (disponible en todos los navegadores y
 * WebViews) y la re-codificamos a MP3 con lamejs (JS puro). MP3 (`audio/mpeg`)
 * es un formato de primera clase para WhatsApp Cloud API y se reproduce en
 * todos los dispositivos.
 */

/** Formatos que Meta acepta y reproduce sin problemas. */
const SAFE_CONTAINERS = new Set(['mp3', 'ogg', 'amr']);

export async function isRealOggContainer(input: Blob): Promise<boolean> {
  const header = new Uint8Array(await input.slice(0, 4).arrayBuffer());
  return header[0] === 0x4f && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53; // OggS
}

/**
 * Un OGG sin su página de cabecera (`OpusHead`) es basura para Meta: la API
 * responde 131053 "Media upload error" y el audio nunca llega. Validamos que
 * la primera página sea BOS y contenga OpusHead antes de enviar.
 */
export async function isPlayableOggOpus(input: Blob): Promise<boolean> {
  const head = new Uint8Array(await input.slice(0, 128).arrayBuffer());
  if (head.length < 32) return false;
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...Array.from(head.slice(start, start + len)));
  if (ascii(0, 4) !== 'OggS') return false;
  if ((head[5] & 0x02) !== 0x02) return false; // primera página debe ser BOS
  return ascii(0, 128).includes('OpusHead');
}

/**
 * Detecta el contenedor REAL leyendo los magic bytes. Nunca confiamos en
 * `blob.type`: varios navegadores móviles mienten y subir un WebM/MP4
 * etiquetado como `audio/ogg` hace que WhatsApp entregue una nota de voz rota.
 */
export async function sniffAudioContainer(
  input: Blob
): Promise<{ container: 'ogg' | 'webm' | 'mp4' | 'mp3' | 'amr' | 'unknown'; ext: string; mime: string }> {
  const head = new Uint8Array(await input.slice(0, 16).arrayBuffer());
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...Array.from(head.slice(start, start + len)));

  if (ascii(0, 4) === 'OggS') return { container: 'ogg', ext: 'ogg', mime: 'audio/ogg' };
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3)
    return { container: 'webm', ext: 'webm', mime: 'audio/webm' };
  if (ascii(4, 4) === 'ftyp') return { container: 'mp4', ext: 'm4a', mime: 'audio/mp4' };
  if (ascii(0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0))
    return { container: 'mp3', ext: 'mp3', mime: 'audio/mpeg' };
  if (ascii(0, 5) === '#!AMR') return { container: 'amr', ext: 'amr', mime: 'audio/amr' };
  return { container: 'unknown', ext: 'ogg', mime: input.type || 'audio/ogg' };
}

/**
 * Precalienta el codificador MP3 (import dinámico) para que el primer envío
 * no pague el costo de descarga del chunk. Es un no-op tras la primera vez.
 */
export function preloadAudioEncoder(): void {
  if (typeof window === 'undefined') return;
  import('./mp3Encode').catch(() => {
    /* se reintenta al usarlo de verdad */
  });
}

/** Alias retrocompatible. */
export const preloadFFmpeg = preloadAudioEncoder;

/**
 * Convierte cualquier blob de audio a MP3 mono reproducible por WhatsApp.
 * No usa red ni wasm: Web Audio API + lamejs.
 */
export async function convertToWhatsAppAudio(input: Blob): Promise<Blob> {
  const { encodeBlobToMp3 } = await import('./mp3Encode');
  return encodeBlobToMp3(input);
}

/** Alias retrocompatible (ya no produce OGG; produce MP3 válido). */
export const convertToOggOpus = convertToWhatsAppAudio;

/**
 * Convierte un audio (ej. TTS de voz clonada en MP3) al formato exacto de una
 * nota de voz de WhatsApp: OGG/Opus mono 48 kHz. Así el mensaje llega con la
 * burbuja de nota de voz y no como archivo adjunto.
 */
export async function prepareVoiceNoteForWhatsApp(input: Blob): Promise<Blob> {
  if (!input || input.size === 0) throw new Error('El audio está vacío.');

  if (await isPlayableOggOpus(input)) return input;

  // Si el blob dice ser OGG pero no tiene cabecera OpusHead, NO se puede
  // enviar: Meta lo rechaza con 131053. Lo re-codificamos a MP3.
  const looksLikeBrokenOgg = await isRealOggContainer(input);

  try {
    const { encodeBlobToOggOpus } = await import('./oggOpusEncode');
    const ogg = await encodeBlobToOggOpus(input);
    if (!(await isPlayableOggOpus(ogg))) throw new Error('OGG sin cabecera OpusHead');
    return ogg;
  } catch (err) {
    console.warn('[audioConvert] OGG/Opus encode failed, falling back to MP3:', err);
    try {
      const mp3 = await convertToWhatsAppAudio(input);
      const sniffed = await sniffAudioContainer(mp3);
      if (sniffed.container === 'mp3') return mp3;
    } catch (mp3Err) {
      console.warn('[audioConvert] MP3 fallback failed:', mp3Err);
    }
    if (looksLikeBrokenOgg) {
      throw new Error('No se pudo preparar el audio para WhatsApp. Intenta grabarlo de nuevo.');
    }
    return input;
  }
}

/**
 * Prepara una grabación del micrófono para enviarla por WhatsApp.
 * Siempre devuelve un contenedor que Meta puede decodificar.
 */
export async function prepareRecordedAudioForWhatsApp(input: Blob): Promise<Blob> {
  if (!input || input.size === 0) {
    throw new Error('La grabación quedó vacía. Intenta grabar de nuevo.');
  }

  const original = await sniffAudioContainer(input);

  // MP3 ya es óptimo: no re-codificamos.
  if (original.container === 'mp3') return input;

  try {
    const mp3 = await convertToWhatsAppAudio(input);
    const sniffed = await sniffAudioContainer(mp3);
    if (sniffed.container !== 'mp3') throw new Error('La codificación MP3 no produjo un archivo válido.');
    return mp3;
  } catch (err) {
    console.warn('[audioConvert] MP3 encode failed:', err);
    // Último recurso: si el contenedor original ya es seguro para Meta, lo
    // enviamos tal cual en vez de fallar (mejor que no enviar nada).
    if (SAFE_CONTAINERS.has(original.container)) return input;
    if (original.container === 'mp4') {
      // MP4 de MediaRecorder puede ser fragmentado; aún así Meta suele
      // reproducirlo mejor que un error. Se envía como último recurso.
      return input;
    }
    throw new Error('No se pudo procesar el audio en este dispositivo. Grábalo de nuevo e inténtalo otra vez.');
  }
}

/**
 * Prepara un archivo de audio adjuntado por el usuario.
 * Los formatos ya compatibles se envían tal cual (evita re-codificar archivos
 * grandes); WebM o desconocidos se convierten a MP3.
 */
export async function prepareAttachedAudioForWhatsApp(file: File): Promise<File> {
  const sniffedInput = await sniffAudioContainer(file);
  const base = file.name.replace(/\.[^.]+$/, '') || 'audio';

  if (SAFE_CONTAINERS.has(sniffedInput.container) || sniffedInput.container === 'mp4') {
    return new File([file], `${base}.${sniffedInput.ext}`, { type: sniffedInput.mime });
  }

  const converted = await prepareRecordedAudioForWhatsApp(file);
  const sniffed = await sniffAudioContainer(converted);
  return new File([converted], `${base}.${sniffed.ext}`, { type: sniffed.mime });
}

/**
 * Devuelve true si el blob ya es un contenedor compatible con WhatsApp.
 */
export function isAlreadyWhatsAppCompatible(blob: Blob): boolean {
  const t = (blob.type || '').toLowerCase();
  if (!t) return false;
  if (t.includes('webm')) return false;
  return (
    t.includes('ogg') ||
    t.includes('mp4') ||
    t.includes('m4a') ||
    t.includes('mpeg') ||
    t.includes('mp3') ||
    t.includes('aac') ||
    t.includes('amr')
  );
}
