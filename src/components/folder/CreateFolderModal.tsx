import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

interface CreateFolderModalProps {
  visible: boolean;
  onCreate: (name: string) => void;
  onCancel: () => void;
}

export default function CreateFolderModal({ visible, onCreate, onCancel }: CreateFolderModalProps) {
  const [name, setName] = useState('');

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setName('');
  };

  const handleCancel = () => {
    setName('');
    onCancel();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.dialog}>
          <Text style={styles.title}>New Folder</Text>
          <TextInput
            style={styles.input}
            placeholder="Folder name"
            placeholderTextColor="#666"
            value={name}
            onChangeText={(t) => setName(t.slice(0, 50))}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
            maxLength={50}
          />
          <Text style={styles.charCount}>{name.length}/50</Text>
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createBtn, !name.trim() && styles.disabledBtn]}
              onPress={handleCreate}
              disabled={!name.trim()}
            >
              <Text style={styles.createText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#2c2c2e',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 16,
  },
  charCount: {
    color: '#666',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  cancelText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  createBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#0a84ff',
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.4,
  },
  createText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
