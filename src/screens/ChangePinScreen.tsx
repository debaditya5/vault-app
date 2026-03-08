import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import PinPad from '../components/pin/PinPad';
import PinDots from '../components/pin/PinDots';
import { verifyPin, savePin } from '../services/pinService';

type Step = 'verify' | 'new' | 'confirm';

const STEP_LABELS: Record<Step, { title: string; subtitle: string }> = {
  verify:  { title: 'Current PIN',  subtitle: 'Enter your current 6-digit PIN' },
  new:     { title: 'New PIN',      subtitle: 'Enter a new 6-digit PIN' },
  confirm: { title: 'Confirm PIN',  subtitle: 'Re-enter your new PIN to confirm' },
};

export default function ChangePinScreen() {
  const navigation = useNavigation();
  const [step, setStep] = useState<Step>('verify');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [shake, setShake] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleDigit = (digit: string) => {
    if (currentPin.length >= 6) return;
    const updated = currentPin + digit;
    setCurrentPin(updated);
    if (updated.length === 6) {
      setTimeout(() => handleComplete(updated), 100);
    }
  };

  const handleDelete = () => setCurrentPin((p) => p.slice(0, -1));

  const handleComplete = async (pin: string) => {
    if (step === 'verify') {
      const valid = await verifyPin(pin);
      if (valid) {
        setCurrentPin('');
        setErrorMsg('');
        setStep('new');
      } else {
        setErrorMsg('Incorrect PIN');
        setShake(true);
      }
    } else if (step === 'new') {
      setNewPin(pin);
      setCurrentPin('');
      setErrorMsg('');
      setStep('confirm');
    } else {
      if (pin === newPin) {
        await savePin(pin);
        navigation.goBack();
      } else {
        setErrorMsg('PINs do not match');
        setShake(true);
      }
    }
  };

  const handleShakeComplete = () => {
    setShake(false);
    setCurrentPin('');
    if (step === 'confirm') {
      setNewPin('');
      setStep('new');
    }
  };

  const { title, subtitle } = STEP_LABELS[step];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}
        <PinDots pinLength={currentPin.length} shake={shake} onShakeComplete={handleShakeComplete} />
        <PinPad onPress={handleDigit} onDelete={handleDelete} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    alignItems: 'flex-end',
  },
  cancelText: { color: '#0a84ff', fontSize: 17 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  title: { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#888', fontSize: 15, textAlign: 'center' },
  error: { color: '#ff3b30', fontSize: 14, marginTop: 8 },
});
