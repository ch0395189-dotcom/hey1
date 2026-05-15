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

  loadingPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    // FFmpeg's worker is a module worker in Vite. Loading the UMD core as a
    // module makes @ffmpeg/ffmpeg throw "failed to import ffmpeg-core.js".
    // Use the ESM core so the dynamic import exposes the expected default export.
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
    const ffmpeg = new FFmpeg();
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
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