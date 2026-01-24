import { useState, useEffect, useCallback } from 'react';

export type NotificationTone = 'chime' | 'ping' | 'bubble' | 'bell' | 'soft' | 'alarm';

interface NotificationSettings {
  soundEnabled: boolean;
  desktopEnabled: boolean;
  volume: number; // 0 to 1
  tone: NotificationTone;
}

const STORAGE_KEY = 'notification-settings';

const defaultSettings: NotificationSettings = {
  soundEnabled: true,
  desktopEnabled: true,
  volume: 1.0,
  tone: 'bell',
};

export const useNotificationSettings = () => {
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSettings({ ...defaultSettings, ...JSON.parse(stored) });
      } catch {
        setSettings(defaultSettings);
      }
    }
  }, []);

  const updateSettings = useCallback((updates: Partial<NotificationSettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      return newSettings;
    });
  }, []);

  const toggleSound = useCallback(() => {
    updateSettings({ soundEnabled: !settings.soundEnabled });
  }, [settings.soundEnabled, updateSettings]);

  const toggleDesktop = useCallback(() => {
    updateSettings({ desktopEnabled: !settings.desktopEnabled });
  }, [settings.desktopEnabled, updateSettings]);

  const setVolume = useCallback((volume: number) => {
    updateSettings({ volume: Math.max(0, Math.min(1, volume)) });
  }, [updateSettings]);

  const setTone = useCallback((tone: NotificationTone) => {
    updateSettings({ tone });
  }, [updateSettings]);

  return {
    soundEnabled: settings.soundEnabled,
    desktopEnabled: settings.desktopEnabled,
    volume: settings.volume,
    tone: settings.tone,
    toggleSound,
    toggleDesktop,
    setVolume,
    setTone,
    updateSettings,
  };
};
