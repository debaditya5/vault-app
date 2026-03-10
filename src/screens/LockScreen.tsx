import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PinPad from '../components/pin/PinPad';
import PinDots from '../components/pin/PinDots';
import { verifyPin } from '../services/pinService';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

export default function LockScreen() {
  const { unlock, unlockFalse } = useAuth();
  const { falsePassword } = useSettings();

  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedOut, setLockedOut] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startLockout = () => {
    setLockedOut(true);
    setCountdown(LOCKOUT_SECONDS);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setLockedOut(false);
          setAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleVerify = async (value: string) => {
    // Check false password first — silently opens decoy vault
    if (value.length > 0 && value === falsePassword) {
      unlockFalse();
      return;
    }
    const valid = await verifyPin(value);
    if (valid) {
      unlock();
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setErrorMsg('Incorrect PIN');
      if (newAttempts >= MAX_ATTEMPTS) {
        startLockout();
      } else {
        setShake(true);
      }
    }
  };

  const handleDigit = (digit: string) => {
    if (lockedOut || input.length >= 6) return;
    const updated = input + digit;
    setInput(updated);
    if (updated.length === 6) setTimeout(() => handleVerify(updated), 100);
  };

  const handleDelete = () => {
    if (lockedOut) return;
    setInput((p) => p.slice(0, -1));
  };

  const handleShakeComplete = () => {
    setShake(false);
    setInput('');
    setErrorMsg('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.title}>Vault Locked</Text>

        {lockedOut ? (
          <View style={styles.lockoutContainer}>
            <Text style={styles.lockoutText}>Too many attempts</Text>
            <Text style={styles.countdown}>Try again in {countdown}s</Text>
          </View>
        ) : (
          <>
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            {attempts > 0 && (
              <Text style={styles.attemptsText}>
                {MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts !== 1 ? 's' : ''} remaining
              </Text>
            )}
            <PinDots pinLength={input.length} shake={shake} onShakeComplete={handleShakeComplete} />
            <PinPad onPress={handleDigit} onDelete={handleDelete} disabled={lockedOut} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, paddingBottom: 40,
  },
  lockIcon: { fontSize: 48, marginBottom: 16 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 8 },
  attemptsText: { color: '#ff9500', fontSize: 14, marginBottom: 4 },
  errorText: { color: '#ff3b30', fontSize: 14, marginBottom: 8 },
  lockoutContainer: { alignItems: 'center', marginTop: 24 },
  lockoutText: { color: '#ff3b30', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  countdown: { color: '#fff', fontSize: 32, fontWeight: '700' },
});
