import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface PinPadProps {
  onPress: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
];

export default function PinPad({ onPress, onDelete, disabled }: PinPadProps) {
  return (
    <View style={styles.container}>
      {KEYS.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((key, ki) => {
            if (key === '') {
              return <View key={ki} style={styles.keyPlaceholder} />;
            }
            if (key === 'del') {
              return (
                <TouchableOpacity
                  key={ki}
                  style={styles.key}
                  onPress={onDelete}
                  disabled={disabled}
                  activeOpacity={0.6}
                >
                  <Text style={styles.keyText}>⌫</Text>
                </TouchableOpacity>
              );
            }
            return (
              <TouchableOpacity
                key={ki}
                style={styles.key}
                onPress={() => onPress(key)}
                disabled={disabled}
                activeOpacity={0.6}
              >
                <Text style={styles.keyText}>{key}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  key: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyPlaceholder: {
    width: 76,
    height: 76,
  },
  keyText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '600',
  },
});
