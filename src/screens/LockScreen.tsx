import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet,
  TextInput, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PinPad from '../components/pin/PinPad';
import PinDots from '../components/pin/PinDots';
import { verifyPin } from '../services/pinService';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

export default function LockScreen() {
  const { unlock } = useAuth();
  const { authMethod } = useSettings();

  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedOut, setLockedOut] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);

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
    const valid = await verifyPin(value);
    if (valid) {
      unlock();
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setErrorMsg(authMethod === 'pin' ? 'Incorrect PIN' : 'Incorrect password');
      if (newAttempts >= MAX_ATTEMPTS) {
        startLockout();
      } else if (authMethod === 'pin') {
        setShake(true); // PinDots handles shake + reset via handleShakeComplete
      }
      // Password mode: input is already cleared by handlePasswordSubmit; error shown inline
    }
  };

  // ── PIN mode handlers ──────────────────────────────────────────────────────
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

  // ── Password mode handler ──────────────────────────────────────────────────
  const handlePasswordSubmit = () => {
    if (input.length < 8) { setErrorMsg('Password must be at least 8 characters'); return; }
    handleVerify(input);
    setInput('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.inner}>
        <View style={styles.content}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.title}>Vault Locked</Text>

          {lockedOut ? (
            <View style={styles.lockoutContainer}>
              <Text style={styles.lockoutText}>Too many attempts</Text>
              <Text style={styles.countdown}>Try again in {countdown}s</Text>
            </View>
          ) : authMethod === 'pin' ? (
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
          ) : (
            <View style={styles.passwordContainer}>
              {attempts > 0 && (
                <Text style={styles.attemptsText}>
                  {MAX_ATTEMPTS - attempts} attempt{MAX_ATTEMPTS - attempts !== 1 ? 's' : ''} remaining
                </Text>
              )}
              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
              <TextInput
                ref={inputRef}
                style={[styles.passwordInput, shake && styles.passwordInputShake]}
                value={input}
                onChangeText={(t) => { setInput(t); setErrorMsg(''); }}
                placeholder="Enter password"
                placeholderTextColor="#555"
                secureTextEntry
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handlePasswordSubmit}
                editable={!lockedOut}
              />
              <TouchableOpacity
                style={[styles.unlockBtn, input.length < 8 && styles.unlockBtnDisabled]}
                onPress={handlePasswordSubmit}
                disabled={input.length < 8}
              >
                <Text style={styles.unlockBtnText}>Unlock</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  inner: { flex: 1 },
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

  // Password mode
  passwordContainer: { width: '100%', alignItems: 'center', gap: 16, marginTop: 16 },
  passwordInput: {
    width: '100%', backgroundColor: '#1c1c1e', color: '#fff',
    fontSize: 17, paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1, borderColor: '#333',
  },
  passwordInputShake: { borderColor: '#ff3b30' },
  unlockBtn: {
    width: '100%', backgroundColor: '#0a84ff',
    borderRadius: 12, paddingVertical: 15, alignItems: 'center',
  },
  unlockBtnDisabled: { backgroundColor: '#1a4a7a' },
  unlockBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
