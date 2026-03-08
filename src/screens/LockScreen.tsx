import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import PinPad from '../components/pin/PinPad';
import PinDots from '../components/pin/PinDots';
import { verifyPin } from '../services/pinService';
import { useAuth } from '../context/AuthContext';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

export default function LockScreen() {
  const { unlock } = useAuth();
  const [currentPin, setCurrentPin] = useState('');
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedOut, setLockedOut] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
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

  const handleDigit = (digit: string) => {
    if (lockedOut || currentPin.length >= 6) return;
    const updated = currentPin + digit;
    setCurrentPin(updated);

    if (updated.length === 6) {
      setTimeout(() => handleComplete(updated), 100);
    }
  };

  const handleDelete = () => {
    if (lockedOut) return;
    setCurrentPin((p) => p.slice(0, -1));
  };

  const handleComplete = async (pin: string) => {
    const valid = await verifyPin(pin);
    if (valid) {
      unlock();
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setShake(true);
      if (newAttempts >= MAX_ATTEMPTS) {
        startLockout();
      }
    }
  };

  const handleShakeComplete = () => {
    setShake(false);
    setCurrentPin('');
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
            {attempts > 0 && (
              <Text style={styles.attemptsText}>
                {MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts !== 1 ? 's' : ''} remaining
              </Text>
            )}
            <PinDots
              pinLength={currentPin.length}
              shake={shake}
              onShakeComplete={handleShakeComplete}
            />
            <PinPad onPress={handleDigit} onDelete={handleDelete} disabled={lockedOut} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  attemptsText: {
    color: '#ff9500',
    fontSize: 14,
    marginBottom: 4,
  },
  lockoutContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  lockoutText: {
    color: '#ff3b30',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  countdown: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
});
