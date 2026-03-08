import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { migrateToDefault } from '../services/pinService';

interface AuthContextType {
  isAuthenticated: boolean;
  isPinSet: boolean;
  isLoading: boolean;
  unlock: () => void;
  lock: () => void;
  setPinSetStatus: (value: boolean) => void;
  suppressLock: () => void;
  restoreLock: () => void;
  isLockSuppressed: () => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPinSet, setIsPinSet] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const lockSuppressedRef = useRef(false);

  useEffect(() => {
    // Migrate any old 4-digit PIN (or missing PIN) to default "000000"
    migrateToDefault().then(() => {
      setIsPinSet(true);
      setIsLoading(false);
    });
  }, []);

  const unlock = () => setIsAuthenticated(true);
  const lock = () => setIsAuthenticated(false);
  const setPinSetStatus = (value: boolean) => setIsPinSet(value);
  const suppressLock = () => { lockSuppressedRef.current = true; };
  const restoreLock = () => { lockSuppressedRef.current = false; };
  const isLockSuppressed = () => lockSuppressedRef.current;

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isPinSet,
        isLoading,
        unlock,
        lock,
        setPinSetStatus,
        suppressLock,
        restoreLock,
        isLockSuppressed,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
