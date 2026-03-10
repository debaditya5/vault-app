import { useEffect, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { File } from 'expo-file-system';
import { useVault } from '../context/VaultContext';
import { useAuth } from '../context/AuthContext';
import { MediaItem } from '../types';
import { copyToVault } from '../services/fileService';
import { generateId } from '../utils/generateId';

function getExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) return parts[parts.length - 1].split('?')[0].toLowerCase();
  return 'jpg';
}

function mimeFromFilename(filename: string, mediaType: string): string {
  const ext = getExtension(filename);
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    heic: 'image/heic', heif: 'image/heif',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4',
  };
  return map[ext] ?? (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
}

function restoreLockAfterPicker(restoreLock: () => void) {
  let restored = false;
  const doRestore = () => {
    if (restored) return;
    restored = true;
    restoreLock();
    sub.remove();
  };
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') doRestore();
  });
  if (AppState.currentState === 'active') {
    // Android: delay to let lingering inactive transitions settle
    setTimeout(doRestore, Platform.OS === 'android' ? 600 : 0);
  }
}

export default function useMediaImport(folderId: string) {
  const { addMediaBatch } = useVault();
  const { suppressLock, restoreLock, lock, isFalseMode } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const importMedia = async () => {
    suppressLock();
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      restoreLock();
      Alert.alert(
        'Photos Access Required',
        'Please enable photo library access for this app in your device Settings.',
      );
      return;
    }
    setPickerVisible(true);
  };

  const handlePickerCancel = () => {
    setPickerVisible(false);
    restoreLockAfterPicker(restoreLock);
  };

  const handlePickerImport = async (assets: MediaLibrary.Asset[]) => {
    setPickerVisible(false);
    if (!assets.length) {
      restoreLockAfterPicker(restoreLock);
      return;
    }

    setIsImporting(true);
    try {
      const batch: MediaItem[] = [];
      let copyErrors = 0;

      for (const asset of assets) {
        const mediaId = generateId();
        const ext = getExtension(asset.filename);
        const mimeType = mimeFromFilename(asset.filename, asset.mediaType);

        let vaultUri: string;
        let fileSizeBytes = 0;

        if (isFalseMode) {
          vaultUri = asset.uri;
        } else {
          // Resolve ph:// / content:// → file:// so copyToVault can read it
          let fileUri = asset.uri;
          try {
            const info = await MediaLibrary.getAssetInfoAsync(asset);
            if (info.localUri) fileUri = info.localUri;
          } catch {
            // fall back to original uri
          }

          const storedFilename = `${mediaId}.${ext}`;
          try {
            vaultUri = await copyToVault(fileUri, folderId, storedFilename);
          } catch (err) {
            console.error('Failed to copy asset to vault:', err);
            copyErrors++;
            continue;
          }
          try {
            fileSizeBytes = new File(vaultUri).size ?? 0;
          } catch {
            // non-critical
          }
        }

        batch.push({
          id: mediaId,
          folderId,
          fileName: asset.filename || `${mediaId}.${ext}`,
          vaultUri,
          mediaType: asset.mediaType === 'video' ? 'video' : 'photo',
          mimeType,
          width: asset.width ?? 0,
          height: asset.height ?? 0,
          duration: asset.duration > 0 ? asset.duration : undefined, // MediaLibrary gives seconds
          importedAt: new Date().toISOString(),
          fileSizeBytes,
        });
      }

      if (batch.length > 0) await addMediaBatch(batch);
      if (copyErrors > 0) {
        Alert.alert(
          'Import Incomplete',
          `${copyErrors} file${copyErrors > 1 ? 's' : ''} could not be imported. The rest were saved successfully.`,
        );
      }
    } finally {
      restoreLockAfterPicker(restoreLock);
      setIsImporting(false);
    }
  };

  // If the user backgrounds the app while the picker is open, close the picker
  // and restore the lock so the normal splash/lock flow fires on return.
  useEffect(() => {
    if (!pickerVisible) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        setPickerVisible(false);
        restoreLock(); // clear suppression
        lock();        // force lock — AppInner already missed this event while suppressed
      }
    });
    return () => sub.remove();
  }, [pickerVisible]);

  return { importMedia, isImporting, pickerVisible, handlePickerCancel, handlePickerImport };
}
