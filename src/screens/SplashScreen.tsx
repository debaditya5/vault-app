import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
} from 'react-native';
import { setStatusBarHidden, setStatusBarTranslucent } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useSettings } from '../context/SettingsContext';

type Nav = StackNavigationProp<RootStackParamList>;

export default function SplashScreen() {
  const navigation = useNavigation<Nav>();
  const { longPressDelay } = useSettings();

  useEffect(() => {
    setStatusBarTranslucent(true);
    setStatusBarHidden(true, 'slide');
    return () => {
      setStatusBarHidden(false, 'none');
      setStatusBarTranslucent(false);
    };
  }, []);

  const pressStart = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [pressing, setPressing] = useState(false);

  const onPressIn = useCallback(() => {
    pressStart.current = Date.now();
    setPressing(true);

    Animated.timing(scaleAnim, {
      toValue: 0.92,
      duration: longPressDelay,
      useNativeDriver: true,
    }).start();

    timerRef.current = setTimeout(() => {
      navigation.replace('Lock');
    }, longPressDelay);
  }, [longPressDelay, navigation, scaleAnim]);

  const onPressOut = useCallback(() => {
    setPressing(false);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  // Use PanResponder so we capture the raw touches reliably
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: onPressIn,
      onPanResponderRelease: onPressOut,
      onPanResponderTerminate: onPressOut,
    })
  ).current;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.textWrapper, { transform: [{ scale: scaleAnim }] }]}
        {...panResponder.panHandlers}
      >
        <Text style={styles.title}>SECRET</Text>
        {pressing && <Text style={styles.hint}>Keep holding…</Text>}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textWrapper: {
    alignItems: 'center',
    padding: 40,
  },
  title: {
    color: '#fff',
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: 12,
  },
  hint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    marginTop: 16,
    letterSpacing: 1,
  },
});
