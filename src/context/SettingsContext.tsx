import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'VAULT_SETTINGS';
const DEFAULT_INTERVAL = 3000;
const DEFAULT_LONG_PRESS = 1500;
const DEFAULT_FALSE_PASSWORD = '000000';

interface SettingsContextType {
  slideshowInterval: number;
  setSlideshowInterval: (ms: number) => Promise<void>;
  longPressDelay: number;
  setLongPressDelay: (ms: number) => Promise<void>;
  falsePassword: string;
  setFalsePassword: (pw: string) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [slideshowInterval, setSlideshowIntervalState] = useState(DEFAULT_INTERVAL);
  const [longPressDelay, setLongPressDelayState] = useState(DEFAULT_LONG_PRESS);
  const [falsePassword, setFalsePasswordState] = useState(DEFAULT_FALSE_PASSWORD);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then((json) => {
      if (!json) return;
      try {
        const s = JSON.parse(json);
        if (s.slideshowInterval) setSlideshowIntervalState(s.slideshowInterval);
        if (s.longPressDelay) setLongPressDelayState(s.longPressDelay);
        if (s.falsePassword !== undefined) setFalsePasswordState(s.falsePassword);
      } catch {}
    });
  }, []);

  const save = async (patch: object) => {
    const json = await AsyncStorage.getItem(SETTINGS_KEY);
    const current = json ? JSON.parse(json) : {};
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
  };

  const setSlideshowInterval = async (ms: number) => {
    setSlideshowIntervalState(ms);
    await save({ slideshowInterval: ms });
  };

  const setLongPressDelay = async (ms: number) => {
    setLongPressDelayState(ms);
    await save({ longPressDelay: ms });
  };

  const setFalsePassword = async (pw: string) => {
    setFalsePasswordState(pw);
    await save({ falsePassword: pw });
  };

  return (
    <SettingsContext.Provider value={{ slideshowInterval, setSlideshowInterval, longPressDelay, setLongPressDelay, falsePassword, setFalsePassword }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
