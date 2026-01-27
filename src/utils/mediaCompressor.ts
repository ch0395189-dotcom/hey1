/**
 * Media compression utilities for WhatsApp compatibility
 * WhatsApp limits: Images 5MB, Videos 16MB, Audio 16MB, Documents 100MB
 */

const WHATSAPP_LIMITS = {
  image: 5 * 1024 * 1024, // 5MB
  video: 16 * 1024 * 1024, // 16MB
  audio: 16 * 1024 * 1024, // 16MB
  document: 100 * 1024 * 1024, // 100MB
};

/**
 * Compress an image to meet WhatsApp's size limit
 */
export async function compressImage(file: File, maxSizeBytes: number = WHATSAPP_LIMITS.image): Promise<File> {
  // If already under limit, return as-is
  if (file.size <= maxSizeBytes) {
    return file;
  }

  console.log(`Compressing image from ${(file.size / 1024 / 1024).toFixed(2)}MB`);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = async () => {
      // Calculate compression ratio needed
      const ratio = Math.sqrt(maxSizeBytes / file.size);
      
      // Start with original dimensions, reduce if needed
      let width = img.width;
      let height = img.height;
      
      // Max dimensions for WhatsApp (keeps quality reasonable)
      const maxDimension = 2048;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        } else {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Try different quality levels until we're under the limit
      const qualities = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
      let compressedBlob: Blob | null = null;
      let quality = 0.9;

      for (const q of qualities) {
        quality = q;
        compressedBlob = await new Promise<Blob | null>(res => 
          canvas.toBlob(res, 'image/jpeg', q)
        );
        
        if (compressedBlob && compressedBlob.size <= maxSizeBytes) {
          break;
        }
        
        // If still too big, reduce dimensions
        if (compressedBlob && compressedBlob.size > maxSizeBytes && q === qualities[qualities.length - 1]) {
          const scale = 0.7;
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          compressedBlob = await new Promise<Blob | null>(res => 
            canvas.toBlob(res, 'image/jpeg', 0.7)
          );
        }
      }

      if (!compressedBlob) {
        reject(new Error('Failed to compress image'));
        return;
      }

      const compressedFile = new File(
        [compressedBlob],
        file.name.replace(/\.[^.]+$/, '.jpg'),
        { type: 'image/jpeg' }
      );

      console.log(`Image compressed to ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB (quality: ${quality})`);
      resolve(compressedFile);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Compress a video using the browser's MediaRecorder API
 * Note: This is a basic implementation. For better quality, server-side transcoding is recommended.
 */
export async function compressVideo(file: File, maxSizeBytes: number = WHATSAPP_LIMITS.video): Promise<File> {
  // If already under limit, return as-is
  if (file.size <= maxSizeBytes) {
    return file;
  }

  console.log(`Video is ${(file.size / 1024 / 1024).toFixed(2)}MB, attempting compression...`);

  // For videos larger than limit, we'll try to reduce quality
  // This is a simplified approach - proper video transcoding requires FFmpeg
  
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = async () => {
      try {
        // Calculate target bitrate based on duration and size limit
        const duration = video.duration;
        const targetBitrate = Math.floor((maxSizeBytes * 8) / duration * 0.8); // 80% of max to be safe
        
        // Reduce dimensions if video is large
        let width = video.videoWidth;
        let height = video.videoHeight;
        const maxDimension = 720; // 720p max for compressed videos
        
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round(height * (maxDimension / width));
            width = maxDimension;
          } else {
            width = Math.round(width * (maxDimension / height));
            height = maxDimension;
          }
        }

        // Ensure dimensions are even (required for some codecs)
        width = Math.round(width / 2) * 2;
        height = Math.round(height / 2) * 2;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Create a media stream from the canvas
        const stream = canvas.captureStream(24); // 24 fps
        
        // Try to get audio from the video
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(video);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        source.connect(audioContext.destination);
        
        // Combine video and audio streams
        destination.stream.getAudioTracks().forEach(track => stream.addTrack(track));

        // Set up MediaRecorder with lower bitrate
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm';
          
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: Math.min(targetBitrate, 2000000), // Max 2Mbps
        });

        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, '.webm'),
            { type: mimeType }
          );
          
          console.log(`Video compressed to ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
          
          // Clean up
          audioContext.close();
          URL.revokeObjectURL(video.src);
          
          resolve(compressedFile);
        };

        // Play video and record
        mediaRecorder.start(100);
        video.currentTime = 0;
        await video.play();

        // Draw frames to canvas
        const drawFrame = () => {
          if (video.ended || video.paused) {
            mediaRecorder.stop();
            return;
          }
          ctx.drawImage(video, 0, 0, width, height);
          requestAnimationFrame(drawFrame);
        };
        drawFrame();

        video.onended = () => {
          mediaRecorder.stop();
        };

      } catch (error) {
        console.error('Video compression failed:', error);
        // Return original if compression fails
        resolve(file);
      }
    };

    video.onerror = () => {
      console.warn('Could not load video for compression, returning original');
      resolve(file);
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Get the appropriate WhatsApp limit for a file type
 */
export function getWhatsAppLimit(mimeType: string): number {
  if (mimeType.startsWith('image/')) return WHATSAPP_LIMITS.image;
  if (mimeType.startsWith('video/')) return WHATSAPP_LIMITS.video;
  if (mimeType.startsWith('audio/')) return WHATSAPP_LIMITS.audio;
  return WHATSAPP_LIMITS.document;
}

/**
 * Check if a file exceeds WhatsApp limits
 */
export function exceedsWhatsAppLimit(file: File): boolean {
  const limit = getWhatsAppLimit(file.type);
  return file.size > limit;
}

/**
 * Compress media file if it exceeds WhatsApp limits
 */
export async function compressMediaIfNeeded(file: File): Promise<{ file: File; wasCompressed: boolean }> {
  const limit = getWhatsAppLimit(file.type);
  
  if (file.size <= limit) {
    return { file, wasCompressed: false };
  }

  if (file.type.startsWith('image/')) {
    const compressed = await compressImage(file, limit);
    return { file: compressed, wasCompressed: true };
  }

  if (file.type.startsWith('video/')) {
    const compressed = await compressVideo(file, limit);
    return { file: compressed, wasCompressed: true };
  }

  // For audio and documents, we can't easily compress in the browser
  // Return original and let the user know
  console.warn(`Cannot compress ${file.type} files in browser. Size: ${(file.size / 1024 / 1024).toFixed(2)}MB, Limit: ${(limit / 1024 / 1024).toFixed(2)}MB`);
  return { file, wasCompressed: false };
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
