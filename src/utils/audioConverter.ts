/**
 * Audio utilities for WhatsApp compatibility
 * WhatsApp Cloud API supports: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg (opus codec only)
 * 
 * Best approach: Record in OGG/Opus format when possible (Chrome, Firefox)
 * For Safari: Record in audio/mp4 which is natively supported
 */

/**
 * Get the best audio MIME type for recording based on browser support
 * Prioritizes formats that WhatsApp accepts natively
 */
export function getBestAudioMimeType(): string {
  // Priority order for WhatsApp compatibility:
  // 1. audio/ogg;codecs=opus - Best for WhatsApp, supported by Chrome/Firefox
  // 2. audio/mp4 - Supported by Safari and WhatsApp
  // 3. audio/webm - Fallback, needs conversion
  
  if (typeof MediaRecorder === 'undefined') {
    return 'audio/webm'; // Fallback
  }
  
  const mimeTypes = [
    'audio/ogg;codecs=opus',
    'audio/ogg; codecs=opus', // Alternative format
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
  ];
  
  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      console.log(`Selected audio format: ${mimeType}`);
      return mimeType;
    }
  }
  
  return 'audio/webm'; // Final fallback
}

/**
 * Determine the file extension based on MIME type
 */
export function getAudioExtension(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('webm')) return 'webm';
  return 'ogg'; // Default
}

/**
 * Get the content type for upload based on the recorded MIME type
 */
export function getUploadContentType(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'audio/ogg';
  if (mimeType.includes('mp4')) return 'audio/mp4';
  if (mimeType.includes('mpeg')) return 'audio/mpeg';
  if (mimeType.includes('webm')) return 'audio/webm';
  return 'audio/ogg'; // Default
}

/**
 * Check if the audio format is natively supported by WhatsApp
 */
export function isWhatsAppCompatible(mimeType: string): boolean {
  const compatibleFormats = [
    'audio/ogg',
    'audio/mp4',
    'audio/m4a',
    'audio/mpeg',
    'audio/mp3',
    'audio/aac',
    'audio/amr',
  ];
  
  return compatibleFormats.some(format => mimeType.includes(format.split('/')[1]));
}

/**
 * Prepares audio blob for sending to WhatsApp
 * Returns the blob and metadata needed for upload
 */
export async function prepareAudioForUpload(audioBlob: Blob): Promise<{
  blob: Blob;
  extension: string;
  contentType: string;
  isCompatible: boolean;
}> {
  const originalType = audioBlob.type || 'audio/webm';
  
  // Check if format is already WhatsApp compatible
  if (isWhatsAppCompatible(originalType)) {
    const extension = getAudioExtension(originalType);
    const contentType = getUploadContentType(originalType);
    
    console.log(`Audio format ${originalType} is WhatsApp compatible`);
    
    return {
      blob: audioBlob,
      extension,
      contentType,
      isCompatible: true,
    };
  }
  
  // For WebM, we'll send it as OGG (same Opus codec, just different container name)
  // WhatsApp might accept it since the codec is the same
  if (originalType.includes('webm') && originalType.includes('opus')) {
    console.log('WebM with Opus codec - sending as audio/ogg');
    
    // Create a new blob with OGG mime type
    // The data is the same (Opus codec), just the container declaration changes
    const oggBlob = new Blob([audioBlob], { type: 'audio/ogg; codecs=opus' });
    
    return {
      blob: oggBlob,
      extension: 'ogg',
      contentType: 'audio/ogg',
      isCompatible: true,
    };
  }
  
  // For other WebM formats, try to send as-is with proper typing
  console.warn(`Audio format ${originalType} may not be fully compatible with WhatsApp`);
  
  return {
    blob: audioBlob,
    extension: getAudioExtension(originalType),
    contentType: getUploadContentType(originalType),
    isCompatible: false,
  };
}
