import { useState, useEffect, useCallback } from 'react';

interface NotificationSettings {
  soundEnabled: boolean;
  desktopEnabled: boolean;
}

const STORAGE_KEY = 'notification-settings';

const defaultSettings: NotificationSettings = {
  soundEnabled: true,
  desktopEnabled: true,
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

  return {
    soundEnabled: settings.soundEnabled,
    desktopEnabled: settings.desktopEnabled,
    toggleSound,
    toggleDesktop,
    updateSettings,
  };
};
