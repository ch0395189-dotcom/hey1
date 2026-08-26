/**
 * Real WebM → OGG/Opus conversion using ffmpeg.wasm.
 *
 * Browsers (especially Chrome/Android Chrome) record audio as
 * `audio/webm;codecs=opus`. WhatsApp Cloud API rejects WebM containers
 * (it accepts OGG/Opus, MP4/AAC, MP3, AMR). Previously we just relabeled
 * the blob as `audio/ogg` without changing the actual bytes — Meta still
 * received WebM and sent corrupted/unplayable audio to the recipient,
 * and our own UI could not play it back reliably either.
 *
 * This util lazily loads ffmpeg.wasm from a CDN (so the main bundle
 * stays small) and properly remuxes the Opus stream into a real OGG
 * container.
 */

let ffmpegInstance: any | null = null;
let loadingPromise: Promise<any> | null = null;

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  const coreBaseUrls = [
    'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm',
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm',
  ];

  loadingPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    // FFmpeg's worker is a module worker in Vite. Loading the UMD core as a
    // module makes @ffmpeg/ffmpeg throw "failed to import ffmpeg-core.js".
    // Use the ESM core so the dynamic import exposes the expected default export.
    const ffmpeg = new FFmpeg();
    try {
      let lastError: unknown;
      for (const baseURL of coreBaseUrls) {
        try {
          await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
          });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (lastError) throw lastError;
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    } catch (error) {
      loadingPromise = null;
      ffmpeg.terminate();
      throw error;
    }
  })();

  return loadingPromise;
}

/**
 * Warm up ffmpeg.wasm in the background so the first audio send doesn't
 * pay the 2-4s download/compile cost. Safe to call multiple times — it's
 * a no-op after the first call.
 */
export function preloadFFmpeg(): void {
  // Only preload on capable devices to avoid wasting data/CPU on low-end
  // phones that may never actually record audio.
  if (typeof window === "undefined") return;
  if (!("MediaRecorder" in window)) return;
  // Fire-and-forget; errors are non-fatal — real conversion will retry.
  getFFmpeg().catch(() => {
    /* ignore — will be retried on actual use */
  });
}

/**
 * Converts an audio blob (typically WebM/Opus from MediaRecorder) into a
 * real OGG/Opus blob that WhatsApp Cloud API and all modern browsers
 * accept.
 */
export async function convertToOggOpus(input: Blob): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const inputName = 'input';
  const outputName = 'output.ogg';

  const arrayBuffer = await input.arrayBuffer();
  await ffmpeg.writeFile(inputName, new Uint8Array(arrayBuffer));

  // -c:a libopus re-encodes (or copies if already opus) into a clean OGG container.
  // Using -c:a copy when source is already opus keeps quality and is fast.
  await ffmpeg.exec([
    '-i', inputName,
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '32k',
    '-ar', '48000',
    '-ac', '1',
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);
  // Cleanup
  try { await ffmpeg.deleteFile(inputName); } catch { /* noop */ }
  try { await ffmpeg.deleteFile(outputName); } catch { /* noop */ }

  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
  // Copy into a fresh ArrayBuffer to satisfy strict BlobPart typing.
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return new Blob([buf], { type: 'audio/ogg; codecs=opus' });
}

export async function isRealOggContainer(input: Blob): Promise<boolean> {
  const header = new Uint8Array(await input.slice(0, 4).arrayBuffer());
  return header[0] === 0x4f && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53; // OggS
}

/**
 * Sniffs the REAL container of an audio blob by reading its magic bytes.
 * Never trust blob.type: several mobile browsers lie about it, and uploading
 * a WebM/MP4 labelled as `audio/ogg` makes WhatsApp deliver a broken voice
 * note (the recipient only sees the bubble with no playable audio).
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

export async function prepareRecordedAudioForWhatsApp(input: Blob): Promise<Blob> {
  // Do not trust MediaRecorder's MIME type alone. Some mobile browsers report
  // audio/ogg while writing MP4 bytes, which Meta accepts but recipients get a
  // broken voice note. Only skip conversion when the actual bytes are OGG.
  if (await isRealOggContainer(input)) return input;

  const { isIOS, encodeBlobToMp3 } = await import('./mp3Encode');

  // iOS records *fragmented* MP4 (no leading moov atom). Meta accepts the
  // upload but the recipient gets an unplayable bubble, and ffmpeg.wasm can't
  // run on iOS (no SharedArrayBuffer). Re-encode to MP3, which WhatsApp plays.
  if (isIOS()) {
    try {
      return await encodeBlobToMp3(input);
    } catch (err) {
      console.warn('[audioConvert] MP3 encode failed on iOS, sending original:', err);
      if (isAlreadyWhatsAppCompatible(input)) return input;
      throw err;
    }
  }

  try {
    const converted = await convertToOggOpus(input);
    if (!(await isRealOggContainer(converted))) {
      throw new Error('La conversión del audio no generó un archivo OGG válido.');
    }
    return converted;
  } catch (err) {
    // Fallback: ffmpeg.wasm unavailable → try the pure-JS MP3 encoder before
    // giving up, so the recipient always gets playable audio.
    try {
      return await encodeBlobToMp3(input);
    } catch (mp3Err) {
      console.warn('[audioConvert] MP3 fallback failed:', mp3Err);
    }
    if (input.type && input.type.startsWith('audio/')) {
      console.warn('[audioConvert] ffmpeg unavailable, sending original blob as-is:', input.type, err);
      return input;
    }
    throw err;
  }
}


export async function prepareAttachedAudioForWhatsApp(file: File): Promise<File> {
  const sniffedInput = await sniffAudioContainer(file);
  // Already a container WhatsApp can decode and correctly labelled → send as-is.
  if (sniffedInput.container !== 'webm' && sniffedInput.container !== 'unknown') {
    const base = file.name.replace(/\.[^.]+$/, '') || 'audio';
    return new File([file], `${base}.${sniffedInput.ext}`, { type: sniffedInput.mime });
  }

  const converted = await prepareRecordedAudioForWhatsApp(file);
  const sniffed = await sniffAudioContainer(converted);
  return new File([converted], `${file.name.replace(/\.[^.]+$/, '') || 'audio'}.${sniffed.ext}`, {
    type: sniffed.mime,
  });
}

/**
 * Returns true if the blob is already a proper WhatsApp-compatible
 * container (OGG, MP4/M4A, MP3, AAC, AMR) and does not need conversion.
 */
export function isAlreadyWhatsAppCompatible(blob: Blob): boolean {
  const t = (blob.type || '').toLowerCase();
  if (!t) return false;
  if (t.includes('webm')) return false; // needs conversion
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