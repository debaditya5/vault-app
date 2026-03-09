import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Folder } from '../../types';
import { useVault } from '../../context/VaultContext';

type Sheet = 'menu' | 'rename';

interface Props {
  folder: Folder | null;
  onClose: () => void;
}

export default function FolderActionsSheet({ folder, onClose }: Props) {
  const { renameFolder, removeFolderCover } = useVault();
  const [sheet, setSheet] = useState<Sheet>('menu');
  const [newName, setNewName] = useState('');

  const visible = folder !== null;

  const handleClose = () => {
    setSheet('menu');
    setNewName('');
    onClose();
  };

  const handleRenameSubmit = async () => {
    const trimmed = newName.trim();
    if (!trimmed || !folder) return;
    await renameFolder(folder.id, trimmed);
    handleClose();
  };

  const handleRemoveCover = async () => {
    if (!folder) return;
    await removeFolderCover(folder.id);
    handleClose();
  };

  if (!visible) return null;

  // ── Rename sheet ───────────────────────────────────────────────────────────
  if (sheet === 'rename') {
    return (
      <Modal transparent animationType="fade" visible onRequestClose={handleClose}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>Rename Folder</Text>
            <TextInput
              style={styles.renameInput}
              value={newName}
              onChangeText={setNewName}
              placeholder={folder!.name}
              placeholderTextColor="#555"
              maxLength={50}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleRenameSubmit}
            />
            <View style={styles.renameButtons}>
              <TouchableOpacity style={styles.renameCancelBtn} onPress={handleClose}>
                <Text style={styles.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.renameSaveBtn, !newName.trim() && styles.renameSaveBtnDisabled]}
                onPress={handleRenameSubmit}
                disabled={!newName.trim()}
              >
                <Text style={styles.renameSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  // ── Main action menu ───────────────────────────────────────────────────────
  return (
    <Modal transparent animationType="slide" visible onRequestClose={handleClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetFolderName} numberOfLines={1}>{folder!.name}</Text>

          <TouchableOpacity
            style={styles.sheetRow}
            onPress={() => { setNewName(folder!.name); setSheet('rename'); }}
          >
            <Text style={styles.sheetRowIcon}>✏️</Text>
            <Text style={styles.sheetRowLabel}>Rename</Text>
          </TouchableOpacity>

          <View style={styles.sheetDivider} />

          <TouchableOpacity style={styles.sheetRow} onPress={handleRemoveCover}>
            <Text style={styles.sheetRowIcon}>🖼️</Text>
            <Text style={styles.sheetRowLabel}>Remove Album Cover</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelRow} onPress={handleClose}>
            <Text style={styles.cancelRowText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },

  // ── Sheet ──────────────────────────────────────────────────────────────────
  sheet: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  sheetFolderName: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 24,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  sheetRowIcon: { fontSize: 20 },
  sheetRowLabel: { color: '#fff', fontSize: 16 },
  deleteLabel: { color: '#ff3b30' },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#333',
    marginHorizontal: 20,
  },
  cancelRow: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#2c2c2e',
    marginHorizontal: 16,
    borderRadius: 12,
  },
  cancelRowText: { color: '#0a84ff', fontSize: 16, fontWeight: '600' },

  // ── Rename card ───────────────────────────────────────────────────────────
  renameCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    marginHorizontal: 24,
    padding: 20,
  },
  renameTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  renameInput: {
    backgroundColor: '#2c2c2e',
    color: '#fff',
    fontSize: 16,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  renameButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  renameCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2c2c2e',
    alignItems: 'center',
  },
  renameCancelText: { color: '#888', fontSize: 15, fontWeight: '600' },
  renameSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#0a84ff',
    alignItems: 'center',
  },
  renameSaveBtnDisabled: { backgroundColor: '#1a4a7a' },
  renameSaveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
