import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
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
  const { suppressLock, restoreLock } = useAuth();
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
    restoreLock();

    if (result.canceled || !result.assets?.length) return;

    setIsImporting(true);
    try {
      // Copy all files first, build the full batch, then commit in one state update
      const batch: MediaItem[] = [];

      for (const asset of result.assets) {
        const mediaId = generateId();
        const ext = getExtension(asset.uri, asset.mimeType ?? undefined);
        const vaultUri = await copyToVault(asset.uri, folderId, mediaId, ext);

        let fileSizeBytes = 0;
        try {
          fileSizeBytes = new File(vaultUri).size ?? 0;
        } catch {
          // non-critical
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

      // Single state update for all items — fixes stale-state bug with multiple selections
      await addMediaBatch(batch);
    } finally {
      setIsImporting(false);
    }
  };

  return { importMedia, isImporting };
}
