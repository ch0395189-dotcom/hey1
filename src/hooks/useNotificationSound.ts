import { useCallback, useRef } from 'react';

export const useNotificationSound = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastPlayedRef = useRef<number>(0);
  const minInterval = 1000; // Minimum 1 second between sounds

  const playNotificationSound = useCallback(() => {
    const now = Date.now();
    
    // Prevent rapid repeated sounds
    if (now - lastPlayedRef.current < minInterval) {
      return;
    }
    lastPlayedRef.current = now;

    try {
      // Create or resume AudioContext
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // Create a pleasant notification sound using Web Audio API
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Two-tone notification sound (like a soft chime)
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
      oscillator.frequency.setValueAtTime(1174.66, audioContext.currentTime + 0.1); // D6

      oscillator.type = 'sine';

      // Envelope: quick attack, medium decay
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);

    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, []);

  return { playNotificationSound };
};
