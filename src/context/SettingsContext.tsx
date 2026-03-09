import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'VAULT_SETTINGS';
const DEFAULT_INTERVAL = 3000;
const DEFAULT_LONG_PRESS = 1500;

export type AuthMethod = 'pin' | 'password';

interface SettingsContextType {
  slideshowInterval: number;
  setSlideshowInterval: (ms: number) => Promise<void>;
  longPressDelay: number;
  setLongPressDelay: (ms: number) => Promise<void>;
  authMethod: AuthMethod;
  setAuthMethod: (method: AuthMethod) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [slideshowInterval, setSlideshowIntervalState] = useState(DEFAULT_INTERVAL);
  const [longPressDelay, setLongPressDelayState] = useState(DEFAULT_LONG_PRESS);
  const [authMethod, setAuthMethodState] = useState<AuthMethod>('pin');

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then((json) => {
      if (!json) return;
      try {
        const s = JSON.parse(json);
        if (s.slideshowInterval) setSlideshowIntervalState(s.slideshowInterval);
        if (s.longPressDelay) setLongPressDelayState(s.longPressDelay);
        if (s.authMethod) setAuthMethodState(s.authMethod);
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

  const setAuthMethod = async (method: AuthMethod) => {
    setAuthMethodState(method);
    await save({ authMethod: method });
  };

  return (
    <SettingsContext.Provider value={{ slideshowInterval, setSlideshowInterval, longPressDelay, setLongPressDelay, authMethod, setAuthMethod }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
