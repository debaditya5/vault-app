import React, { useState } from 'react';
import {
  View, Text, StyleSheet,
  TouchableOpacity, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import PinPad from '../components/pin/PinPad';
import PinDots from '../components/pin/PinDots';
import { verifyPin, savePin } from '../services/pinService';
import { useSettings, AuthMethod } from '../context/SettingsContext';
import { RootStackParamList } from '../navigation/RootNavigator';

type Route = RouteProp<RootStackParamList, 'ChangePin'>;
type Step = 'verify' | 'new' | 'confirm';

export default function ChangePinScreen() {
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const { authMethod, setAuthMethod } = useSettings();

  // targetMethod is provided when switching auth method; otherwise staying same
  const targetMethod: AuthMethod = (route.params as any)?.targetMethod ?? authMethod;
  const switching = targetMethod !== authMethod;

  const [step, setStep] = useState<Step>('verify');
  const [input, setInput] = useState('');
  const [newCredential, setNewCredential] = useState('');
  const [shake, setShake] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Which method applies at each step
  const currentStepMethod: AuthMethod = step === 'verify' ? authMethod : targetMethod;
  const isPin = currentStepMethod === 'pin';
  const minLen = isPin ? 6 : 8;

  // ── Labels ─────────────────────────────────────────────────────────────────
  const titles: Record<Step, string> = {
    verify:  authMethod === 'pin' ? 'Current PIN' : 'Current Password',
    new:     targetMethod === 'pin' ? 'New PIN' : 'New Password',
    confirm: targetMethod === 'pin' ? 'Confirm PIN' : 'Confirm Password',
  };
  const subtitles: Record<Step, string> = {
    verify:  authMethod === 'pin' ? 'Enter your current 6-digit PIN' : 'Enter your current password',
    new:     targetMethod === 'pin' ? 'Enter a new 6-digit PIN' : 'Choose a new password (8+ characters)',
    confirm: targetMethod === 'pin' ? 'Re-enter your new PIN to confirm' : 'Re-enter your new password to confirm',
  };

  // ── Completion logic ───────────────────────────────────────────────────────
  const handleComplete = async (value: string) => {
    if (step === 'verify') {
      const valid = await verifyPin(value);
      if (valid) {
        setInput(''); setErrorMsg(''); setStep('new');
      } else {
        setErrorMsg(authMethod === 'pin' ? 'Incorrect PIN' : 'Incorrect password');
        setShake(true);
      }
    } else if (step === 'new') {
      setNewCredential(value); setInput(''); setErrorMsg(''); setStep('confirm');
    } else {
      if (value === newCredential) {
        await savePin(value);
        if (switching) await setAuthMethod(targetMethod);
        navigation.goBack();
      } else {
        setErrorMsg(targetMethod === 'pin' ? 'PINs do not match' : 'Passwords do not match');
        setShake(true);
      }
    }
  };

  // ── PIN mode handlers ──────────────────────────────────────────────────────
  const handleDigit = (digit: string) => {
    if (input.length >= 6) return;
    const updated = input + digit;
    setInput(updated);
    if (updated.length === 6) setTimeout(() => handleComplete(updated), 100);
  };

  const handleDelete = () => { setInput((p) => p.slice(0, -1)); };

  const handleShakeComplete = () => {
    setShake(false); setInput(''); setErrorMsg('');
    if (step === 'confirm') { setNewCredential(''); setStep('new'); }
  };

  // ── Password mode handler ──────────────────────────────────────────────────
  const handlePasswordSubmit = () => {
    if (input.length < minLen) {
      setErrorMsg(isPin ? 'PIN must be 6 digits' : 'Password must be at least 8 characters');
      return;
    }
    handleComplete(input);
    setInput('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.inner}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{titles[step]}</Text>
          <Text style={styles.subtitle}>{subtitles[step]}</Text>
          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          {isPin ? (
            <>
              <PinDots pinLength={input.length} shake={shake} onShakeComplete={handleShakeComplete} />
              <PinPad onPress={handleDigit} onDelete={handleDelete} />
            </>
          ) : (
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                value={input}
                onChangeText={(t) => { setInput(t); setErrorMsg(''); }}
                placeholder={step === 'verify' ? 'Current password' : step === 'new' ? 'New password' : 'Re-enter password'}
                placeholderTextColor="#555"
                secureTextEntry
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handlePasswordSubmit}
              />
              <TouchableOpacity
                style={[styles.submitBtn, input.length < minLen && styles.submitBtnDisabled]}
                onPress={handlePasswordSubmit}
                disabled={input.length < minLen}
              >
                <Text style={styles.submitBtnText}>
                  {step === 'confirm' ? 'Save' : 'Next'}
                </Text>
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
  header: { paddingHorizontal: 20, paddingTop: 8, alignItems: 'flex-end' },
  cancelText: { color: '#0a84ff', fontSize: 17 },
  content: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, paddingBottom: 40,
  },
  title: { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#888', fontSize: 15, textAlign: 'center', marginBottom: 4 },
  errorText: { color: '#ff3b30', fontSize: 14, marginTop: 8 },
  passwordContainer: { width: '100%', alignItems: 'center', gap: 16, marginTop: 24 },
  passwordInput: {
    width: '100%', backgroundColor: '#1c1c1e', color: '#fff',
    fontSize: 17, paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1, borderColor: '#333',
  },
  submitBtn: {
    width: '100%', backgroundColor: '#0a84ff',
    borderRadius: 12, paddingVertical: 15, alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#1a4a7a' },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
