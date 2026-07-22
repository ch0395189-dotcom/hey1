import { useState, useRef, useCallback } from 'react';
import { getBestAudioMimeType } from '@/utils/audioConverter';
import { Capacitor } from '@capacitor/core';

/**
 * En APK (Capacitor + Android WebView) `getUserMedia` falla en frío si el
 * usuario nunca ha aceptado el permiso RECORD_AUDIO. Pedimos explícitamente
 * el permiso antes de tocar el mic para que salga el diálogo del sistema
 * y no un error críptico de "Permission denied".
 */
async function ensureMicPermission(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) return;
    // Solicitud a nivel Android — usamos el plugin Permissions genérico si
    // está disponible; si no, dejamos que el WebView pida el permiso al
    // llamar a getUserMedia (Capacitor 5+ ya reenvía la petición al SO
    // siempre que el manifest declare RECORD_AUDIO).
    const mod: any = await import('@capacitor/core');
    const registerPlugin = mod?.registerPlugin;
    if (!registerPlugin) return;
    try {
      const Perms: any = registerPlugin('Permissions');
      if (Perms?.request) await Perms.request({ name: 'microphone' });
    } catch {
      /* fallback silencioso al prompt nativo del WebView */
    }
  } catch {
    /* noop */
  }
}

interface UseAudioRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  isSupported: boolean;
  mimeType: string;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  clearRecording: () => void;
}

export const useAudioRecorder = (): UseAudioRecorderReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('audio/webm');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);

  const isSupported = typeof navigator !== 'undefined' && 
    navigator.mediaDevices && 
    typeof navigator.mediaDevices.getUserMedia === 'function';

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now() - pausedDurationRef.current * 1000;
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setDuration(elapsed);
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      await ensureMicPermission();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      pausedDurationRef.current = 0;

      // Use the best format for WhatsApp compatibility
      const selectedMimeType = getBestAudioMimeType();
      setMimeType(selectedMimeType);

      const mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: selectedMimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setIsPaused(false);
      setAudioBlob(null);
      setAudioUrl(null);
      startTimer();
    } catch (error) {
      console.error('Error starting recording:', error);
      const err = error as DOMException;
      // Traducimos el error del navegador a un mensaje claro para el usuario
      // (el APK antes fallaba con "NotAllowedError" sin más contexto).
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        throw new Error(
          'Permiso de micrófono denegado. Ve a Ajustes → Aplicaciones → Hey Hey → Permisos y activa el micrófono.'
        );
      }
      if (err?.name === 'NotFoundError') {
        throw new Error('No se encontró un micrófono disponible en este dispositivo.');
      }
      if (err?.name === 'NotReadableError') {
        throw new Error('El micrófono está en uso por otra app. Ciérrala e intenta de nuevo.');
      }
      throw error;
    }
  }, [startTimer]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      stopTimer();
    }
  }, [isRecording, stopTimer]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      pausedDurationRef.current = duration;
      stopTimer();
    }
  }, [isRecording, isPaused, duration, stopTimer]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      startTimer();
    }
  }, [isRecording, isPaused, startTimer]);

  const clearRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    chunksRef.current = [];
    pausedDurationRef.current = 0;
  }, [audioUrl]);

  return {
    isRecording,
    isPaused,
    duration,
    audioBlob,
    audioUrl,
    isSupported,
    mimeType,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearRecording,
  };
};
