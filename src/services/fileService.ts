import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';

/**
 * The resolved vault root is set once during initVaultRoot().
 * On Android we try external app-specific storage first
 * (Android/data/{pkg}/files/vault/) so files are visible in the Files app.
 * If that write fails for any reason (Expo Go, weird device paths, scoped
 * storage edge-cases) we fall back to internal documentDirectory/vault/.
 */
let resolvedVaultRoot: string | null = null;

function getVaultRootUri(): string {
  // resolvedVaultRoot is null only before initVaultRoot() completes — in that
  // narrow window we return the internal path as a safe default.
  return resolvedVaultRoot ?? (FileSystem.documentDirectory ?? '') + 'vault/';
}

export function vaultRootUri(): string {
  return getVaultRootUri();
}

/** Returns the human-readable filesystem path (without file:// scheme). */
export function vaultRootPath(): string {
  return getVaultRootUri().replace(/^file:\/\//, '');
}

/**
 * Creates the vault root directory on first launch.
 * Tries external app-specific storage first; falls back to internal on failure.
 */
export async function initVaultRoot(): Promise<void> {
  if (Platform.OS === 'android') {
    const docDir = FileSystem.documentDirectory ?? '';
    // documentDirectory can be:
    //   file:///data/user/0/{pkg}/files/   (standard)
    //   file:///data/data/{pkg}/files/     (some ROMs / older devices)
    const pkg = docDir.match(
      /\/(?:data\/user\/\d+|data\/data)\/([^/]+)\/files\//
    )?.[1];

    if (pkg && pkg !== 'host.exp.exponent') {
      const externalRoot =
        `file:///storage/emulated/0/Android/data/${pkg}/files/vault/`;
      try {
        await FileSystem.makeDirectoryAsync(externalRoot, { intermediates: true });
        // Verify we can actually write there (scope check may still reject it)
        const probe = externalRoot + '.probe';
        await FileSystem.writeAsStringAsync(probe, '');
        await FileSystem.deleteAsync(probe, { idempotent: true });

        // Success — use external storage
        resolvedVaultRoot = externalRoot;

        // .nomedia keeps gallery scanners out while keeping files visible in
        // the Files app under Android/data/{pkg}/files/vault/
        const nomedia = externalRoot + '.nomedia';
        const info = await FileSystem.getInfoAsync(nomedia);
        if (!info.exists) {
          await FileSystem.writeAsStringAsync(nomedia, '');
        }
        return;
      } catch {
        // External storage not writable on this device/build — fall through
      }
    }
  }

  // Internal storage fallback (always works; also used in Expo Go and iOS)
  const internalRoot = (FileSystem.documentDirectory ?? '') + 'vault/';
  await FileSystem.makeDirectoryAsync(internalRoot, { intermediates: true });
  resolvedVaultRoot = internalRoot;
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

/**
 * Remuxes an MXV file to MP4 using FFmpeg stream-copy (fast, lossless when
 * the inner codec is H.264/H.265). Falls back to full re-encode if stream copy
 * fails due to an incompatible codec. Returns the path to the temp MP4 file;
 * the caller is responsible for deleting it after copying to the vault.
 */
export async function transcodeToMp4(sourceUri: string): Promise<string> {
  const outPath = FileSystem.cacheDirectory + `transcode_${Date.now()}.mp4`;

  // Try stream copy first — instant, no quality loss
  let session = await FFmpegKit.execute(`-i "${sourceUri}" -c copy "${outPath}"`);
  let rc = await session.getReturnCode();

  if (!ReturnCode.isSuccess(rc)) {
    // Stream copy failed (incompatible codec) — fall back to full re-encode
    await FileSystem.deleteAsync(outPath, { idempotent: true });
    session = await FFmpegKit.execute(`-i "${sourceUri}" "${outPath}"`);
    rc = await session.getReturnCode();
    if (!ReturnCode.isSuccess(rc)) {
      throw new Error('FFmpeg transcoding failed for MXV file');
    }
  }

  return outPath;
}
