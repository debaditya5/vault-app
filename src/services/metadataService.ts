import AsyncStorage from '@react-native-async-storage/async-storage';
import { Folder, MediaItem } from '../types';

const FOLDERS_KEY = 'VAULT_FOLDERS';
const mediaKey = (folderId: string) => `VAULT_MEDIA_${folderId}`;

export async function loadFolders(): Promise<Folder[]> {
  const raw = await AsyncStorage.getItem(FOLDERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveFolders(folders: Folder[]): Promise<void> {
  await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
}

export async function loadMedia(folderId: string): Promise<MediaItem[]> {
  const raw = await AsyncStorage.getItem(mediaKey(folderId));
  return raw ? JSON.parse(raw) : [];
}

export async function saveMedia(folderId: string, items: MediaItem[]): Promise<void> {
  await AsyncStorage.setItem(mediaKey(folderId), JSON.stringify(items));
}

export async function removeFolderMetadata(folderId: string): Promise<void> {
  await AsyncStorage.removeItem(mediaKey(folderId));
}

export async function loadAll(folders: Folder[]): Promise<Record<string, MediaItem[]>> {
  const result: Record<string, MediaItem[]> = {};
  await Promise.all(
    folders.map(async (f) => {
      result[f.id] = await loadMedia(f.id);
    })
  );
  return result;
}
