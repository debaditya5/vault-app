import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import PinPad from '../components/pin/PinPad';
import PinDots from '../components/pin/PinDots';
import { savePin } from '../services/pinService';
import { useAuth } from '../context/AuthContext';

type Step = 'enter' | 'confirm';

export default function SetupPinScreen() {
  const { unlock, setPinSetStatus } = useAuth();
  const [step, setStep] = useState<Step>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [shake, setShake] = useState(false);

  const handleDigit = (digit: string) => {
    if (currentPin.length >= 6) return;
    const updated = currentPin + digit;
    setCurrentPin(updated);

    if (updated.length === 6) {
      setTimeout(() => handleComplete(updated), 100);
    }
  };

  const handleDelete = () => {
    setCurrentPin((p) => p.slice(0, -1));
  };

  const handleComplete = async (pin: string) => {
    if (step === 'enter') {
      setFirstPin(pin);
      setCurrentPin('');
      setStep('confirm');
    } else {
      if (pin === firstPin) {
        await savePin(pin);
        setPinSetStatus(true);
        unlock();
      } else {
        setShake(true);
      }
    }
  };

  const handleShakeComplete = () => {
    setShake(false);
    setCurrentPin('');
    setFirstPin('');
    setStep('enter');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>
          {step === 'enter' ? 'Create PIN' : 'Confirm PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 'enter'
            ? 'Enter a 6-digit PIN to protect your vault'
            : 'Enter the same PIN again to confirm'}
        </Text>
        <PinDots
          pinLength={currentPin.length}
          shake={shake}
          onShakeComplete={handleShakeComplete}
        />
        <PinPad onPress={handleDigit} onDelete={handleDelete} />
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
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
