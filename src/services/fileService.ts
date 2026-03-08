import { Directory, File, Paths } from 'expo-file-system';

function folderDir(folderId: string): Directory {
  return new Directory(Paths.document, 'vault', folderId);
}

export async function ensureFolderDir(folderId: string): Promise<Directory> {
  const dir = folderDir(folderId);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
}

export async function copyToVault(
  sourceUri: string,
  folderId: string,
  mediaId: string,
  ext: string
): Promise<string> {
  const destDir = await ensureFolderDir(folderId);
  const sourceFile = new File(sourceUri);
  const destFile = new File(destDir, `${mediaId}.${ext}`);
  sourceFile.copy(destFile);
  return destFile.uri;
}

export async function deleteFile(uri: string): Promise<void> {
  const file = new File(uri);
  if (file.exists) {
    file.delete();
  }
}

export async function moveToFolder(
  sourceUri: string,
  targetFolderId: string,
  mediaId: string,
  ext: string
): Promise<string> {
  const destDir = await ensureFolderDir(targetFolderId);
  const sourceFile = new File(sourceUri);
  const destFile = new File(destDir, `${mediaId}.${ext}`);
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
