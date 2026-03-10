import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { VaultProvider } from './src/context/VaultContext';
import { SettingsProvider } from './src/context/SettingsContext';
import RootNavigator from './src/navigation/RootNavigator';
import { migrateToDefault } from './src/services/pinService';

// Run PIN migration at module load time so it fires on every full JS bundle
// evaluation (including Expo Fast Refresh full reloads), not just on component mount.
migrateToDefault().catch(() => {});

function AppInner() {
  const { lock, isAuthenticated, isLockSuppressed } = useAuth();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const [obscured, setObscured] = useState(AppState.currentState !== 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const isHidden = nextState === 'background' || nextState === 'inactive';
      setObscured(isHidden);
      if (
        appState.current === 'active' &&
        isHidden &&
        isAuthenticated &&
        !isLockSuppressed()
      ) {
        lock();
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [isAuthenticated, lock, isLockSuppressed]);

  return (
    <>
      <RootNavigator />
      {obscured && <View style={styles.privacyOverlay} />}
    </>
  );
}

const styles = StyleSheet.create({
  privacyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
});

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
      <AuthProvider>
        <VaultProvider>
          <SettingsProvider>
            <NavigationContainer>
              <StatusBar style="light" translucent={false} backgroundColor="#000000" />
              <AppInner />
            </NavigationContainer>
          </SettingsProvider>
        </VaultProvider>
      </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
