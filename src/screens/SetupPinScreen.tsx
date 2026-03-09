import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  TextInput, TouchableOpacity, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PinPad from '../components/pin/PinPad';
import PinDots from '../components/pin/PinDots';
import { savePin } from '../services/pinService';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

type Step = 'enter' | 'confirm';

export default function SetupPinScreen() {
  const { unlock, setPinSetStatus } = useAuth();
  const { authMethod } = useSettings();

  const [step, setStep] = useState<Step>('enter');
  const [first, setFirst] = useState('');
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isPin = authMethod === 'pin';

  // ── PIN mode ───────────────────────────────────────────────────────────────
  const handleDigit = (digit: string) => {
    if (input.length >= 6) return;
    const updated = input + digit;
    setInput(updated);
    if (updated.length === 6) setTimeout(() => handlePinComplete(updated), 100);
  };

  const handleDelete = () => setInput((p) => p.slice(0, -1));

  const handlePinComplete = async (pin: string) => {
    if (step === 'enter') {
      setFirst(pin); setInput(''); setStep('confirm');
    } else {
      if (pin === first) {
        await savePin(pin); setPinSetStatus(true); unlock();
      } else {
        setShake(true);
      }
    }
  };

  const handleShakeComplete = () => {
    setShake(false); setInput(''); setFirst(''); setStep('enter');
  };

  // ── Password mode ──────────────────────────────────────────────────────────
  const handlePasswordNext = () => {
    if (input.length < 8) { setErrorMsg('Password must be at least 8 characters'); return; }
    if (step === 'enter') {
      setFirst(input); setInput(''); setStep('confirm'); setErrorMsg('');
    } else {
      if (input === first) {
        savePin(input).then(() => { setPinSetStatus(true); unlock(); });
      } else {
        setErrorMsg('Passwords do not match');
        setInput(''); setFirst(''); setStep('enter');
      }
    }
  };

  const titleMap = {
    pin:      { enter: 'Create PIN',      confirm: 'Confirm PIN' },
    password: { enter: 'Create Password', confirm: 'Confirm Password' },
  };
  const subtitleMap = {
    pin:      { enter: 'Enter a 6-digit PIN to protect your vault', confirm: 'Enter the same PIN again to confirm' },
    password: { enter: 'Choose a password (8+ characters)',         confirm: 'Enter the same password again to confirm' },
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.inner}>
        <View style={styles.content}>
          <Text style={styles.title}>{titleMap[authMethod][step]}</Text>
          <Text style={styles.subtitle}>{subtitleMap[authMethod][step]}</Text>

          {isPin ? (
            <>
              <PinDots pinLength={input.length} shake={shake} onShakeComplete={handleShakeComplete} />
              <PinPad onPress={handleDigit} onDelete={handleDelete} />
            </>
          ) : (
            <View style={styles.passwordContainer}>
              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
              <TextInput
                style={styles.passwordInput}
                value={input}
                onChangeText={(t) => { setInput(t); setErrorMsg(''); }}
                placeholder={step === 'enter' ? 'Enter password' : 'Re-enter password'}
                placeholderTextColor="#555"
                secureTextEntry
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handlePasswordNext}
              />
              <TouchableOpacity
                style={[styles.nextBtn, input.length < 8 && styles.nextBtnDisabled]}
                onPress={handlePasswordNext}
                disabled={input.length < 8}
              >
                <Text style={styles.nextBtnText}>{step === 'enter' ? 'Next' : 'Create'}</Text>
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
  title: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  subtitle: { color: '#888', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  errorText: { color: '#ff3b30', fontSize: 14, marginBottom: 8 },
  passwordContainer: { width: '100%', alignItems: 'center', gap: 16, marginTop: 16 },
  passwordInput: {
    width: '100%', backgroundColor: '#1c1c1e', color: '#fff',
    fontSize: 17, paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1, borderColor: '#333',
  },
  nextBtn: {
    width: '100%', backgroundColor: '#0a84ff',
    borderRadius: 12, paddingVertical: 15, alignItems: 'center',
  },
  nextBtnDisabled: { backgroundColor: '#1a4a7a' },
  nextBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
