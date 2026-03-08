import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { VaultProvider } from './src/context/VaultContext';
import { SettingsProvider } from './src/context/SettingsContext';
import RootNavigator from './src/navigation/RootNavigator';

function AppInner() {
  const { lock, isAuthenticated, isLockSuppressed } = useAuth();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        appState.current === 'active' &&
        (nextState === 'background' || nextState === 'inactive') &&
        isAuthenticated &&
        !isLockSuppressed()
      ) {
        lock();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [isAuthenticated, lock, isLockSuppressed]);

  return <RootNavigator />;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <VaultProvider>
          <SettingsProvider>
            <NavigationContainer>
              <StatusBar style="light" />
              <AppInner />
            </NavigationContainer>
          </SettingsProvider>
        </VaultProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
