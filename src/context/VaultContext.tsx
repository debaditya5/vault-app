import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Folder, MediaItem } from '../types';
import * as metadataService from '../services/metadataService';
import * as fileService from '../services/fileService';
import { useAuth } from './AuthContext';

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

const FAKE_FOLDER_ID = 'false-vault-folder';

export function VaultProvider({ children }: { children: ReactNode }) {
  const { isFalseMode, isAuthenticated } = useAuth();

  // ── Real vault state ───────────────────────────────────────────────────────
  const [folders, setFolders] = useState<Folder[]>([]);
  const [mediaByFolder, setMediaByFolder] = useState<Record<string, MediaItem[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  // ── False mode state (ephemeral — never persisted) ─────────────────────────
  const [fakeFolders, setFakeFolders] = useState<Folder[]>([
    { id: FAKE_FOLDER_ID, name: 'My Photos', createdAt: new Date().toISOString(), itemCount: 0 },
  ]);
  const [fakeMedia, setFakeMedia] = useState<Record<string, MediaItem[]>>({
    [FAKE_FOLDER_ID]: [],
  });

  useEffect(() => {
    (async () => {
      await fileService.initVaultRoot();
      const loadedFolders = await metadataService.loadFolders();
      const loadedMedia = await metadataService.loadAll(loadedFolders);
      setFolders(loadedFolders);
      setMediaByFolder(loadedMedia);
      setIsLoading(false);
    })();
  }, []);

  // Reset fake state at the start of each false-mode session so prior fake
  // items never carry over to the next session.
  useEffect(() => {
    if (isFalseMode) {
      setFakeFolders([
        { id: FAKE_FOLDER_ID, name: 'My Photos', createdAt: new Date().toISOString(), itemCount: 0 },
      ]);
      setFakeMedia({ [FAKE_FOLDER_ID]: [] });
    }
  }, [isFalseMode]);

  // ── addFolder ──────────────────────────────────────────────────────────────
  const addFolder = async (folder: Folder) => {
    if (isFalseMode) {
      setFakeFolders((p) => [...p, folder]);
      setFakeMedia((p) => ({ ...p, [folder.id]: [] }));
      return;
    }
    const updated = [...folders, folder];
    await metadataService.saveFolders(updated);
    setFolders(updated);
    setMediaByFolder((prev) => ({ ...prev, [folder.id]: [] }));
  };

  // ── deleteFolder ───────────────────────────────────────────────────────────
  const deleteFolder = async (folderId: string) => {
    if (isFalseMode) {
      setFakeFolders((p) => p.filter((f) => f.id !== folderId));
      setFakeMedia((p) => { const n = { ...p }; delete n[folderId]; return n; });
      return;
    }
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

  // ── deleteFolderBatch ──────────────────────────────────────────────────────
  const deleteFolderBatch = async (folderIds: string[]) => {
    if (isFalseMode) {
      const idSet = new Set(folderIds);
      setFakeFolders((p) => p.filter((f) => !idSet.has(f.id)));
      setFakeMedia((p) => { const n = { ...p }; for (const id of folderIds) delete n[id]; return n; });
      return;
    }
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

  // ── renameFolder ───────────────────────────────────────────────────────────
  const renameFolder = async (folderId: string, newName: string) => {
    if (isFalseMode) {
      setFakeFolders((p) => p.map((f) => f.id === folderId ? { ...f, name: newName } : f));
      return;
    }
    const updated = folders.map((f) => f.id === folderId ? { ...f, name: newName } : f);
    await metadataService.saveFolders(updated);
    setFolders(updated);
  };

  // ── removeFolderCover ──────────────────────────────────────────────────────
  const removeFolderCover = async (folderId: string) => {
    if (isFalseMode) {
      setFakeFolders((p) => p.map((f) => f.id === folderId ? { ...f, coverUri: undefined } : f));
      return;
    }
    const updated = folders.map((f) => f.id === folderId ? { ...f, coverUri: undefined } : f);
    await metadataService.saveFolders(updated);
    setFolders(updated);
  };

  // ── removeFolderCoverBatch ─────────────────────────────────────────────────
  const removeFolderCoverBatch = async (folderIds: string[]) => {
    if (isFalseMode) {
      const idSet = new Set(folderIds);
      setFakeFolders((p) => p.map((f) => idSet.has(f.id) ? { ...f, coverUri: undefined } : f));
      return;
    }
    const idSet = new Set(folderIds);
    const updated = folders.map((f) => idSet.has(f.id) ? { ...f, coverUri: undefined } : f);
    await metadataService.saveFolders(updated);
    setFolders(updated);
  };

  // ── renameMedia ────────────────────────────────────────────────────────────
  const renameMedia = async (item: MediaItem, newName: string) => {
    if (isFalseMode) {
      setFakeMedia((p) => ({
        ...p,
        [item.folderId]: (p[item.folderId] ?? []).map((m) => m.id === item.id ? { ...m, fileName: newName } : m),
      }));
      return;
    }
    const current = mediaByFolder[item.folderId] ?? [];
    const updated = current.map((m) => m.id === item.id ? { ...m, fileName: newName } : m);
    await metadataService.saveMedia(item.folderId, updated);
    setMediaByFolder((prev) => ({ ...prev, [item.folderId]: updated }));
  };

  // ── rotateMedia ────────────────────────────────────────────────────────────
  const rotateMedia = async (item: MediaItem) => {
    const newRotation = ((item.rotation ?? 0) + 90) % 360;
    if (isFalseMode) {
      setFakeMedia((p) => ({
        ...p,
        [item.folderId]: (p[item.folderId] ?? []).map((m) => m.id === item.id ? { ...m, rotation: newRotation } : m),
      }));
      return;
    }
    const current = mediaByFolder[item.folderId] ?? [];
    const updated = current.map((m) => m.id === item.id ? { ...m, rotation: newRotation } : m);
    await metadataService.saveMedia(item.folderId, updated);
    setMediaByFolder((prev) => ({ ...prev, [item.folderId]: updated }));
  };

  // ── moveMediaBatch ─────────────────────────────────────────────────────────
  const moveMediaBatch = async (items: MediaItem[], targetFolderId: string) => {
    if (isFalseMode) {
      if (items.length === 0) return;
      const sourceFolderId = items[0].folderId;
      const movedIds = new Set(items.map((m) => m.id));
      const movedItems = items.map((m) => ({ ...m, folderId: targetFolderId }));
      setFakeMedia((p) => ({
        ...p,
        [sourceFolderId]: (p[sourceFolderId] ?? []).filter((m) => !movedIds.has(m.id)),
        [targetFolderId]: [...(p[targetFolderId] ?? []), ...movedItems],
      }));
      setFakeFolders((p) => p.map((f) => {
        if (f.id === sourceFolderId) return { ...f, itemCount: Math.max(0, f.itemCount - items.length) };
        if (f.id === targetFolderId) return { ...f, itemCount: f.itemCount + items.length };
        return f;
      }));
      return;
    }
    if (items.length === 0) return;
    const sourceFolderId = items[0].folderId;
    const movedItems: MediaItem[] = [];
    for (const item of items) {
      const storedFilename = item.vaultUri.split('/').pop() ?? `${item.id}.bin`;
      const newUri = await fileService.moveToFolder(item.vaultUri, targetFolderId, storedFilename);
      movedItems.push({ ...item, folderId: targetFolderId, vaultUri: newUri });
    }
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

  // ── moveMedia ──────────────────────────────────────────────────────────────
  const moveMedia = async (item: MediaItem, targetFolderId: string) => {
    if (isFalseMode) {
      const updatedItem = { ...item, folderId: targetFolderId };
      setFakeMedia((p) => ({
        ...p,
        [item.folderId]: (p[item.folderId] ?? []).filter((m) => m.id !== item.id),
        [targetFolderId]: [...(p[targetFolderId] ?? []), updatedItem],
      }));
      setFakeFolders((p) => p.map((f) => {
        if (f.id === item.folderId) return { ...f, itemCount: Math.max(0, f.itemCount - 1) };
        if (f.id === targetFolderId) return { ...f, itemCount: f.itemCount + 1 };
        return f;
      }));
      return;
    }
    const storedFilename = item.vaultUri.split('/').pop() ?? `${item.id}.bin`;
    const newUri = await fileService.moveToFolder(item.vaultUri, targetFolderId, storedFilename);
    const sourceItems = (mediaByFolder[item.folderId] ?? []).filter((m) => m.id !== item.id);
    await metadataService.saveMedia(item.folderId, sourceItems);
    const updatedItem = { ...item, folderId: targetFolderId, vaultUri: newUri };
    const targetItems = [...(mediaByFolder[targetFolderId] ?? []), updatedItem];
    await metadataService.saveMedia(targetFolderId, targetItems);
    setMediaByFolder((prev) => ({
      ...prev,
      [item.folderId]: sourceItems,
      [targetFolderId]: targetItems,
    }));
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

  // ── setFolderCover ─────────────────────────────────────────────────────────
  const setFolderCover = async (folderId: string, uri: string) => {
    if (isFalseMode) {
      setFakeFolders((p) => p.map((f) => f.id === folderId ? { ...f, coverUri: uri } : f));
      return;
    }
    const updated = folders.map((f) => f.id === folderId ? { ...f, coverUri: uri } : f);
    await metadataService.saveFolders(updated);
    setFolders(updated);
  };

  // ── addMediaBatch ──────────────────────────────────────────────────────────
  const addMediaBatch = async (items: MediaItem[]) => {
    if (isFalseMode) {
      if (items.length === 0) return;
      const fid = items[0].folderId;
      const currentCount = fakeMedia[fid]?.length ?? 0;
      const newCount = currentCount + items.length;
      setFakeMedia((p) => ({ ...p, [fid]: [...(p[fid] ?? []), ...items] }));
      setFakeFolders((p) => p.map((f) => f.id === fid ? { ...f, itemCount: newCount } : f));
      return;
    }
    if (items.length === 0) return;
    const folderId = items[0].folderId;
    const current = mediaByFolder[folderId] ?? [];
    const updated = [...current, ...items];
    await metadataService.saveMedia(folderId, updated);
    setMediaByFolder((prev) => ({ ...prev, [folderId]: updated }));
    const updatedFolders = folders.map((f) =>
      f.id === folderId ? { ...f, itemCount: updated.length } : f
    );
    await metadataService.saveFolders(updatedFolders);
    setFolders(updatedFolders);
  };

  // ── deleteMedia ────────────────────────────────────────────────────────────
  const deleteMedia = async (item: MediaItem) => {
    if (isFalseMode) {
      setFakeMedia((p) => ({
        ...p,
        [item.folderId]: (p[item.folderId] ?? []).filter((m) => m.id !== item.id),
      }));
      setFakeFolders((p) => p.map((f) => f.id === item.folderId ? { ...f, itemCount: Math.max(0, f.itemCount - 1) } : f));
      return;
    }
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

  // ── deleteMediaBatch ───────────────────────────────────────────────────────
  const deleteMediaBatch = async (items: MediaItem[]) => {
    if (isFalseMode) {
      if (items.length === 0) return;
      const fid = items[0].folderId;
      const deleteIds = new Set(items.map((m) => m.id));
      setFakeMedia((p) => ({ ...p, [fid]: (p[fid] ?? []).filter((m) => !deleteIds.has(m.id)) }));
      setFakeFolders((p) => p.map((f) => f.id === fid ? { ...f, itemCount: Math.max(0, f.itemCount - items.length) } : f));
      return;
    }
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
      value={{
        // Show fake data in false mode OR while unauthenticated (prevents real
        // vault content from flashing during the lock transition).
        folders: (isFalseMode || !isAuthenticated) ? fakeFolders : folders,
        mediaByFolder: (isFalseMode || !isAuthenticated) ? fakeMedia : mediaByFolder,
        isLoading: (isFalseMode || !isAuthenticated) ? false : isLoading,
        addFolder,
        deleteFolder,
        deleteFolderBatch,
        renameFolder,
        removeFolderCover,
        removeFolderCoverBatch,
        renameMedia,
        rotateMedia,
        moveMedia,
        moveMediaBatch,
        setFolderCover,
        addMediaBatch,
        deleteMedia,
        deleteMediaBatch,
      }}
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
