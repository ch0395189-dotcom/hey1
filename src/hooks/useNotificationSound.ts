import { useCallback, useRef } from 'react';
import { NotificationTone } from './useNotificationSettings';

interface ToneConfig {
  frequencies: number[];
  durations: number[];
  type: OscillatorType;
}

const toneConfigs: Record<NotificationTone, ToneConfig> = {
  chime: {
    frequencies: [880, 1174.66],
    durations: [0.1, 0.2],
    type: 'sine',
  },
  ping: {
    frequencies: [1318.51, 1046.50],
    durations: [0.08, 0.15],
    type: 'sine',
  },
  bubble: {
    frequencies: [523.25, 659.25, 783.99],
    durations: [0.08, 0.08, 0.15],
    type: 'sine',
  },
  bell: {
    frequencies: [830.61, 1108.73],
    durations: [0.15, 0.35],
    type: 'triangle',
  },
  soft: {
    frequencies: [392, 523.25],
    durations: [0.2, 0.3],
    type: 'sine',
  },
};

export const useNotificationSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastPlayedRef = useRef<number>(0);
  const minInterval = 1000;

  const playNotificationSound = useCallback((volume: number = 0.85, tone: NotificationTone = 'chime') => {
    const now = Date.now();
    
    if (now - lastPlayedRef.current < minInterval) {
      return;
    }
    lastPlayedRef.current = now;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      const config = toneConfigs[tone];
      const masterGain = audioContext.createGain();
      masterGain.connect(audioContext.destination);
      masterGain.gain.setValueAtTime(volume * 0.7, audioContext.currentTime);

      let timeOffset = 0;
      
      config.frequencies.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(masterGain);

        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + timeOffset);
        oscillator.type = config.type;

        const duration = config.durations[index];
        const startTime = audioContext.currentTime + timeOffset;
        
        // Envelope
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(1, startTime + 0.02);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + duration * 0.5);
        gainNode.gain.linearRampToValueAtTime(0, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration + 0.05);
        
        timeOffset += duration * 0.7;
      });

    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, []);

  const playPreview = useCallback((volume: number, tone: NotificationTone) => {
    // Reset last played to allow immediate preview
    lastPlayedRef.current = 0;
    playNotificationSound(volume, tone);
  }, [playNotificationSound]);

  return { playNotificationSound, playPreview };
};
