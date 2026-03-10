import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PinPad from '../components/pin/PinPad';
import PinDots from '../components/pin/PinDots';
import { savePin } from '../services/pinService';
import { useAuth } from '../context/AuthContext';

type Step = 'enter' | 'confirm';

export default function SetupPinScreen() {
  const { unlock, setPinSetStatus } = useAuth();

  const [step, setStep] = useState<Step>('enter');
  const [first, setFirst] = useState('');
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);

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

  const titles: Record<Step, string> = { enter: 'Create PIN', confirm: 'Confirm PIN' };
  const subtitles: Record<Step, string> = {
    enter: 'Enter a 6-digit PIN to protect your vault',
    confirm: 'Enter the same PIN again to confirm',
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{titles[step]}</Text>
        <Text style={styles.subtitle}>{subtitles[step]}</Text>
        <PinDots pinLength={input.length} shake={shake} onShakeComplete={handleShakeComplete} />
        <PinPad onPress={handleDigit} onDelete={handleDelete} />
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
  title: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  subtitle: { color: '#888', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 8 },
});
