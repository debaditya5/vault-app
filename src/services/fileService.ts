import { Directory, File, Paths } from 'expo-file-system';

function folderDir(folderId: string): Directory {
  return new Directory(Paths.document, 'vault', folderId);
}

/** Creates the vault root directory on first launch. */
export async function initVaultRoot(): Promise<void> {
  const root = new Directory(Paths.document, 'vault');
  if (!root.exists) {
    root.create({ intermediates: true });
  }
}

export async function ensureFolderDir(folderId: string): Promise<Directory> {
  const dir = folderDir(folderId);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
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
  const destDir = await ensureFolderDir(folderId);
  const sourceFile = new File(sourceUri);
  const destFile = new File(destDir, storedFilename);
  sourceFile.copy(destFile);
  return destFile.uri;
}

export async function deleteFile(uri: string): Promise<void> {
  const file = new File(uri);
  if (file.exists) {
    file.delete();
  }
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
  const destDir = await ensureFolderDir(targetFolderId);
  const sourceFile = new File(sourceUri);
  const destFile = new File(destDir, storedFilename);
  sourceFile.copy(destFile);
  sourceFile.delete();
  return destFile.uri;
}

export async function deleteFolderContents(folderId: string): Promise<void> {
  const dir = folderDir(folderId);
  if (dir.exists) {
    dir.delete();
  }
}
