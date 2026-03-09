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
  FlatList,
  Share,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { MediaItem } from '../../types';
import { useVault } from '../../context/VaultContext';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function splitFilename(filename: string): { name: string; ext: string } {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return { name: filename, ext: '' };
  return { name: filename.slice(0, lastDot), ext: filename.slice(lastDot) };
}

type Sheet = 'menu' | 'rename' | 'details' | 'move';

interface Props {
  item: MediaItem | null;
  onClose: () => void;
  onEnterSelect: (item: MediaItem) => void;
}

export default function MediaActionsSheet({ item, onClose, onEnterSelect }: Props) {
  const { renameMedia, setFolderCover, deleteMedia, moveMedia, folders } = useVault();
  const [sheet, setSheet] = useState<Sheet>('menu');
  const [newName, setNewName] = useState('');

  const visible = item !== null;
  const otherFolders = folders.filter((f) => f.id !== item?.folderId);

  const handleClose = () => { setSheet('menu'); setNewName(''); onClose(); };

  const handleShare = async () => {
    if (!item) return;
    try { await Share.share({ url: item.vaultUri, title: item.fileName }); }
    catch { Alert.alert('Share failed', 'Could not share this file.'); }
    handleClose();
  };

  const handleUnhide = async () => {
    if (!item) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to save media to your gallery.');
      return;
    }
    try {
      await MediaLibrary.saveToLibraryAsync(item.vaultUri);
      await deleteMedia(item);
      handleClose();
    } catch {
      Alert.alert('Error', 'Failed to save to gallery.');
    }
  };

  const handleRenameSubmit = async () => {
    const trimmed = newName.trim();
    if (!trimmed || !item) return;
    const { ext } = splitFilename(item.fileName);
    await renameMedia(item, trimmed + ext);
    handleClose();
  };

  const handleSetCover = async () => {
    if (!item) return;
    await setFolderCover(item.folderId, item.vaultUri);
    handleClose();
  };

  const handleMove = async (targetFolderId: string) => {
    if (!item) return;
    await moveMedia(item, targetFolderId);
    handleClose();
  };

  if (!visible) return null;

  // ── Details ────────────────────────────────────────────────────────────────
  if (sheet === 'details') {
    return (
      <Modal transparent animationType="fade" visible onRequestClose={handleClose}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose}>
          <View style={s.detailsCard}>
            <Text style={s.detailsTitle}>Details</Text>
            <DetailRow label="Name" value={item!.fileName} />
            <DetailRow label="Date Added" value={formatDate(item!.importedAt)} />
            <DetailRow label="File Size" value={formatBytes(item!.fileSizeBytes ?? 0)} />
            <DetailRow label="Type" value={item!.mediaType === 'video' ? 'Video' : 'Photo'} />
            <TouchableOpacity style={s.okBtn} onPress={handleClose}>
              <Text style={s.okBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  }

  // ── Rename ─────────────────────────────────────────────────────────────────
  if (sheet === 'rename') {
    const { ext } = splitFilename(item!.fileName);
    return (
      <Modal transparent animationType="fade" visible onRequestClose={handleClose}>
        <KeyboardAvoidingView
          style={s.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
          <View style={s.renameCard}>
            <Text style={s.renameTitle}>Rename File</Text>
            <View style={s.renameInputRow}>
              <TextInput
                style={s.renameInput}
                value={newName}
                onChangeText={setNewName}
                placeholder={splitFilename(item!.fileName).name}
                placeholderTextColor="#555"
                maxLength={100}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleRenameSubmit}
              />
              {ext ? <Text style={s.renameExt}>{ext}</Text> : null}
            </View>
            <View style={s.renameButtons}>
              <TouchableOpacity style={s.renameCancelBtn} onPress={handleClose}>
                <Text style={s.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.renameSaveBtn, !newName.trim() && s.renameSaveBtnDisabled]}
                onPress={handleRenameSubmit}
                disabled={!newName.trim()}
              >
                <Text style={s.renameSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  // ── Move to folder ─────────────────────────────────────────────────────────
  if (sheet === 'move') {
    return (
      <Modal transparent animationType="slide" visible onRequestClose={handleClose}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetSubtitle}>Move to…</Text>
            {otherFolders.length === 0 ? (
              <Text style={s.noFoldersText}>No other folders available.</Text>
            ) : (
              <FlatList
                data={otherFolders}
                keyExtractor={(f) => f.id}
                scrollEnabled={otherFolders.length > 5}
                style={{ maxHeight: 320 }}
                renderItem={({ item: folder }) => (
                  <TouchableOpacity style={s.folderRow} onPress={() => handleMove(folder.id)}>
                    <Text style={s.folderRowIcon}>🗂️</Text>
                    <Text style={s.folderRowLabel} numberOfLines={1}>{folder.name}</Text>
                    <Text style={s.folderRowCount}>{folder.itemCount}</Text>
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={s.divider} />}
              />
            )}
            <TouchableOpacity style={s.cancelRow} onPress={handleClose}>
              <Text style={s.cancelRowText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  }

  // ── Main menu ──────────────────────────────────────────────────────────────
  return (
    <Modal transparent animationType="slide" visible onRequestClose={handleClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.sheetSubtitle} numberOfLines={1}>{item!.fileName}</Text>

          <SheetRow icon="📤" label="Share" onPress={handleShare} />
          <View style={s.divider} />
          <SheetRow icon="👁" label="Unhide" onPress={handleUnhide} />
          <View style={s.divider} />
          <SheetRow icon="✏️" label="Rename" onPress={() => { setNewName(splitFilename(item!.fileName).name); setSheet('rename'); }} />
          <View style={s.divider} />
          <SheetRow icon="ℹ️" label="Details" onPress={() => setSheet('details')} />
          {item!.mediaType === 'photo' && (
            <>
              <View style={s.divider} />
              <SheetRow icon="🖼️" label="Set as Album Cover" onPress={handleSetCover} />
            </>
          )}
          <View style={s.divider} />
          <SheetRow icon="📁" label="Move to Folder" onPress={() => setSheet('move')} />
          <View style={s.divider} />
          <SheetRow icon="☑️" label="Select" onPress={() => { handleClose(); onEnterSelect(item!); }} />

          <TouchableOpacity style={s.cancelRow} onPress={handleClose}>
            <Text style={s.cancelRowText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function SheetRow({ icon, label, onPress, danger }: {
  icon: string; label: string; onPress: () => void; danger?: boolean;
}) {
  return (
    <TouchableOpacity style={s.row} onPress={onPress}>
      <Text style={s.rowIcon}>{icon}</Text>
      <Text style={[s.rowLabel, danger && s.rowLabelDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailsRow}>
      <Text style={s.detailsLabel}>{label}</Text>
      <Text style={s.detailsValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },

  sheet: { backgroundColor: '#1c1c1e', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 36 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#444', alignSelf: 'center', marginTop: 10, marginBottom: 12 },
  sheetSubtitle: { color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 8, paddingHorizontal: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, gap: 14 },
  rowIcon: { fontSize: 20, width: 28 },
  rowLabel: { color: '#fff', fontSize: 16 },
  rowLabelDanger: { color: '#ff3b30' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#333', marginHorizontal: 20 },
  cancelRow: { marginTop: 8, marginHorizontal: 16, backgroundColor: '#2c2c2e', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  cancelRowText: { color: '#0a84ff', fontSize: 16, fontWeight: '600' },

  // Move folder picker
  folderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  folderRowIcon: { fontSize: 20 },
  folderRowLabel: { flex: 1, color: '#fff', fontSize: 16 },
  folderRowCount: { color: '#666', fontSize: 14 },
  noFoldersText: { color: '#666', fontSize: 14, textAlign: 'center', padding: 24 },

  // Details card
  detailsCard: { backgroundColor: '#1c1c1e', borderRadius: 16, marginHorizontal: 32, padding: 24, alignSelf: 'center', width: '80%' },
  detailsTitle: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333', gap: 12 },
  detailsLabel: { color: '#888', fontSize: 14, flexShrink: 0 },
  detailsValue: { color: '#fff', fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right' },
  okBtn: { marginTop: 20, backgroundColor: '#0a84ff', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  okBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Rename
  renameCard: { backgroundColor: '#1c1c1e', borderRadius: 16, marginHorizontal: 24, padding: 20 },
  renameTitle: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  renameInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2c2c2e', borderRadius: 10, marginBottom: 16, paddingRight: 12 },
  renameInput: { flex: 1, color: '#fff', fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  renameExt: { color: '#666', fontSize: 16 },
  renameButtons: { flexDirection: 'row', gap: 12 },
  renameCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2c2c2e', alignItems: 'center' },
  renameCancelText: { color: '#888', fontSize: 15, fontWeight: '600' },
  renameSaveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#0a84ff', alignItems: 'center' },
  renameSaveBtnDisabled: { backgroundColor: '#1a4a7a' },
  renameSaveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
