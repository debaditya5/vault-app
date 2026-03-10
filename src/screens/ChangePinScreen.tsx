import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import PinPad from '../components/pin/PinPad';
import PinDots from '../components/pin/PinDots';
import { verifyPin, savePin } from '../services/pinService';

type Step = 'verify' | 'new' | 'confirm';

export default function ChangePinScreen() {
  const navigation = useNavigation();

  const [step, setStep] = useState<Step>('verify');
  const [input, setInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [shake, setShake] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const titles: Record<Step, string> = {
    verify: 'Current PIN',
    new: 'New PIN',
    confirm: 'Confirm PIN',
  };
  const subtitles: Record<Step, string> = {
    verify: 'Enter your current 6-digit PIN',
    new: 'Enter a new 6-digit PIN',
    confirm: 'Re-enter your new PIN to confirm',
  };

  const handleComplete = async (value: string) => {
    if (step === 'verify') {
      const valid = await verifyPin(value);
      if (valid) {
        setInput(''); setErrorMsg(''); setStep('new');
      } else {
        setErrorMsg('Incorrect PIN');
        setShake(true);
      }
    } else if (step === 'new') {
      setNewPin(value); setInput(''); setErrorMsg(''); setStep('confirm');
    } else {
      if (value === newPin) {
        await savePin(value);
        navigation.goBack();
      } else {
        setErrorMsg('PINs do not match');
        setShake(true);
      }
    }
  };

  const handleDigit = (digit: string) => {
    if (input.length >= 6) return;
    const updated = input + digit;
    setInput(updated);
    if (updated.length === 6) setTimeout(() => handleComplete(updated), 100);
  };

  const handleDelete = () => { setInput((p) => p.slice(0, -1)); };

  const handleShakeComplete = () => {
    setShake(false); setInput(''); setErrorMsg('');
    if (step === 'confirm') { setNewPin(''); setStep('new'); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{titles[step]}</Text>
        <Text style={styles.subtitle}>{subtitles[step]}</Text>
        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
        <PinDots pinLength={input.length} shake={shake} onShakeComplete={handleShakeComplete} />
        <PinPad onPress={handleDigit} onDelete={handleDelete} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { paddingHorizontal: 20, paddingTop: 8, alignItems: 'flex-end' },
  cancelText: { color: '#0a84ff', fontSize: 17 },
  content: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, paddingBottom: 40,
  },
  title: { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#888', fontSize: 15, textAlign: 'center', marginBottom: 4 },
  errorText: { color: '#ff3b30', fontSize: 14, marginTop: 8 },
});
