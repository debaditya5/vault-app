import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * On Android, files are stored in external app-specific storage
 * (Android/data/com.dk.timematrix/files/vault/) which is visible in the
 * device's Files app. On iOS, internal documents directory is used.
 */
function getVaultRootUri(): string {
  const docDir = FileSystem.documentDirectory ?? '';
  if (Platform.OS === 'android') {
    // docDir = file:///data/user/0/{pkg}/files/
    // external = file:///storage/emulated/0/Android/data/{pkg}/files/
    return docDir.replace(
      /^file:\/\/\/data\/user\/\d+\//,
      'file:///storage/emulated/0/Android/data/'
    ) + 'vault/';
  }
  return docDir + 'vault/';
}

export function vaultRootUri(): string {
  return getVaultRootUri();
}

/** Creates the vault root directory on first launch. */
export async function initVaultRoot(): Promise<void> {
  await FileSystem.makeDirectoryAsync(getVaultRootUri(), { intermediates: true });
}

export async function ensureFolderDir(folderId: string): Promise<string> {
  const dir = getVaultRootUri() + folderId + '/';
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

/**
 * Copies a file from the gallery into the vault.
 * @param storedFilename  Full filename to use on disk, e.g. "lx9abc12-def45678.jpg"
 */
export async function copyToVault(
  sourceUri: string,
  folderId: string,
  storedFilename: string
): Promise<string> {
  const dir = await ensureFolderDir(folderId);
  const dest = dir + storedFilename;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export async function deleteFile(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

/**
 * Moves a vault file to a different folder, preserving its stored filename.
 * @param storedFilename  Filename portion of sourceUri, e.g. "lx9abc12-def45678.jpg"
 */
export async function moveToFolder(
  sourceUri: string,
  targetFolderId: string,
  storedFilename: string
): Promise<string> {
  const dir = await ensureFolderDir(targetFolderId);
  const dest = dir + storedFilename;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  await FileSystem.deleteAsync(sourceUri, { idempotent: true });
  return dest;
}

export async function deleteFolderContents(folderId: string): Promise<void> {
  const dir = getVaultRootUri() + folderId + '/';
  await FileSystem.deleteAsync(dir, { idempotent: true });
}
