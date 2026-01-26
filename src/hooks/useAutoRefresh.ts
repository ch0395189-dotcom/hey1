import { useState, useEffect, useCallback, useRef } from 'react';

export type RefreshInterval = 0 | 10 | 30 | 60 | 120 | 300; // 0 = disabled, values in seconds

interface AutoRefreshSettings {
  enabled: boolean;
  interval: RefreshInterval; // in seconds
}

const STORAGE_KEY = 'auto-refresh-settings';

const defaultSettings: AutoRefreshSettings = {
  enabled: false,
  interval: 30,
};

export const useAutoRefreshSettings = () => {
  const [settings, setSettings] = useState<AutoRefreshSettings>(defaultSettings);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({ ...defaultSettings, ...parsed });
      } catch {
        setSettings(defaultSettings);
      }
    }
  }, []);

  const updateSettings = useCallback((updates: Partial<AutoRefreshSettings>) => {
    setSettings(prev => {
      const newSettings = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      return newSettings;
    });
  }, []);

  const toggleEnabled = useCallback(() => {
    updateSettings({ enabled: !settings.enabled });
  }, [settings.enabled, updateSettings]);

  const setInterval = useCallback((interval: RefreshInterval) => {
    updateSettings({ interval });
  }, [updateSettings]);

  return {
    enabled: settings.enabled,
    interval: settings.interval,
    toggleEnabled,
    setInterval,
    updateSettings,
  };
};

export const useAutoRefresh = (callback: () => void | Promise<void>, intervalSeconds: number, enabled: boolean) => {
  const savedCallback = useRef(callback);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalSeconds === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      savedCallback.current();
    }, intervalSeconds * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalSeconds]);

  const forceRefresh = useCallback(() => {
    savedCallback.current();
  }, []);

  return { forceRefresh };
};

export const intervalOptions: { value: RefreshInterval; label: string }[] = [
  { value: 0, label: 'Desactivado' },
  { value: 10, label: '10 segundos' },
  { value: 30, label: '30 segundos' },
  { value: 60, label: '1 minuto' },
  { value: 120, label: '2 minutos' },
  { value: 300, label: '5 minutos' },
];
