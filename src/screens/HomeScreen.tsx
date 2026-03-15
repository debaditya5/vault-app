import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { formatBytes } from '../utils/formatBytes';
import {
  Animated,
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
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
import { Folder, MediaItem } from '../types';
import MediaThumbnail from '../components/media/MediaThumbnail';
import { RootStackParamList } from '../navigation/RootNavigator';
import { generateId } from '../utils/generateId';

type Nav = StackNavigationProp<RootStackParamList>;

const W = Dimensions.get('window').width;
const CARD_W = (W - 48) / 2;
// card total height: thumbnail (CARD_W) + info area (~44px) + bottom margin (16px)
const CARD_TOTAL_H = CARD_W + 60;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { folders, addFolder, deleteFolder, deleteFolderBatch, renameFolder, removeFolderCoverBatch, mediaByFolder } = useVault();
  const { lock } = useAuth();

  // ── Global search ──────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as Array<{ item: MediaItem; folderId: string }>;
    const results: Array<{ item: MediaItem; folderId: string }> = [];
    for (const folder of folders) {
      for (const item of (mediaByFolder[folder.id] ?? [])) {
        if (item.fileName.toLowerCase().includes(q)) {
          results.push({ item, folderId: folder.id });
        }
      }
    }
    return results;
  }, [searchQuery, folders, mediaByFolder]);

  // ── Search results scrollbar ───────────────────────────────────────────────
  const searchListRef   = useRef<FlatList>(null);
  const searchScrollY   = useRef(0);
  const [sbListH,    setSbListH]    = useState(0);
  const [sbContentH, setSbContentH] = useState(0);
  const sbThumbTopAnim  = useRef(new Animated.Value(0)).current;
  const sbDragStart     = useRef({ thumbTop: 0 });
  const sbThumbHRef     = useRef(0);
  const sbTrackHRef     = useRef(0);
  const sbScrollRef     = useRef(0);

  const SB_MIN_THUMB = 44;
  const sbThumbH = sbListH > 0 && sbContentH > sbListH
    ? Math.max(SB_MIN_THUMB, (sbListH / sbContentH) * sbListH) : 0;
  const sbVisible = sbThumbH > 0;

  useEffect(() => { sbThumbHRef.current = sbThumbH; }, [sbThumbH]);
  useEffect(() => {
    sbTrackHRef.current = Math.max(0, sbListH - sbThumbH);
    sbScrollRef.current = Math.max(0, sbContentH - sbListH);
  }, [sbListH, sbContentH, sbThumbH]);

  // Reset thumb when search query changes
  useEffect(() => { sbThumbTopAnim.setValue(0); }, [searchQuery]);

  const updateSearchThumb = useCallback((y: number) => {
    const track      = sbTrackHRef.current;
    const scrollable = sbScrollRef.current;
    if (track <= 0 || scrollable <= 0) return;
    sbThumbTopAnim.setValue(Math.min(track, Math.max(0, (y / scrollable) * track)));
  }, [sbThumbTopAnim]);

  const searchSbPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        const track      = sbTrackHRef.current;
        const scrollable = sbScrollRef.current;
        const touchY     = e.nativeEvent.locationY;
        const newTop     = Math.min(track, Math.max(0, touchY - sbThumbHRef.current / 2));
        sbThumbTopAnim.setValue(newTop);
        sbDragStart.current.thumbTop = newTop;
        if (scrollable > 0 && track > 0) {
          const y = (newTop / track) * scrollable;
          searchScrollY.current = y;
          searchListRef.current?.scrollToOffset({ offset: y, animated: false });
        }
      },
      onPanResponderMove: (_, g) => {
        const track      = sbTrackHRef.current;
        const scrollable = sbScrollRef.current;
        if (track <= 0 || scrollable <= 0) return;
        const newTop = Math.min(track, Math.max(0, sbDragStart.current.thumbTop + g.dy));
        sbThumbTopAnim.setValue(newTop);
        const y = (newTop / track) * scrollable;
        searchScrollY.current = y;
        searchListRef.current?.scrollToOffset({ offset: y, animated: false });
      },
      onPanResponderRelease:   () => {},
      onPanResponderTerminate: () => {},
    })
  ).current;

  // ── Modal / sheet state ────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [activeFolder, setActiveFolder] = useState<Folder | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);

  // ── Select mode state ──────────────────────────────────────────────────────
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkFolderSheet, setShowBulkFolderSheet] = useState(false);
  const [bulkFolderSubSheet, setBulkFolderSubSheet] = useState<'rename' | 'details' | null>(null);
  const [bulkRenameText, setBulkRenameText] = useState('');

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
  const pendingSwipeItemId = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => { foldersRef.current = folders; }, [folders]);
  useEffect(() => { selectedFolderIdsRef.current = selectedFolderIds; }, [selectedFolderIds]);

  // ── Hide / restore tab bar when entering / leaving select mode ────────────
  useEffect(() => {
    (navigation as any).setOptions({
      tabBarStyle: isSelecting
        ? { display: 'none' }
        : { backgroundColor: '#3a3a3c', borderTopColor: '#505050' },
    });
  }, [isSelecting, navigation]);

  // ── Select mode logic ──────────────────────────────────────────────────────
  const enterSelectMode = useCallback((folder: Folder) => {
    isSelectingRef.current = true;
    pendingSwipeItemId.current = folder.id;
    setIsSelecting(true);
    setSelectedFolderIds(new Set([folder.id]));
  }, []);

  const exitSelectMode = useCallback(() => {
    isSelectingRef.current = false;
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
      // Never block the initial touch — let cards handle taps/long-presses normally.
      onStartShouldSetPanResponder: () => false,
      // Once a child (TouchableOpacity) owns the touch and the finger moves,
      // steal the gesture if we're in select mode.
      onMoveShouldSetPanResponder: () => isSelectingRef.current,
      onPanResponderGrant: (evt) => {
        // Seed swipedIds with the long-pressed folder so we don't toggle it off.
        const seedId = pendingSwipeItemId.current;
        pendingSwipeItemId.current = null;
        swipedIds.current = new Set(seedId ? [seedId] : []);
        const { pageX, pageY } = evt.nativeEvent;
        const folder = getFolderAtPos(pageX, pageY);
        if (!folder) {
          swipeAnchorState.current = true;
          return;
        }
        if (swipedIds.current.has(folder.id)) {
          swipeAnchorState.current = true;
          return;
        }
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
  // ── Selection bar actions (Delete / Details) ───────────────────────────────
  const handleSelectionBarDelete = () => {
    if (selectedFolderIds.size === 1) {
      const folder = folders.find((f) => selectedFolderIds.has(f.id));
      if (folder) setFolderToDelete(folder);
    } else {
      setShowBulkDeleteConfirm(true);
    }
  };

  const handleSelectionBarDetails = () => {
    setBulkFolderSubSheet('details');
  };

  const nextUntitledName = (): string => {
    const existingNames = new Set(folders.map((f) => f.name));
    if (!existingNames.has('Untitled')) return 'Untitled';
    let n = 1;
    while (existingNames.has(`Untitled ${n}`)) n++;
    return `Untitled ${n}`;
  };

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
    exitSelectMode();
  };

  const handleBulkDelete = async () => {
    await deleteFolderBatch([...selectedFolderIds]);
    exitSelectMode();
  };

  const handleMenuBtnPress = () => {
    if (selectedFolderIds.size === 1) {
      setActiveFolder(folders.find((f) => selectedFolderIds.has(f.id)) ?? null);
    } else {
      setShowBulkFolderSheet(true);
    }
  };

  const bulkStats = useMemo(() => {
    let imageCount = 0, videoCount = 0, totalBytes = 0;
    for (const folderId of selectedFolderIds) {
      for (const item of (mediaByFolder[folderId] ?? [])) {
        if (item.mediaType === 'video') videoCount++; else imageCount++;
        totalBytes += item.fileSizeBytes ?? 0;
      }
    }
    return { imageCount, videoCount, totalBytes };
  }, [selectedFolderIds, mediaByFolder]);

  const handleBulkRenameSubmit = async () => {
    const trimmed = bulkRenameText.trim();
    if (!trimmed) return;
    for (const id of selectedFolderIds) {
      await renameFolder(id, trimmed);
    }
    setBulkFolderSubSheet(null);
    setBulkRenameText('');
    setShowBulkFolderSheet(false);
    exitSelectMode();
  };

  const handleBulkRemoveCover = async () => {
    await removeFolderCoverBatch([...selectedFolderIds]);
    setShowBulkFolderSheet(false);
    exitSelectMode();
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
            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.menuIconBtn} onPress={handleMenuBtnPress}>
                <Text style={styles.menuIconText}>···</Text>
              </TouchableOpacity>
            </View>
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

      {/* Global search bar — always visible, hidden when selecting */}
      {!isSelecting && (
        <View style={styles.searchBar}>
          <Text style={styles.searchBarIcon}>🔍</Text>
          <TextInput
            style={styles.searchBarInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search all media…"
            placeholderTextColor="#555"
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && Platform.OS === 'android' && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchBarClearBtn}>
              <Text style={styles.searchBarClearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {searchQuery.trim() ? (
        /* ── Search results grid ── */
        <View style={{ flex: 1 }}>
          <FlatList
            ref={searchListRef}
            data={searchResults}
            keyExtractor={(r) => r.item.id}
            numColumns={3}
            contentContainerStyle={searchResults.length === 0 ? styles.searchEmpty : undefined}
            scrollEventThrottle={16}
            onScroll={(e) => {
              const y = e.nativeEvent.contentOffset.y;
              searchScrollY.current = y;
              updateSearchThumb(y);
            }}
            onLayout={(e) => setSbListH(e.nativeEvent.layout.height)}
            onContentSizeChange={(_, h) => setSbContentH(h)}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No results for "{searchQuery.trim()}"</Text>
              </View>
            }
            renderItem={({ item: result }) => {
              const folderItems = mediaByFolder[result.folderId] ?? [];
              const initialIndex = Math.max(0, folderItems.findIndex((m) => m.id === result.item.id));
              return (
                <MediaThumbnail
                  item={result.item}
                  onPress={() => navigation.navigate('MediaViewer', { items: folderItems, initialIndex })}
                  onLongPress={() => {}}
                />
              );
            }}
          />
          {sbVisible && (
            <View style={styles.sbTrack} pointerEvents="auto" {...searchSbPan.panHandlers}>
              <Animated.View style={{ transform: [{ translateY: sbThumbTopAnim }] }}>
                <View style={[styles.sbThumb, { height: sbThumbH }]} />
              </Animated.View>
            </View>
          )}
        </View>
      ) : (
        /* ── Folder grid ── */
        <View
          ref={listWrapperRef}
          style={{ flex: 1 }}
          {...swipePan.panHandlers}
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
        </View>
      )}

      {/* FAB — hidden when selecting */}
      {!isSelecting && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      )}

      {/* Selection action bar — replaces tab bar while selecting */}
      {isSelecting && (
        <View style={styles.selectionBar}>
          <TouchableOpacity
            style={styles.selectionBarBtn}
            onPress={handleSelectionBarDetails}
            disabled={selectedFolderIds.size === 0}
          >
            <Text style={styles.selectionBarIcon}>ℹ️</Text>
            <Text style={styles.selectionBarLabel}>Details</Text>
          </TouchableOpacity>
          <View style={styles.selectionBarDivider} />
          <TouchableOpacity
            style={styles.selectionBarBtn}
            onPress={handleSelectionBarDelete}
            disabled={selectedFolderIds.size === 0}
          >
            <Text style={styles.selectionBarIcon}>🗑️</Text>
            <Text style={[styles.selectionBarLabel, styles.selectionBarLabelDanger]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bulk folder actions — details sub-sheet */}
      <Modal transparent animationType="fade" visible={bulkFolderSubSheet === 'details'} onRequestClose={() => setBulkFolderSubSheet(null)}>
        <TouchableOpacity style={bs.backdrop} activeOpacity={1} onPress={() => setBulkFolderSubSheet(null)}>
          <View style={bs.detailsCard}>
            <Text style={bs.detailsTitle}>
              {selectedFolderIds.size === 1
                ? folders.find((f) => selectedFolderIds.has(f.id))?.name ?? 'Folder'
                : `${selectedFolderIds.size} Folders`}
            </Text>
            <View style={bs.detailsRow}>
              <Text style={bs.detailsLabel}>Photos</Text>
              <Text style={bs.detailsValue}>{bulkStats.imageCount}</Text>
            </View>
            <View style={bs.detailsRow}>
              <Text style={bs.detailsLabel}>Videos</Text>
              <Text style={bs.detailsValue}>{bulkStats.videoCount}</Text>
            </View>
            <View style={bs.detailsRow}>
              <Text style={bs.detailsLabel}>Total Size</Text>
              <Text style={bs.detailsValue}>{formatBytes(bulkStats.totalBytes)}</Text>
            </View>
            <TouchableOpacity style={bs.okBtn} onPress={() => setBulkFolderSubSheet(null)}>
              <Text style={bs.okBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Bulk folder actions — rename sub-sheet */}
      <Modal transparent animationType="fade" visible={bulkFolderSubSheet === 'rename'} onRequestClose={() => { setBulkFolderSubSheet(null); setBulkRenameText(''); }}>
        <KeyboardAvoidingView style={bs.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { setBulkFolderSubSheet(null); setBulkRenameText(''); }} />
          <View style={bs.renameCard}>
            <Text style={bs.renameTitle}>Rename {selectedFolderIds.size} Folders</Text>
            <TextInput
              style={bs.renameInput}
              value={bulkRenameText}
              onChangeText={setBulkRenameText}
              placeholder="New name"
              placeholderTextColor="#555"
              maxLength={50}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleBulkRenameSubmit}
            />
            <View style={bs.renameButtons}>
              <TouchableOpacity style={bs.renameCancelBtn} onPress={() => { setBulkFolderSubSheet(null); setBulkRenameText(''); }}>
                <Text style={bs.renameCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[bs.renameSaveBtn, !bulkRenameText.trim() && bs.renameSaveBtnDisabled]}
                onPress={handleBulkRenameSubmit}
                disabled={!bulkRenameText.trim()}
              >
                <Text style={bs.renameSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Bulk folder actions — main sheet */}
      <Modal transparent animationType="slide" visible={showBulkFolderSheet} onRequestClose={() => setShowBulkFolderSheet(false)}>
        <TouchableOpacity style={bs.backdrop} activeOpacity={1} onPress={() => setShowBulkFolderSheet(false)}>
          <View style={bs.sheet}>
            <View style={bs.handle} />
            <Text style={bs.subtitle}>{selectedFolderIds.size} folders selected</Text>
            <TouchableOpacity style={bs.row} onPress={() => { setShowBulkFolderSheet(false); setBulkRenameText(''); setBulkFolderSubSheet('rename'); }}>
              <Text style={bs.rowIcon}>✏️</Text>
              <Text style={bs.rowLabel}>Rename</Text>
            </TouchableOpacity>
            <View style={bs.divider} />
            <TouchableOpacity style={bs.row} onPress={() => { handleBulkRemoveCover(); }}>
              <Text style={bs.rowIcon}>🖼️</Text>
              <Text style={bs.rowLabel}>Remove Album Cover</Text>
            </TouchableOpacity>
            <TouchableOpacity style={bs.cancelRow} onPress={() => setShowBulkFolderSheet(false)}>
              <Text style={bs.cancelRowText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <CreateFolderModal
        visible={showCreate}
        defaultName={nextUntitledName()}
        onCreate={handleCreateFolder}
        onCancel={() => setShowCreate(false)}
      />

      <FolderActionsSheet
        folder={activeFolder}
        onClose={() => { setActiveFolder(null); exitSelectMode(); }}
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
    backgroundColor: '#505050',
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
  menuIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2c2c2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIconText: {
    color: '#0a84ff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: -2,
  },
  lockBtn: {
    padding: 8,
  },
  lockBtnText: {
    fontSize: 22,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#3a3a3c',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchBarIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  searchBarInput: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    padding: 0,
  },
  searchBarClearBtn: {
    paddingLeft: 8,
  },
  searchBarClearText: {
    color: '#666',
    fontSize: 15,
  },
  searchEmpty: {
    flex: 1,
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
  selectionBar: {
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
  selectionBarBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 3,
  },
  selectionBarIcon: { fontSize: 22 },
  selectionBarLabel: { color: '#fff', fontSize: 11, fontWeight: '500' },
  selectionBarLabelDanger: { color: '#ff3b30' },
  selectionBarDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#333',
    marginVertical: 8,
  },
  sbTrack: { position: 'absolute', top: 6, right: 0, bottom: 6, width: 20, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2 },
  sbThumb: { width: 4, borderRadius: 2, backgroundColor: '#ffffff', alignSelf: 'center' },
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
});

const bs = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1c1c1e', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 36 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#444', alignSelf: 'center', marginTop: 10, marginBottom: 12 },
  subtitle: { color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 8, paddingHorizontal: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 14 },
  rowIcon: { fontSize: 20, width: 28 },
  rowLabel: { color: '#fff', fontSize: 16 },
  rowLabelDanger: { color: '#ff3b30' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#333', marginHorizontal: 20 },
  cancelRow: { marginTop: 8, marginHorizontal: 16, backgroundColor: '#2c2c2e', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  cancelRowText: { color: '#0a84ff', fontSize: 16, fontWeight: '600' },
  // Details card
  detailsCard: { backgroundColor: '#1c1c1e', borderRadius: 16, marginHorizontal: 32, padding: 24, alignSelf: 'center', width: '80%' },
  detailsTitle: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  detailsLabel: { color: '#888', fontSize: 15 },
  detailsValue: { color: '#fff', fontSize: 15, fontWeight: '600' },
  okBtn: { marginTop: 20, backgroundColor: '#0a84ff', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  okBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Rename card
  renameCard: { backgroundColor: '#1c1c1e', borderRadius: 16, marginHorizontal: 24, padding: 20 },
  renameTitle: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  renameInput: { backgroundColor: '#2c2c2e', color: '#fff', fontSize: 16, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  renameButtons: { flexDirection: 'row', gap: 12 },
  renameCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2c2c2e', alignItems: 'center' },
  renameCancelText: { color: '#888', fontSize: 15, fontWeight: '600' },
  renameSaveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#0a84ff', alignItems: 'center' },
  renameSaveBtnDisabled: { backgroundColor: '#1a4a7a' },
  renameSaveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
