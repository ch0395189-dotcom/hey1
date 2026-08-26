/**
 * Pure-JS MP3 encoding for iOS.
 *
 * iOS Safari / iOS WebView record audio as *fragmented* MP4 (AAC). Meta's
 * /media endpoint accepts `audio/mp4`, but fragmented MP4 produced by
 * MediaRecorder has no leading `moov` atom, so WhatsApp delivers a bubble
 * the recipient cannot play. ffmpeg.wasm is not an option on iOS either
 * (needs SharedArrayBuffer + COOP/COEP headers).
 *
 * lamejs runs anywhere (plain JS, no wasm/threads) and MP3 (`audio/mpeg`)
 * is a first-class WhatsApp audio format, so we decode the recording with
 * the Web Audio API and re-encode it to MP3.
 */

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Macintosh but is touch-enabled.
  const iPadOS = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  return iOSDevice || iPadOS;
}

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Decodes any audio blob the browser can read and re-encodes it as mono
 * 64kbps MP3 — small, fast and universally playable in WhatsApp.
 */
export async function encodeBlobToMp3(input: Blob): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');

  const AudioCtx: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) throw new Error('AudioContext no disponible en este dispositivo.');

  const ctx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    const buffer = await input.arrayBuffer();
    // Safari still needs the callback form in some versions.
    decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      const maybePromise = ctx.decodeAudioData(buffer.slice(0), resolve, reject) as unknown;
      if (maybePromise && typeof (maybePromise as Promise<AudioBuffer>).then === 'function') {
        (maybePromise as Promise<AudioBuffer>).then(resolve, reject);
      }
    });
  } finally {
    try { await ctx.close(); } catch { /* noop */ }
  }

  // Downmix to mono.
  const channels = decoded.numberOfChannels;
  const length = decoded.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i] / channels;
  }

  // lamejs only supports standard MPEG sample rates.
  const supported = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];
  const sampleRate = supported.includes(decoded.sampleRate) ? decoded.sampleRate : 44100;
  let samples = mono;
  if (sampleRate !== decoded.sampleRate) {
    const ratio = sampleRate / decoded.sampleRate;
    const outLength = Math.floor(length * ratio);
    const resampled = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) resampled[i] = mono[Math.floor(i / ratio)] ?? 0;
    samples = resampled;
  }

  const pcm = floatTo16BitPCM(samples);
  const encoder = new Mp3Encoder(1, sampleRate, 64);
  const blockSize = 1152;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += blockSize) {
    const chunk = pcm.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(chunk);
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
  }
  const flushed = encoder.flush();
  if (flushed.length > 0) chunks.push(new Uint8Array(flushed));

  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  if (total === 0) throw new Error('La codificación MP3 no produjo datos.');
  const buf = new ArrayBuffer(total);
  const view = new Uint8Array(buf);
  let offset = 0;
  for (const c of chunks) {
    view.set(c, offset);
    offset += c.byteLength;
  }
  return new Blob([buf], { type: 'audio/mpeg' });
}
