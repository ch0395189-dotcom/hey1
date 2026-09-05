/**
 * Codifica cualquier audio a OGG/Opus mono 48 kHz — exactamente el mismo
 * formato que produce WhatsApp al grabar una nota de voz.
 *
 * Meta entrega el mensaje como "nota de voz" (PTT, burbuja con onda y avatar)
 * únicamente cuando el archivo es audio/ogg con codec opus. Un MP3 se muestra
 * como archivo de audio adjunto, que es lo que queríamos evitar.
 *
 * Todo ocurre localmente (WebAudio + libopus wasm empaquetado con la app):
 * sin red, sin CDN, sin ffmpeg.
 */

async function decodeToMono(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctx: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) throw new Error('Este navegador no soporta Web Audio API.');
  const ctx = new Ctx();
  try {
    const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
      const p = (ctx as any).decodeAudioData(arrayBuffer.slice(0), resolve, reject);
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    });

    const channels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const mono = new Float32Array(length);
    for (let c = 0; c < channels; c++) {
      const data = audioBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) mono[i] += data[i] / channels;
    }
    return { samples: mono, sampleRate: audioBuffer.sampleRate };
  } finally {
    ctx.close().catch(() => {});
  }
}

export async function encodeBlobToOggOpus(input: Blob): Promise<Blob> {
  const { samples, sampleRate } = await decodeToMono(input);
  if (!samples.length) throw new Error('El audio quedó vacío.');

  const worker = new Worker(
    new URL('opus-recorder/dist/encoderWorker.min.js', import.meta.url),
    { type: 'classic' }
  );

  const pages: Uint8Array[] = [];

  const result = await new Promise<Blob>((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('La codificación del audio tardó demasiado.'));
    }, 60000);

    worker.onerror = (e) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(e.message || 'Error al codificar el audio.'));
    };

    worker.onmessage = ({ data }: MessageEvent<any>) => {
      if (data?.page) {
        pages.push(new Uint8Array(data.page));
        return;
      }
      if (data?.message === 'ready') {
        // Enviamos el audio en bloques para no saturar el worker.
        const CHUNK = 48000;
        for (let offset = 0; offset < samples.length; offset += CHUNK) {
          const slice = samples.slice(offset, offset + CHUNK);
          worker.postMessage({ command: 'encode', buffers: [slice] });
        }
        worker.postMessage({ command: 'done' });
        return;
      }
      if (data?.message === 'done') {
        clearTimeout(timeout);
        worker.terminate();
        resolve(new Blob(pages as BlobPart[], { type: 'audio/ogg; codecs=opus' }));
      }
    };

    worker.postMessage({
      command: 'init',
      encoderSampleRate: 48000,
      originalSampleRate: sampleRate,
      numberOfChannels: 1,
      encoderApplication: 2048, // VOIP — igual que las notas de voz de WhatsApp
      encoderFrameSize: 20,
      encoderBitRate: 32000,
      maxFramesPerPage: 40,
      resampleQuality: 3,
      bufferLength: 4096,
      streamPages: true,
    });
  });

  if (result.size === 0) throw new Error('La codificación OGG/Opus no produjo datos.');
  return result;
}
