export interface Folder {
  id: string;
  name: string;
  createdAt: string;
  coverUri?: string;
  itemCount: number;
}

export interface MediaItem {
  id: string;
  folderId: string;
  fileName: string;
  vaultUri: string;
  mediaType: 'photo' | 'video';
  mimeType: string;
  width: number;
  height: number;
  duration?: number;
  importedAt: string;
  fileSizeBytes: number;
  rotation?: number; // 0 | 90 | 180 | 270
}

export interface VaultState {
  folders: Folder[];
  mediaByFolder: Record<string, MediaItem[]>;
}
