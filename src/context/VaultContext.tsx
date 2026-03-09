import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Folder, MediaItem } from '../types';
import * as metadataService from '../services/metadataService';
import * as fileService from '../services/fileService';

interface VaultContextType {
  folders: Folder[];
  mediaByFolder: Record<string, MediaItem[]>;
  isLoading: boolean;
  addFolder: (folder: Folder) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  deleteFolderBatch: (folderIds: string[]) => Promise<void>;
  renameFolder: (folderId: string, newName: string) => Promise<void>;
  removeFolderCover: (folderId: string) => Promise<void>;
  removeFolderCoverBatch: (folderIds: string[]) => Promise<void>;
  renameMedia: (item: MediaItem, newName: string) => Promise<void>;
  rotateMedia: (item: MediaItem) => Promise<void>;
  moveMedia: (item: MediaItem, targetFolderId: string) => Promise<void>;
  moveMediaBatch: (items: MediaItem[], targetFolderId: string) => Promise<void>;
  setFolderCover: (folderId: string, uri: string) => Promise<void>;
  addMediaBatch: (items: MediaItem[]) => Promise<void>;
  deleteMedia: (item: MediaItem) => Promise<void>;
  deleteMediaBatch: (items: MediaItem[]) => Promise<void>;
}

const VaultContext = createContext<VaultContextType | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [mediaByFolder, setMediaByFolder] = useState<Record<string, MediaItem[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const loadedFolders = await metadataService.loadFolders();
      const loadedMedia = await metadataService.loadAll(loadedFolders);
      setFolders(loadedFolders);
      setMediaByFolder(loadedMedia);
      setIsLoading(false);
    })();
  }, []);

  const addFolder = async (folder: Folder) => {
    const updated = [...folders, folder];
    await metadataService.saveFolders(updated);
    setFolders(updated);
    setMediaByFolder((prev) => ({ ...prev, [folder.id]: [] }));
  };

  const deleteFolder = async (folderId: string) => {
    await fileService.deleteFolderContents(folderId);
    await metadataService.removeFolderMetadata(folderId);
    const updated = folders.filter((f) => f.id !== folderId);
    await metadataService.saveFolders(updated);
    setFolders(updated);
    setMediaByFolder((prev) => {
      const next = { ...prev };
      delete next[folderId];
      return next;
    });
  };

  const deleteFolderBatch = async (folderIds: string[]) => {
    if (folderIds.length === 0) return;
    for (const id of folderIds) {
      await fileService.deleteFolderContents(id);
      await metadataService.removeFolderMetadata(id);
    }
    const idSet = new Set(folderIds);
    const updated = folders.filter((f) => !idSet.has(f.id));
    await metadataService.saveFolders(updated);
    setFolders(updated);
    setMediaByFolder((prev) => {
      const next = { ...prev };
      for (const id of folderIds) delete next[id];
      return next;
    });
  };

  const renameFolder = async (folderId: string, newName: string) => {
    const updated = folders.map((f) => f.id === folderId ? { ...f, name: newName } : f);
    await metadataService.saveFolders(updated);
    setFolders(updated);
  };

  const removeFolderCover = async (folderId: string) => {
    const updated = folders.map((f) => f.id === folderId ? { ...f, coverUri: undefined } : f);
    await metadataService.saveFolders(updated);
    setFolders(updated);
  };

  const removeFolderCoverBatch = async (folderIds: string[]) => {
    const idSet = new Set(folderIds);
    const updated = folders.map((f) => idSet.has(f.id) ? { ...f, coverUri: undefined } : f);
    await metadataService.saveFolders(updated);
    setFolders(updated);
  };

  const renameMedia = async (item: MediaItem, newName: string) => {
    const current = mediaByFolder[item.folderId] ?? [];
    const updated = current.map((m) => m.id === item.id ? { ...m, fileName: newName } : m);
    await metadataService.saveMedia(item.folderId, updated);
    setMediaByFolder((prev) => ({ ...prev, [item.folderId]: updated }));
  };

  const rotateMedia = async (item: MediaItem) => {
    const newRotation = ((item.rotation ?? 0) + 90) % 360;
    const current = mediaByFolder[item.folderId] ?? [];
    const updated = current.map((m) => m.id === item.id ? { ...m, rotation: newRotation } : m);
    await metadataService.saveMedia(item.folderId, updated);
    setMediaByFolder((prev) => ({ ...prev, [item.folderId]: updated }));
  };

  const moveMediaBatch = async (items: MediaItem[], targetFolderId: string) => {
    if (items.length === 0) return;
    const sourceFolderId = items[0].folderId;

    // Move all files first
    const movedItems: MediaItem[] = [];
    for (const item of items) {
      const ext = item.fileName.split('.').pop() ?? 'jpg';
      const newUri = await fileService.moveToFolder(item.vaultUri, targetFolderId, item.id, ext);
      movedItems.push({ ...item, folderId: targetFolderId, vaultUri: newUri });
    }

    // Compute updated lists in one shot using current state
    const movedIds = new Set(items.map((m) => m.id));
    const sourceItems = (mediaByFolder[sourceFolderId] ?? []).filter((m) => !movedIds.has(m.id));
    const targetItems = [...(mediaByFolder[targetFolderId] ?? []), ...movedItems];

    await metadataService.saveMedia(sourceFolderId, sourceItems);
    await metadataService.saveMedia(targetFolderId, targetItems);
    setMediaByFolder((prev) => ({ ...prev, [sourceFolderId]: sourceItems, [targetFolderId]: targetItems }));

    const movedUris = new Set(items.map((m) => m.vaultUri));
    const updatedFolders = folders.map((f) => {
      if (f.id === sourceFolderId) {
        return { ...f, itemCount: sourceItems.length, coverUri: f.coverUri && movedUris.has(f.coverUri) ? undefined : f.coverUri };
      }
      if (f.id === targetFolderId) {
        return { ...f, itemCount: targetItems.length };
      }
      return f;
    });
    await metadataService.saveFolders(updatedFolders);
    setFolders(updatedFolders);
  };

  const moveMedia = async (item: MediaItem, targetFolderId: string) => {
    const ext = item.fileName.split('.').pop() ?? 'jpg';
    const newUri = await fileService.moveToFolder(item.vaultUri, targetFolderId, item.id, ext);

    // Remove from source
    const sourceItems = (mediaByFolder[item.folderId] ?? []).filter((m) => m.id !== item.id);
    await metadataService.saveMedia(item.folderId, sourceItems);

    // Add to target
    const updatedItem = { ...item, folderId: targetFolderId, vaultUri: newUri };
    const targetItems = [...(mediaByFolder[targetFolderId] ?? []), updatedItem];
    await metadataService.saveMedia(targetFolderId, targetItems);

    setMediaByFolder((prev) => ({
      ...prev,
      [item.folderId]: sourceItems,
      [targetFolderId]: targetItems,
    }));

    // Update counts; clear source cover only if the moved item was the cover
    const updatedFolders = folders.map((f) => {
      if (f.id === item.folderId) {
        return { ...f, itemCount: sourceItems.length, coverUri: f.coverUri === item.vaultUri ? undefined : f.coverUri };
      }
      if (f.id === targetFolderId) {
        return { ...f, itemCount: targetItems.length };
      }
      return f;
    });
    await metadataService.saveFolders(updatedFolders);
    setFolders(updatedFolders);
  };

  const setFolderCover = async (folderId: string, uri: string) => {
    const updated = folders.map((f) => f.id === folderId ? { ...f, coverUri: uri } : f);
    await metadataService.saveFolders(updated);
    setFolders(updated);
  };

  // Adds multiple items in a single state update — avoids stale-state bug when looping addMedia
  const addMediaBatch = async (items: MediaItem[]) => {
    if (items.length === 0) return;
    const folderId = items[0].folderId;
    const current = mediaByFolder[folderId] ?? [];
    const updated = [...current, ...items];

    await metadataService.saveMedia(folderId, updated);
    setMediaByFolder((prev) => ({ ...prev, [folderId]: updated }));

    const updatedFolders = folders.map((f) =>
      f.id === folderId
        ? { ...f, itemCount: updated.length }
        : f
    );
    await metadataService.saveFolders(updatedFolders);
    setFolders(updatedFolders);
  };

  const deleteMedia = async (item: MediaItem) => {
    await fileService.deleteFile(item.vaultUri);
    const current = mediaByFolder[item.folderId] ?? [];
    const updated = current.filter((m) => m.id !== item.id);
    await metadataService.saveMedia(item.folderId, updated);
    setMediaByFolder((prev) => ({ ...prev, [item.folderId]: updated }));

    const updatedFolders = folders.map((f) =>
      f.id === item.folderId
        ? { ...f, itemCount: updated.length, coverUri: item.vaultUri === f.coverUri ? undefined : f.coverUri }
        : f
    );
    await metadataService.saveFolders(updatedFolders);
    setFolders(updatedFolders);
  };

  // Deletes multiple items in a single state update
  const deleteMediaBatch = async (items: MediaItem[]) => {
    if (items.length === 0) return;
    const folderId = items[0].folderId;
    const deleteIds = new Set(items.map((m) => m.id));

    await Promise.all(items.map((m) => fileService.deleteFile(m.vaultUri)));

    const current = mediaByFolder[folderId] ?? [];
    const updated = current.filter((m) => !deleteIds.has(m.id));
    await metadataService.saveMedia(folderId, updated);
    setMediaByFolder((prev) => ({ ...prev, [folderId]: updated }));

    const deletedUris = new Set(items.map((m) => m.vaultUri));
    const updatedFolders = folders.map((f) =>
      f.id === folderId
        ? { ...f, itemCount: updated.length, coverUri: f.coverUri && deletedUris.has(f.coverUri) ? undefined : f.coverUri }
        : f
    );
    await metadataService.saveFolders(updatedFolders);
    setFolders(updatedFolders);
  };

  return (
    <VaultContext.Provider
      value={{ folders, mediaByFolder, isLoading, addFolder, deleteFolder, deleteFolderBatch, renameFolder, removeFolderCover, removeFolderCoverBatch, renameMedia, rotateMedia, moveMedia, moveMediaBatch, setFolderCover, addMediaBatch, deleteMedia, deleteMediaBatch }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used within VaultProvider');
  return ctx;
}
