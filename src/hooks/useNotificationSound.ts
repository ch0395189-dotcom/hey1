import { useCallback, useRef } from 'react';
import { NotificationTone } from './useNotificationSettings';

// Map every tone to a real audio file (works on iOS / Android PWA where
// Web Audio oscillators are unreliable in background or after lock).
const toneFileMap: Record<NotificationTone, string> = {
  chime: '/notification-tones/chime.wav',
  ping: '/notification-tones/ping.wav',
  bubble: '/notification-tones/bubble.wav',
  bell: '/notification-tones/bell.wav',
  soft: '/notification-tones/soft.wav',
  alarm: '/notification-tones/alarm.wav',
};

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
  alarm: {
    frequencies: [1400, 1000, 1400, 1000, 1600],
    durations: [0.12, 0.12, 0.12, 0.12, 0.2],
    type: 'square',
  },
};

// Module-level singleton: track audio unlock across the whole app.
let audioUnlocked = false;
const audioElementCache = new Map<NotificationTone, HTMLAudioElement>();

const getAudioElement = (tone: NotificationTone): HTMLAudioElement => {
  let el = audioElementCache.get(tone);
  if (!el) {
    el = new Audio(toneFileMap[tone]);
    el.preload = 'auto';
    audioElementCache.set(tone, el);
  }
  return el;
};

// Unlock audio on the first user gesture. Required by iOS Safari and
// Chrome on Android — without a gesture, audio playback is blocked.
const setupAudioUnlock = () => {
  if (typeof window === 'undefined' || audioUnlocked) return;

  const unlock = () => {
    if (audioUnlocked) return;
    try {
      // Touch every cached element + a silent play of the bell to "warm" them
      const el = getAudioElement('bell');
      el.muted = true;
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          el.pause();
          el.currentTime = 0;
          el.muted = false;
          audioUnlocked = true;
          console.log('[Sound] Audio unlocked by user gesture');
        }).catch((err) => {
          console.warn('[Sound] Audio unlock failed (will retry):', err);
        });
      } else {
        el.muted = false;
        audioUnlocked = true;
      }
    } catch (err) {
      console.warn('[Sound] Unlock error:', err);
    }
  };

  const events = ['pointerdown', 'touchstart', 'click', 'keydown'];
  events.forEach((e) => window.addEventListener(e, unlock, { once: false, passive: true }));
};

if (typeof window !== 'undefined') {
  setupAudioUnlock();
}

export const useNotificationSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastPlayedRef = useRef<number>(0);
  const minInterval = 1000;

  // Vibration patterns for different tones (in milliseconds)
  const vibrationPatterns: Record<NotificationTone, number[]> = {
    chime: [100, 50, 100],
    ping: [80, 40, 80],
    bubble: [60, 30, 60, 30, 60],
    bell: [150, 75, 200],
    soft: [100, 100, 150],
    alarm: [200, 100, 200, 100, 200, 100, 300],
  };

  const triggerVibration = useCallback((tone: NotificationTone) => {
    try {
      if ('vibrate' in navigator) {
        navigator.vibrate(vibrationPatterns[tone]);
      }
    } catch (error) {
      console.warn('Vibration not supported:', error);
    }
  }, []);

  const playNotificationSound = useCallback((volume: number = 1.0, tone: NotificationTone = 'bell', enableVibration: boolean = true) => {
    const now = Date.now();
    
    if (now - lastPlayedRef.current < minInterval) {
      console.log('[Sound] Throttled - too soon since last play');
      return;
    }
    lastPlayedRef.current = now;

    console.log('[Sound] Playing notification:', { volume, tone, enableVibration });

    // Trigger vibration
    if (enableVibration) {
      triggerVibration(tone);
    }

    try {
      // Create new AudioContext each time to avoid suspension issues on mobile
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Resume immediately for mobile compatibility
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
          console.log('[Sound] AudioContext resumed');
        });
      }

      const config = toneConfigs[tone];
      const masterGain = audioContext.createGain();
      masterGain.connect(audioContext.destination);
      masterGain.gain.setValueAtTime(volume * 1.0, audioContext.currentTime);

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

      // Close audio context after sound finishes to free resources
      setTimeout(() => {
        audioContext.close();
      }, 2000);

      console.log('[Sound] Sound played successfully');
    } catch (error) {
      console.error('[Sound] Error playing notification sound:', error);
    }
  }, [triggerVibration]);

  const playPreview = useCallback((volume: number, tone: NotificationTone) => {
    // Reset last played to allow immediate preview
    lastPlayedRef.current = 0;
    playNotificationSound(volume, tone, true);
  }, [playNotificationSound]);

  return { playNotificationSound, playPreview, triggerVibration };
};
