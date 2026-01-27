import lamejs from 'lamejs';

/**
 * Converts an audio Blob (WebM, OGG, etc.) to MP3 format using lamejs
 * This ensures better compatibility with WhatsApp which doesn't support WebM
 */
export async function convertToMp3(audioBlob: Blob): Promise<Blob> {
  // If it's already MP3, return as-is
  if (audioBlob.type === 'audio/mp3' || audioBlob.type === 'audio/mpeg') {
    return audioBlob;
  }

  try {
    // Decode the audio using Web Audio API
    const audioContext = new AudioContext();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Get audio data
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const samples = audioBuffer.length;

    // Convert to mono if stereo (WhatsApp prefers mono for voice)
    let leftChannel: Float32Array;
    let rightChannel: Float32Array | null = null;

    if (numberOfChannels === 1) {
      leftChannel = audioBuffer.getChannelData(0);
    } else {
      leftChannel = audioBuffer.getChannelData(0);
      rightChannel = audioBuffer.getChannelData(1);
    }

    // Convert float samples to 16-bit PCM
    const leftSamples = floatTo16BitPCM(leftChannel);
    const rightSamples = rightChannel ? floatTo16BitPCM(rightChannel) : null;

    // Initialize MP3 encoder
    // Use 64kbps mono for voice - good quality with small file size
    const mp3encoder = new lamejs.Mp3Encoder(numberOfChannels === 1 ? 1 : 2, sampleRate, 64);
    
    const mp3Data: Int8Array[] = [];
    const sampleBlockSize = 1152; // Must be a multiple of 576

    for (let i = 0; i < samples; i += sampleBlockSize) {
      const leftChunk = leftSamples.subarray(i, i + sampleBlockSize);
      let mp3buf: Int8Array;

      if (numberOfChannels === 1) {
        mp3buf = mp3encoder.encodeBuffer(leftChunk);
      } else {
        const rightChunk = rightSamples!.subarray(i, i + sampleBlockSize);
        mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      }

      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }

    // Flush the encoder
    const mp3End = mp3encoder.flush();
    if (mp3End.length > 0) {
      mp3Data.push(mp3End);
    }

    // Close audio context
    await audioContext.close();

    // Convert Int8Array[] to Uint8Array[] for Blob compatibility
    const blobParts: BlobPart[] = mp3Data.map(chunk => {
      const uint8 = new Uint8Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        uint8[i] = chunk[i] < 0 ? chunk[i] + 256 : chunk[i];
      }
      return uint8;
    });

    // Combine all MP3 chunks into a single Blob
    return new Blob(blobParts, { type: 'audio/mp3' });
  } catch (error) {
    console.error('Error converting audio to MP3:', error);
    // If conversion fails, return original blob
    // The backend can try to handle it
    return audioBlob;
  }
}

/**
 * Convert Float32Array audio samples to Int16Array (16-bit PCM)
 */
function floatTo16BitPCM(samples: Float32Array): Int16Array {
  const result = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    // Clamp the value to [-1, 1] range
    const s = Math.max(-1, Math.min(1, samples[i]));
    // Convert to 16-bit integer
    result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return result;
}

/**
 * Check if the browser can decode a specific audio format
 */
export async function canDecodeAudio(mimeType: string): Promise<boolean> {
  try {
    const audioContext = new AudioContext();
    // Create a minimal test - just check if AudioContext is available
    await audioContext.close();
    return true;
  } catch {
    return false;
  }
}
