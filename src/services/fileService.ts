import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * On Android, files go to external app-specific storage:
 *   /storage/emulated/0/Android/data/{pkg}/files/vault/
 * This directory is visible in the device Files app but hidden from gallery
 * scanners (via .nomedia). No special permissions are required — an app always
 * has access to its own Android/data/{pkg}/files/ directory.
 *
 * documentDirectory can take two forms on Android:
 *   file:///data/user/0/{pkg}/files/   (standard)
 *   file:///data/data/{pkg}/files/     (some ROMs / older devices)
 * Both are handled by the regex below.
 *
 * When running inside Expo Go the documentDirectory is under
 * host.exp.exponent which we do not own, so we fall back to internal storage
 * for development builds and only use external storage in production builds.
 */
function getVaultRootUri(): string {
  const docDir = FileSystem.documentDirectory ?? '';
  if (Platform.OS === 'android') {
    const pkg = docDir.match(
      /\/(?:data\/user\/\d+|data\/data)\/([^/]+)\/files\//
    )?.[1];
    // host.exp.exponent is the Expo Go client — we can't write to its external dir
    if (pkg && pkg !== 'host.exp.exponent') {
      return `file:///storage/emulated/0/Android/data/${pkg}/files/vault/`;
    }
  }
  return docDir + 'vault/';
}

export function vaultRootUri(): string {
  return getVaultRootUri();
}

/** Returns the human-readable filesystem path (without file:// scheme). */
export function vaultRootPath(): string {
  return getVaultRootUri().replace(/^file:\/\//, '');
}

/** Creates the vault root directory and .nomedia file on first launch. */
export async function initVaultRoot(): Promise<void> {
  const root = getVaultRootUri();
  await FileSystem.makeDirectoryAsync(root, { intermediates: true });
  // .nomedia hides vault files from gallery/media scanner while keeping them
  // visible in the Files app under Android/data/{pkg}/files/vault/
  if (Platform.OS === 'android') {
    const nomedia = root + '.nomedia';
    const info = await FileSystem.getInfoAsync(nomedia);
    if (!info.exists) {
      await FileSystem.writeAsStringAsync(nomedia, '');
    }
  }
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
