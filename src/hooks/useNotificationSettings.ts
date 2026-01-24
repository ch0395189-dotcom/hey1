import { useState, useEffect, useCallback } from 'react';

export type NotificationTone = 'chime' | 'ping' | 'bubble' | 'bell' | 'soft' | 'alarm';

export type Platform = 'whatsapp' | 'messenger' | 'instagram' | 'tiktok';

interface PlatformTones {
  whatsapp: NotificationTone;
  messenger: NotificationTone;
  instagram: NotificationTone;
  tiktok: NotificationTone;
}

interface NotificationSettings {
  soundEnabled: boolean;
  desktopEnabled: boolean;
  volume: number; // 0 to 1
  tone: NotificationTone; // Default/fallback tone
  platformTones: PlatformTones;
}

const STORAGE_KEY = 'notification-settings';

const defaultSettings: NotificationSettings = {
  soundEnabled: true,
  desktopEnabled: true,
  volume: 1.0,
  tone: 'bell',
  platformTones: {
    whatsapp: 'bell',
    messenger: 'chime',
    instagram: 'bubble',
    tiktok: 'ping',
  },
};

export const useNotificationSettings = () => {
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({ 
          ...defaultSettings, 
          ...parsed,
          platformTones: { ...defaultSettings.platformTones, ...parsed.platformTones }
        });
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

  const setPlatformTone = useCallback((platform: Platform, tone: NotificationTone) => {
    updateSettings({ 
      platformTones: { ...settings.platformTones, [platform]: tone } 
    });
  }, [settings.platformTones, updateSettings]);

  const getToneForPlatform = useCallback((platform: string): NotificationTone => {
    const normalizedPlatform = platform.toLowerCase() as Platform;
    return settings.platformTones[normalizedPlatform] || settings.tone;
  }, [settings.platformTones, settings.tone]);

  return {
    soundEnabled: settings.soundEnabled,
    desktopEnabled: settings.desktopEnabled,
    volume: settings.volume,
    tone: settings.tone,
    platformTones: settings.platformTones,
    toggleSound,
    toggleDesktop,
    setVolume,
    setTone,
    setPlatformTone,
    getToneForPlatform,
    updateSettings,
  };
};
