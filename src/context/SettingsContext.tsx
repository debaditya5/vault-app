import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'VAULT_SETTINGS';
const DEFAULT_INTERVAL = 3000;

interface SettingsContextType {
  slideshowInterval: number;
  setSlideshowInterval: (ms: number) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [slideshowInterval, setSlideshowIntervalState] = useState(DEFAULT_INTERVAL);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then((json) => {
      if (!json) return;
      try {
        const s = JSON.parse(json);
        if (s.slideshowInterval) setSlideshowIntervalState(s.slideshowInterval);
      } catch {}
    });
  }, []);

  const setSlideshowInterval = async (ms: number) => {
    setSlideshowIntervalState(ms);
    const json = await AsyncStorage.getItem(SETTINGS_KEY);
    const current = json ? JSON.parse(json) : {};
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, slideshowInterval: ms }));
  };

  return (
    <SettingsContext.Provider value={{ slideshowInterval, setSlideshowInterval }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
