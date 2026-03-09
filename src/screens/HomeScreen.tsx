import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useVault } from '../context/VaultContext';
import { useAuth } from '../context/AuthContext';
import FolderCard from '../components/folder/FolderCard';
import CreateFolderModal from '../components/folder/CreateFolderModal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import FolderActionsSheet from '../components/folder/FolderActionsSheet';
import { Folder } from '../types';
import { RootStackParamList } from '../navigation/RootNavigator';
import { generateId } from '../utils/generateId';

type Nav = StackNavigationProp<RootStackParamList>;

const W = Dimensions.get('window').width;
const CARD_W = (W - 48) / 2;
// card total height: thumbnail (CARD_W) + info area (~44px) + bottom margin (16px)
const CARD_TOTAL_H = CARD_W + 60;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { folders, addFolder, deleteFolder } = useVault();
  const { lock } = useAuth();

  // ── Modal / sheet state ────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [activeFolder, setActiveFolder] = useState<Folder | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);

  // ── Select mode state ──────────────────────────────────────────────────────
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // ── Stable refs for PanResponder ───────────────────────────────────────────
  const foldersRef = useRef(folders);
  const selectedFolderIdsRef = useRef(selectedFolderIds);
  const isSelectingRef = useRef(isSelecting);
  const listTop = useRef(0);
  const listScrollY = useRef(0);
  const listWrapperRef = useRef<View>(null);

  // Swipe gesture state
  const swipeAnchorState = useRef<boolean>(false);
  const swipedIds = useRef<Set<string>>(new Set());

  // Keep refs in sync
  useEffect(() => { foldersRef.current = folders; }, [folders]);
  useEffect(() => { selectedFolderIdsRef.current = selectedFolderIds; }, [selectedFolderIds]);
  useEffect(() => { isSelectingRef.current = isSelecting; }, [isSelecting]);

  // ── Select mode logic ──────────────────────────────────────────────────────
  const enterSelectMode = useCallback((folder: Folder) => {
    setIsSelecting(true);
    setSelectedFolderIds(new Set([folder.id]));
  }, []);

  const exitSelectMode = useCallback(() => {
    setIsSelecting(false);
    setSelectedFolderIds(new Set());
  }, []);

  const toggleSelect = useCallback((folder: Folder) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      next.has(folder.id) ? next.delete(folder.id) : next.add(folder.id);
      return next;
    });
  }, []);

  const handleFolderPress = useCallback((folder: Folder) => {
    if (isSelectingRef.current) {
      toggleSelect(folder);
    } else {
      navigation.navigate('Folder', { folder });
    }
  }, [navigation, toggleSelect]);

  const handleFolderLongPress = useCallback((folder: Folder) => {
    if (isSelectingRef.current) {
      toggleSelect(folder);
    } else {
      enterSelectMode(folder);
    }
  }, [enterSelectMode, toggleSelect]);

  // ── PanResponder for swipe-to-select ──────────────────────────────────────
  const getFolderAtPos = (pageX: number, pageY: number): Folder | null => {
    const relY = pageY - listTop.current + listScrollY.current;
    // list has 16px top padding
    if (relY < 16) return null;
    const col = pageX < W / 2 ? 0 : 1;
    const row = Math.floor((relY - 16) / CARD_TOTAL_H);
    const idx = row * 2 + col;
    return foldersRef.current[idx] ?? null;
  };

  const swipePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isSelectingRef.current,
      onMoveShouldSetPanResponder: () => isSelectingRef.current,
      onPanResponderGrant: (evt) => {
        swipedIds.current = new Set();
        const { pageX, pageY } = evt.nativeEvent;
        const folder = getFolderAtPos(pageX, pageY);
        if (!folder) return;
        const isCurrentlySelected = selectedFolderIdsRef.current.has(folder.id);
        swipeAnchorState.current = !isCurrentlySelected;
        swipedIds.current.add(folder.id);
        setSelectedFolderIds((prev) => {
          const next = new Set(prev);
          swipeAnchorState.current ? next.add(folder.id) : next.delete(folder.id);
          return next;
        });
      },
      onPanResponderMove: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        const folder = getFolderAtPos(pageX, pageY);
        if (!folder) return;
        if (swipedIds.current.has(folder.id)) return;
        swipedIds.current.add(folder.id);
        setSelectedFolderIds((prev) => {
          const next = new Set(prev);
          swipeAnchorState.current ? next.add(folder.id) : next.delete(folder.id);
          return next;
        });
      },
      onPanResponderRelease: () => { swipedIds.current = new Set(); },
      onPanResponderTerminate: () => { swipedIds.current = new Set(); },
    })
  ).current;

  // ── Folder CRUD ────────────────────────────────────────────────────────────
  const handleCreateFolder = async (name: string) => {
    const folder: Folder = {
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      itemCount: 0,
    };
    await addFolder(folder);
    setShowCreate(false);
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;
    await deleteFolder(folderToDelete.id);
    setFolderToDelete(null);
  };

  const handleBulkDelete = async () => {
    for (const id of selectedFolderIds) {
      await deleteFolder(id);
    }
    exitSelectMode();
  };

  const toggleSelectAll = () => {
    if (selectedFolderIds.size === folders.length) {
      setSelectedFolderIds(new Set());
    } else {
      setSelectedFolderIds(new Set(folders.map((f) => f.id)));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {isSelecting ? (
          <>
            <TouchableOpacity onPress={exitSelectMode} style={styles.headerLeft}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{selectedFolderIds.size} selected</Text>
            <TouchableOpacity onPress={toggleSelectAll} style={styles.headerRight}>
              <Text style={styles.selectAllText}>
                {selectedFolderIds.size === folders.length ? 'None' : 'All'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.headerLeft} />
            <Text style={styles.headerTitle}>Vault</Text>
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={lock} style={styles.lockBtn}>
                <Text style={styles.lockBtnText}>🔒</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* FlatList wrapper — measured for PanResponder layout math */}
      <View
        ref={listWrapperRef}
        style={{ flex: 1 }}
        onLayout={() => {
          listWrapperRef.current?.measure((_x, _y, _w, _h, _px, py) => {
            listTop.current = py;
          });
        }}
      >
        <FlatList
          data={folders}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.list}
          columnWrapperStyle={styles.columnWrapper}
          scrollEnabled={!isSelecting}
          onScroll={(e) => { listScrollY.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <FolderCard
              folder={item}
              onPress={() => handleFolderPress(item)}
              onLongPress={() => handleFolderLongPress(item)}
              selected={isSelecting ? selectedFolderIds.has(item.id) : undefined}
              onMenuPress={() => setActiveFolder(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🗂️</Text>
              <Text style={styles.emptyText}>No folders yet</Text>
              <Text style={styles.emptySubtext}>Tap + to create your first folder</Text>
            </View>
          }
        />

        {/* Swipe-to-select overlay (absorbs touch events when selecting) */}
        {isSelecting && (
          <View style={StyleSheet.absoluteFill} {...swipePan.panHandlers} />
        )}
      </View>

      {/* FAB — hidden when selecting */}
      {!isSelecting && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      )}

      {/* Bulk action bar */}
      {isSelecting && selectedFolderIds.size > 0 && (
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowBulkDeleteConfirm(true)}>
            <Text style={styles.actionIcon}>🗑️</Text>
            <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      <CreateFolderModal
        visible={showCreate}
        onCreate={handleCreateFolder}
        onCancel={() => setShowCreate(false)}
      />

      <FolderActionsSheet
        folder={activeFolder}
        onClose={() => setActiveFolder(null)}
        onDelete={(folder) => setFolderToDelete(folder)}
      />

      <ConfirmDialog
        visible={folderToDelete !== null}
        title="Delete Folder"
        message={`Delete "${folderToDelete?.name}"? This will permanently remove all photos and videos inside.`}
        onConfirm={handleDeleteFolder}
        onCancel={() => setFolderToDelete(null)}
      />

      <ConfirmDialog
        visible={showBulkDeleteConfirm}
        title="Delete Folders"
        message={`Delete ${selectedFolderIds.size} folder${selectedFolderIds.size !== 1 ? 's' : ''}? This will permanently remove all their photos and videos.`}
        onConfirm={async () => { setShowBulkDeleteConfirm(false); await handleBulkDelete(); }}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    width: 72,
  },
  headerRight: {
    width: 72,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  cancelText: {
    color: '#0a84ff',
    fontSize: 17,
  },
  selectAllText: {
    color: '#0a84ff',
    fontSize: 17,
    textAlign: 'right',
  },
  lockBtn: {
    padding: 8,
  },
  lockBtnText: {
    fontSize: 22,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  columnWrapper: {
    gap: 16,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 40,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0a84ff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0a84ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 30,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#1c1c1e',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
    paddingBottom: 28,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    gap: 4,
  },
  actionIcon: {
    fontSize: 22,
  },
  actionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  deleteText: {
    color: '#ff3b30',
  },
});
