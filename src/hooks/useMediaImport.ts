import { useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { File } from 'expo-file-system';
import { useVault } from '../context/VaultContext';
import { useAuth } from '../context/AuthContext';
import { MediaItem } from '../types';
import { copyToVault } from '../services/fileService';
import { generateId } from '../utils/generateId';

function getExtension(uri: string, mimeType?: string): string {
  if (mimeType) {
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('gif')) return 'gif';
    if (mimeType.includes('webp')) return 'webp';
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('mov') || mimeType.includes('quicktime')) return 'mov';
  }
  const parts = uri.split('.');
  if (parts.length > 1) return parts[parts.length - 1].split('?')[0].toLowerCase();
  return 'jpg';
}

export default function useMediaImport(folderId: string) {
  const { addMediaBatch } = useVault();
  const { suppressLock, restoreLock, isFalseMode } = useAuth();
  const [isImporting, setIsImporting] = useState(false);

  const importMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    suppressLock();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'] as ImagePicker.MediaType[],
      allowsMultipleSelection: true,
      quality: 1,
      exif: false,
    });

    if (result.canceled || !result.assets?.length) {
      // On Android, picker returning can still have trailing inactive transitions;
      // use the same deferred restore to avoid a spurious lock on cancel.
      if (Platform.OS === 'android') {
        setTimeout(restoreLock, 600);
      } else {
        restoreLock();
      }
      return;
    }

    setIsImporting(true);
    try {
      const batch: MediaItem[] = [];
      const assetIdsToDelete: string[] = [];

      for (const asset of result.assets) {
        const mediaId = generateId();
        const ext = getExtension(asset.uri, asset.mimeType ?? undefined);

        let vaultUri: string;
        let fileSizeBytes = 0;

        if (isFalseMode) {
          vaultUri = asset.uri;
        } else {
          // Store with the media ID as filename, keeping the original extension
          const storedFilename = `${mediaId}.${ext}`;
          vaultUri = await copyToVault(asset.uri, folderId, storedFilename);
          try {
            fileSizeBytes = new File(vaultUri).size ?? 0;
          } catch {
            // non-critical
          }
          // assetId can be null on Android when picked from certain sources;
          // fall back to extracting the numeric ID from the content URI.
          const assetId = asset.assetId
            ?? asset.uri.match(/\/(\d+)(?:[?#]|$)/)?.[1]
            ?? null;
          if (assetId) {
            assetIdsToDelete.push(assetId);
          }
        }

        batch.push({
          id: mediaId,
          folderId,
          fileName: asset.fileName ?? `${mediaId}.${ext}`,
          vaultUri,
          mediaType: asset.type === 'video' ? 'video' : 'photo',
          mimeType: asset.mimeType ?? `image/${ext}`,
          width: asset.width ?? 0,
          height: asset.height ?? 0,
          duration: asset.duration != null ? asset.duration / 1000 : undefined,
          importedAt: new Date().toISOString(),
          fileSizeBytes,
        });
      }

      await addMediaBatch(batch);

      // Delete originals — lock stays suppressed so any OS-level confirmation
      // dialog (iOS 14+ / Android 11+) doesn't trigger a vault lock mid-flow.
      if (assetIdsToDelete.length > 0) {
        try {
          // Ensure MediaLibrary write access (image-picker only grants read).
          const { granted } = await MediaLibrary.requestPermissionsAsync();
          if (granted) {
            // On iOS and Android API 30+ this shows a system confirmation dialog.
            // On Android < 30 this may fail silently — no workaround.
            await MediaLibrary.deleteAssetsAsync(assetIdsToDelete);
          }
        } catch {
          // Non-critical — vault already has the copy regardless.
        }
      }
    } finally {
      // On Android, the picker and delete dialog cause lingering inactive state
      // transitions that can fire AFTER the async operation resolves. If we restore
      // the lock while those transitions are still pending, the AppState listener
      // in App.tsx will see an unsuppressed inactive event and lock the vault.
      // Use a deduped restore: subscribe to the next 'active' event, and on Android
      // also add a timeout fallback in case we're already in 'active' state.
      let restored = false;
      const doRestore = () => {
        if (restored) return;
        restored = true;
        restoreLock();
        stateSub.remove();
      };
      const stateSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') doRestore();
      });
      if (AppState.currentState === 'active') {
        if (Platform.OS === 'android') {
          // Delay so any trailing inactive transitions from the picker/dialog settle first
          setTimeout(doRestore, 600);
        } else {
          doRestore();
        }
      }
      setIsImporting(false);
    }
  };

  return { importMedia, isImporting };
}
