import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDED_KEY = 'VAULT_ONBOARDED';

const STEPS = [
  {
    title: 'Welcome to Vault',
    body: 'Vault keeps your private photos and videos hidden behind a PIN — completely invisible to anyone else on your device.',
    cta: 'Next',
  },
  {
    title: 'Built-in Decoy',
    body: 'When you open the app it shows a "World Time" clock — a convincing cover screen. Long-press the title to reveal the PIN entry screen.',
    cta: 'Next',
  },
  {
    title: 'Set Your PIN',
    body: 'Your default PIN is 000000. Change it in Settings once you\'re in. There is no recovery option, so don\'t forget your new PIN.',
    cta: 'Got it',
  },
];

interface Props {
  onDone: () => void;
}

export default function OnboardingModal({ onDone }: Props) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY).then((val) => {
      if (val === null) setVisible(true);
    });
  }, []);

  useEffect(() => {
    if (visible) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible, step]);

  const advance = () => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      if (step < STEPS.length - 1) {
        setStep((s) => s + 1);
      } else {
        setVisible(false);
        AsyncStorage.setItem(ONBOARDED_KEY, 'true');
        onDone();
      }
    });
  };

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
          {/* Step dots */}
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>

          <TouchableOpacity style={styles.button} onPress={advance} activeOpacity={0.8}>
            <Text style={styles.buttonText}>{current.cta}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 18,
    padding: 28,
    width: '100%',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  dotActive: {
    backgroundColor: '#fff',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  body: {
    color: '#aaa',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 28,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
