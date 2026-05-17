import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, Video, Mic, MicOff, Square } from 'lucide-react';
import { prepareRecordedAudioForWhatsApp } from '@/utils/audioConvert';

interface MediaCaptureButtonsProps {
  onMediaCaptured: (url: string, type: string) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
}

export const MediaCaptureButtons = ({ onMediaCaptured, uploading, setUploading }: MediaCaptureButtonsProps) => {
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const uploadBlob = async (blob: Blob, ext: string, mediaType: string) => {
    setUploading(true);
    try {
      const fileName = `bot_media_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from('media')
        .upload(fileName, blob, { contentType: blob.type });
      if (error) throw error;
      const { data: publicUrl } = supabase.storage.from('media').getPublicUrl(data.path);
      onMediaCaptured(publicUrl.publicUrl, mediaType);
      toast.success('Archivo capturado correctamente');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Error al subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  const handleFileCapture = async (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error('El archivo no puede superar 16MB');
      return;
    }
    const ext = file.name.split('.').pop() || (type === 'image' ? 'jpg' : 'mp4');
    await uploadBlob(file, ext, type);
    e.target.value = '';
  };

  const startAudioRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const rawBlob = new Blob(chunksRef.current, { type: mimeType });
        try {
          // WhatsApp no acepta WebM. Convertir a OGG/Opus real antes de subir.
          const prepared = await prepareRecordedAudioForWhatsApp(rawBlob);
          await uploadBlob(prepared, 'ogg', 'audio');
        } catch (err) {
          console.error('Audio prep error:', err);
          toast.error('No se pudo procesar el audio para WhatsApp');
          setUploading(false);
        }
      };

      recorder.start(100);
      setIsRecordingAudio(true);
      setAudioDuration(0);
      timerRef.current = window.setInterval(() => {
        setAudioDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Mic error:', err);
      toast.error('No se pudo acceder al micrófono');
    }
  }, []);

  const stopAudioRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop();
      setIsRecordingAudio(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecordingAudio]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="flex flex-wrap gap-2">
      {/* Photo capture */}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => handleFileCapture(e, 'image')} />
      <Button type="button" variant="outline" size="sm" disabled={uploading || isRecordingAudio}
        onClick={() => photoInputRef.current?.click()}>
        <Camera className="h-4 w-4 mr-1" />
        Foto
      </Button>

      {/* Video capture */}
      <input ref={videoInputRef} type="file" accept="video/*" capture="environment" className="hidden"
        onChange={(e) => handleFileCapture(e, 'video')} />
      <Button type="button" variant="outline" size="sm" disabled={uploading || isRecordingAudio}
        onClick={() => videoInputRef.current?.click()}>
        <Video className="h-4 w-4 mr-1" />
        Video
      </Button>

      {/* Audio recording */}
      {isRecordingAudio ? (
        <Button type="button" variant="destructive" size="sm" onClick={stopAudioRecording}>
          <Square className="h-4 w-4 mr-1" />
          Detener ({formatTime(audioDuration)})
        </Button>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={uploading}
          onClick={startAudioRecording}>
          <Mic className="h-4 w-4 mr-1" />
          Grabar Audio
        </Button>
      )}
    </div>
  );
};
