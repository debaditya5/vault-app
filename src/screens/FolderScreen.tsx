import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  Platform,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as FileSystem from 'expo-file-system/legacy';
import { Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useVault } from '../context/VaultContext';
import MediaThumbnail from '../components/media/MediaThumbnail';
import MediaActionsSheet from '../components/media/MediaActionsSheet';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { MediaItem } from '../types';
import { applyVideoRotationForExport } from '../utils/applyExportRotation';
import MediaPickerModal from '../components/media/MediaPickerModal';
import { RootStackParamList } from '../navigation/RootNavigator';
import useMediaImport from '../hooks/useMediaImport';

type Nav = StackNavigationProp<RootStackParamList, 'Folder'>;
type Route = RouteProp<RootStackParamList, 'Folder'>;

type SortKey = 'dateDesc' | 'dateAsc' | 'nameAsc' | 'nameDesc';
type TypeFilter = 'all' | 'photo' | 'video';
type FilterMode = null | 'type' | 'name';

const SORT_LABELS: Record<SortKey, string> = {
  dateDesc: 'Newest first',
  dateAsc:  'Oldest first',
  nameAsc:  'Name A → Z',
  nameDesc: 'Name Z → A',
};

const ITEM_SIZE = Dimensions.get('window').width / 3;

export default function FolderScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { folder } = route.params;
  const { mediaByFolder, deleteMediaBatch, folders, moveMediaBatch } = useVault();
  const { importMedia, isImporting, pickerVisible, handlePickerCancel, handlePickerImport } = useMediaImport(folder.id);

  // ── Select mode ────────────────────────────────────────────────────────────
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeMedia, setActiveMedia] = useState<MediaItem | null>(null);
  const [showBulkSheet, setShowBulkSheet] = useState(false);
  const [showBulkDetails, setShowBulkDetails] = useState(false);
  const [showBulkMove, setShowBulkMove] = useState(false);

  // ── Sort / filter ──────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('dateDesc');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [nameFilter, setNameFilter] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>(null);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const rawItems: MediaItem[] = mediaByFolder[folder.id] ?? [];
  const hasActiveFilter = typeFilter !== 'all' || nameFilter.trim().length > 0;

  const displayedItems = useMemo(() => {
    let result = [...rawItems];
    if (typeFilter !== 'all') result = result.filter((m) => m.mediaType === (typeFilter === 'photo' ? 'photo' : 'video'));
    if (nameFilter.trim()) result = result.filter((m) => m.fileName.toLowerCase().includes(nameFilter.toLowerCase()));
    result.sort((a, b) => {
      switch (sortKey) {
        case 'dateDesc': return new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime();
        case 'dateAsc':  return new Date(a.importedAt).getTime() - new Date(b.importedAt).getTime();
        case 'nameAsc':  return a.fileName.localeCompare(b.fileName);
        case 'nameDesc': return b.fileName.localeCompare(a.fileName);
      }
    });
    return result;
  }, [rawItems, sortKey, typeFilter, nameFilter]);

  const selectedItems = rawItems.filter((m) => selectedIds.has(m.id));

  // ── Stable refs for PanResponder ───────────────────────────────────────────
  const isSelectingRef = useRef(isSelecting);
  const displayedItemsRef = useRef(displayedItems);
  const selectedIdsRef = useRef(selectedIds);
  const listTop = useRef(0);
  const listScrollY = useRef(0);
  const listWrapperRef = useRef<View>(null);
  const swipeAnchorState = useRef<boolean>(false);
  const swipedIds = useRef<Set<string>>(new Set());
  const pendingSwipeItemId = useRef<string | null>(null);

  useEffect(() => { displayedItemsRef.current = displayedItems; }, [displayedItems]);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  // ── Select helpers ─────────────────────────────────────────────────────────
  const enterSelectMode = useCallback((item: MediaItem) => {
    isSelectingRef.current = true;
    pendingSwipeItemId.current = item.id;
    setIsSelecting(true);
    setSelectedIds(new Set([item.id]));
  }, []);

  const exitSelectMode = () => {
    isSelectingRef.current = false;
    setIsSelecting(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (item: MediaItem) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
      return next;
    });
  };

  // ── Tap / long-press ───────────────────────────────────────────────────────
  const handleThumbnailPress = (item: MediaItem) => {
    if (isSelecting) { toggleSelect(item); return; }
    navigation.navigate('MediaViewer', { items: displayedItems, initialIndex: displayedItems.indexOf(item) });
  };

  const handleThumbnailLongPress = (item: MediaItem) => {
    if (isSelecting) { toggleSelect(item); return; }
    enterSelectMode(item);
  };

  // ── PanResponder for swipe-to-select ──────────────────────────────────────
  const getItemAtPos = (pageX: number, pageY: number): MediaItem | null => {
    const relY = pageY - listTop.current + listScrollY.current;
    const col = Math.min(2, Math.max(0, Math.floor(pageX / ITEM_SIZE)));
    const row = Math.floor(relY / ITEM_SIZE);
    const idx = row * 3 + col;
    return displayedItemsRef.current[idx] ?? null;
  };

  const swipePan = useRef(
    PanResponder.create({
      // Never block the initial touch — let cards handle taps/long-presses normally.
      onStartShouldSetPanResponder: () => false,
      // Once a child (TouchableOpacity) owns the touch and the finger moves,
      // steal the gesture if we're in select mode.
      onMoveShouldSetPanResponder: () => isSelectingRef.current,
      onPanResponderGrant: (evt) => {
        // If this gesture was triggered by a long-press, seed swipedIds with the
        // already-selected item so we don't accidentally toggle it off.
        const seedId = pendingSwipeItemId.current;
        pendingSwipeItemId.current = null;
        swipedIds.current = new Set(seedId ? [seedId] : []);
        // Always add when initiating from long-press; for in-progress swipes,
        // anchor on whether the touched item was already selected.
        const { pageX, pageY } = evt.nativeEvent;
        const item = getItemAtPos(pageX, pageY);
        if (!item) {
          swipeAnchorState.current = true;
          return;
        }
        if (swipedIds.current.has(item.id)) {
          swipeAnchorState.current = true;
          return;
        }
        const isCurrentlySelected = selectedIdsRef.current.has(item.id);
        swipeAnchorState.current = !isCurrentlySelected;
        swipedIds.current.add(item.id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          swipeAnchorState.current ? next.add(item.id) : next.delete(item.id);
          return next;
        });
      },
      onPanResponderMove: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        const item = getItemAtPos(pageX, pageY);
        if (!item) return;
        if (swipedIds.current.has(item.id)) return;
        swipedIds.current.add(item.id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          swipeAnchorState.current ? next.add(item.id) : next.delete(item.id);
          return next;
        });
      },
      onPanResponderRelease: () => { swipedIds.current = new Set(); },
      onPanResponderTerminate: () => { swipedIds.current = new Set(); },
    })
  ).current;

  // ── Bulk actions ───────────────────────────────────────────────────────────
  const handleUnhide = async () => {
    if (Platform.OS === 'ios') {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access in Settings.'); return; }
    }
    const toDelete: MediaItem[] = [];
    let lastError = '';
    for (const item of selectedItems) {
      let tempUri: string | null = null;
      try {
        const rotation = item.rotation ?? 0;
        const isRotatedVideo = item.mediaType === 'video' && rotation !== 0;

        let uriToSave: string;
        if (isRotatedVideo) {
          // Patch the MP4 tkhd matrix so the exported file carries the rotation.
          tempUri = Paths.cache.uri + item.id + '_export_' + item.fileName;
          await applyVideoRotationForExport(item.vaultUri, rotation, tempUri);
          uriToSave = tempUri;
        } else if (Platform.OS === 'android') {
          tempUri = Paths.cache.uri + item.id + '_' + item.fileName;
          await FileSystem.copyAsync({ from: item.vaultUri, to: tempUri });
          uriToSave = tempUri;
        } else {
          uriToSave = item.vaultUri;
        }

        await MediaLibrary.createAssetAsync(uriToSave);
        toDelete.push(item);
      } catch (e: any) {
        lastError = e?.message ?? String(e);
      } finally {
        if (tempUri) FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
      }
    }
    if (toDelete.length > 0) {
      await deleteMediaBatch(toDelete);
    } else if (lastError) {
      Alert.alert('Save Failed', lastError);
    }
    exitSelectMode();
  };

  const handleDeleteSelected = async () => { await deleteMediaBatch(selectedItems); exitSelectMode(); };

  const handleMenuBtnPress = () => {
    if (selectedIds.size === 1) {
      setActiveMedia(rawItems.find((m) => selectedIds.has(m.id)) ?? null);
    } else {
      setShowBulkSheet(true);
    }
  };

  const handleBulkMove = async (targetFolderId: string) => {
    setShowBulkMove(false);
    await moveMediaBatch(selectedItems, targetFolderId);
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
            <Text style={styles.headerTitle}>{selectedIds.size} selected</Text>
            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.menuIconBtn} onPress={handleMenuBtnPress}>
                <Text style={styles.menuIconText}>···</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerLeft}>
              <Text style={styles.backText}>‹ Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{folder.name}</Text>
            {/* Sort + Filter icons */}
            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowSortSheet(true)}>
                <Text style={styles.headerIcon}>↕</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowFilterMenu(true)}>
                <FunnelIcon active={hasActiveFilter} />
                {hasActiveFilter && <View style={styles.filterDot} />}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Inline type filter chips */}
      {filterMode === 'type' && !isSelecting && (
        <View style={styles.inlineBar}>
          {(['all', 'photo', 'video'] as TypeFilter[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.chip, typeFilter === t && styles.chipActive]}
              onPress={() => setTypeFilter(t)}
            >
              <Text style={[styles.chipText, typeFilter === t && styles.chipTextActive]}>
                {t === 'all' ? 'All' : t === 'photo' ? '📷 Photos' : '🎬 Videos'}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.inlineClear} onPress={() => { setFilterMode(null); setTypeFilter('all'); }}>
            <Text style={styles.inlineClearText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Inline name search */}
      {filterMode === 'name' && !isSelecting && (
        <View style={styles.inlineBar}>
          <View style={styles.searchRow}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              value={nameFilter}
              onChangeText={setNameFilter}
              placeholder="Search by name…"
              placeholderTextColor="#555"
              autoFocus
              clearButtonMode="while-editing"
            />
          </View>
          <TouchableOpacity style={styles.inlineClear} onPress={() => { setFilterMode(null); setNameFilter(''); }}>
            <Text style={styles.inlineClearText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Grid */}
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
          data={displayedItems}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={styles.list}
          scrollEnabled={!isSelecting}
          onScroll={(e) => { listScrollY.current = e.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <SelectableMediaThumbnail
              item={item}
              isSelecting={isSelecting}
              isSelected={selectedIds.has(item.id)}
              onPress={() => handleThumbnailPress(item)}
              onLongPress={() => handleThumbnailLongPress(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📷</Text>
              <Text style={styles.emptyText}>{nameFilter || typeFilter !== 'all' ? 'No results' : 'No media yet'}</Text>
              <Text style={styles.emptySubtext}>{nameFilter || typeFilter !== 'all' ? 'Try a different search or filter' : 'Tap + to import photos or videos'}</Text>
            </View>
          }
        />

      </View>

      {/* Selection action bar */}
      {isSelecting && selectedIds.size > 0 && (
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleUnhide}>
            <Text style={styles.actionIcon}>👁</Text><Text style={styles.actionText}>Unhide</Text>
          </TouchableOpacity>
          <View style={styles.actionDivider} />
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowDeleteConfirm(true)}>
            <Text style={styles.actionIcon}>🗑️</Text><Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      <MediaPickerModal
        visible={pickerVisible}
        onCancel={handlePickerCancel}
        onImport={handlePickerImport}
      />

      {/* Import FAB */}
      {!isSelecting && (
        <TouchableOpacity
          style={[styles.fab, isImporting && styles.fabDisabled]}
          onPress={importMedia} disabled={isImporting}
        >
          <Text style={styles.fabIcon}>{isImporting ? '⏳' : '+'}</Text>
        </TouchableOpacity>
      )}

      {/* ── Sort sheet ──────────────────────────────────────────────────────── */}
      <Modal transparent animationType="slide" visible={showSortSheet} onRequestClose={() => setShowSortSheet(false)}>
        <TouchableOpacity style={ss.backdrop} activeOpacity={1} onPress={() => setShowSortSheet(false)}>
          <View style={ss.sheet}>
            <View style={ss.handle} />
            <Text style={ss.title}>Sort by</Text>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <TouchableOpacity key={key} style={ss.row} onPress={() => { setSortKey(key); setShowSortSheet(false); }}>
                <Text style={[ss.rowLabel, key === sortKey && ss.rowLabelActive]}>{SORT_LABELS[key]}</Text>
                {key === sortKey && <Text style={ss.check}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Filter menu (small dropdown near top right) ─────────────────────── */}
      <Modal transparent animationType="fade" visible={showFilterMenu} onRequestClose={() => setShowFilterMenu(false)}>
        <TouchableOpacity style={ss.menuBackdrop} activeOpacity={1} onPress={() => setShowFilterMenu(false)}>
          <View style={ss.filterMenu}>
            <TouchableOpacity
              style={ss.filterOption}
              onPress={() => { setFilterMode('type'); setShowFilterMenu(false); }}
            >
              <Text style={ss.filterOptionIcon}>📷</Text>
              <Text style={[ss.filterOptionLabel, filterMode === 'type' && ss.filterOptionLabelActive]}>Type</Text>
              {filterMode === 'type' && <Text style={ss.filterOptionCheck}>✓</Text>}
            </TouchableOpacity>
            <View style={ss.filterMenuDivider} />
            <TouchableOpacity
              style={ss.filterOption}
              onPress={() => { setFilterMode('name'); setShowFilterMenu(false); }}
            >
              <Text style={ss.filterOptionIcon}>🔤</Text>
              <Text style={[ss.filterOptionLabel, filterMode === 'name' && ss.filterOptionLabelActive]}>Name</Text>
              {filterMode === 'name' && <Text style={ss.filterOptionCheck}>✓</Text>}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ConfirmDialog
        visible={showDeleteConfirm}
        title="Delete Items"
        message={`Permanently delete ${selectedIds.size} item${selectedIds.size !== 1 ? 's' : ''} from your vault?`}
        onConfirm={async () => { setShowDeleteConfirm(false); await handleDeleteSelected(); }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <MediaActionsSheet item={activeMedia} onClose={() => { setActiveMedia(null); exitSelectMode(); }} />

      {/* ── Bulk action sheet ───────────────────────────────────────────────── */}
      <Modal transparent animationType="slide" visible={showBulkSheet} onRequestClose={() => setShowBulkSheet(false)}>
        <TouchableOpacity style={bs.backdrop} activeOpacity={1} onPress={() => setShowBulkSheet(false)}>
          <View style={bs.sheet}>
            <View style={bs.handle} />
            <Text style={bs.subtitle}>{selectedIds.size} items selected</Text>

            <TouchableOpacity style={bs.row} onPress={() => { setShowBulkSheet(false); setShowBulkDetails(true); }}>
              <Text style={bs.icon}>ℹ️</Text><Text style={bs.label}>Details</Text>
            </TouchableOpacity>
            <View style={bs.divider} />
            <TouchableOpacity style={bs.row} onPress={() => { setShowBulkSheet(false); setShowBulkMove(true); }}>
              <Text style={bs.icon}>📁</Text><Text style={bs.label}>Move to Folder</Text>
            </TouchableOpacity>

            <TouchableOpacity style={bs.cancelRow} onPress={() => setShowBulkSheet(false)}>
              <Text style={bs.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Bulk details modal ──────────────────────────────────────────────── */}
      <Modal transparent animationType="fade" visible={showBulkDetails} onRequestClose={() => setShowBulkDetails(false)}>
        <TouchableOpacity style={bs.backdrop} activeOpacity={1} onPress={() => setShowBulkDetails(false)}>
          <View style={bs.detailsCard}>
            <Text style={bs.detailsTitle}>{selectedIds.size} Items Selected</Text>
            <View style={bs.detailsRow}>
              <Text style={bs.detailsLabel}>Photos</Text>
              <Text style={bs.detailsValue}>{selectedItems.filter((m) => m.mediaType === 'photo').length}</Text>
            </View>
            <View style={bs.detailsRow}>
              <Text style={bs.detailsLabel}>Videos</Text>
              <Text style={bs.detailsValue}>{selectedItems.filter((m) => m.mediaType === 'video').length}</Text>
            </View>
            <View style={bs.detailsRow}>
              <Text style={bs.detailsLabel}>Total Size</Text>
              <Text style={bs.detailsValue}>{formatBytes(selectedItems.reduce((s, m) => s + (m.fileSizeBytes ?? 0), 0))}</Text>
            </View>
            <TouchableOpacity style={bs.okBtn} onPress={() => setShowBulkDetails(false)}>
              <Text style={bs.okBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Bulk move modal ─────────────────────────────────────────────────── */}
      <Modal transparent animationType="slide" visible={showBulkMove} onRequestClose={() => setShowBulkMove(false)}>
        <TouchableOpacity style={bs.backdrop} activeOpacity={1} onPress={() => setShowBulkMove(false)}>
          <View style={bs.sheet}>
            <View style={bs.handle} />
            <Text style={bs.subtitle}>Move {selectedIds.size} items to…</Text>
            {folders.filter((f) => f.id !== folder.id).length === 0 ? (
              <Text style={bs.emptyText}>No other folders available.</Text>
            ) : (
              <FlatList
                data={folders.filter((f) => f.id !== folder.id)}
                keyExtractor={(f) => f.id}
                scrollEnabled={folders.length > 6}
                style={{ maxHeight: 320 }}
                renderItem={({ item: f }) => (
                  <TouchableOpacity style={bs.folderRow} onPress={() => handleBulkMove(f.id)}>
                    <Text style={bs.folderIcon}>🗂️</Text>
                    <Text style={bs.folderName} numberOfLines={1}>{f.name}</Text>
                    <Text style={bs.folderCount}>{f.itemCount}</Text>
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={bs.divider} />}
              />
            )}
            <TouchableOpacity style={bs.cancelRow} onPress={() => setShowBulkMove(false)}>
              <Text style={bs.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Funnel icon (3 decreasing horizontal bars) ───────────────────────────────
function FunnelIcon({ active = false }: { active?: boolean }) {
  const color = active ? '#fff' : '#0a84ff';
  return (
    <View style={{ gap: 3, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 14, height: 2, backgroundColor: color, borderRadius: 1 }} />
      <View style={{ width: 9, height: 2, backgroundColor: color, borderRadius: 1 }} />
      <View style={{ width: 4, height: 2, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
}

// ─── Selectable thumbnail ──────────────────────────────────────────────────────
function SelectableMediaThumbnail({ item, isSelecting, isSelected, onPress, onLongPress }: {
  item: MediaItem; isSelecting: boolean; isSelected: boolean;
  onPress: () => void; onLongPress: () => void;
}) {
  return (
    <View style={thumbStyles.wrapper}>
      <MediaThumbnail item={item} onPress={onPress} onLongPress={onLongPress} />
      {isSelecting && (
        <View style={thumbStyles.checkContainer}>
          <View style={[thumbStyles.check, isSelected && thumbStyles.checkSelected]}>
            {isSelected && <Text style={thumbStyles.checkMark}>✓</Text>}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12 },
  headerLeft: { width: 72 },
  headerRight: { width: 72, flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  backText: { color: '#0a84ff', fontSize: 17 },
  cancelText: { color: '#0a84ff', fontSize: 17 },
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
  headerTitle: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  headerIconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1c1c1e', justifyContent: 'center', alignItems: 'center' },
  headerIcon: { color: '#0a84ff', fontSize: 16 },
  filterDot: { position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#ff3b30' },

  // Inline filter bars
  inlineBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 8, gap: 6,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#1c1c1e' },
  chipActive: { backgroundColor: '#0a84ff' },
  chipText: { color: '#888', fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  searchRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1c1c1e', borderRadius: 10, paddingHorizontal: 10,
  },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 8 },
  inlineClear: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
  inlineClearText: { color: '#888', fontSize: 14 },

  list: { paddingBottom: 120 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubtext: { color: '#666', fontSize: 14 },

  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', backgroundColor: '#1c1c1e',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#333', paddingBottom: 28,
  },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, gap: 4 },
  actionIcon: { fontSize: 22 },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '500' },
  deleteText: { color: '#ff3b30' },
  actionDivider: { width: StyleSheet.hairlineWidth, backgroundColor: '#333', marginVertical: 10 },

  fab: {
    position: 'absolute', right: 24, bottom: 40,
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#0a84ff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0a84ff', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
  fabDisabled: { backgroundColor: '#444' },
  fabIcon: { color: '#fff', fontSize: 28, lineHeight: 30 },
});

const thumbStyles = StyleSheet.create({
  wrapper: { position: 'relative' },
  checkContainer: { position: 'absolute', top: 6, right: 6, zIndex: 10 },
  check: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center',
  },
  checkSelected: { backgroundColor: '#0a84ff', borderColor: '#0a84ff' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

// ─── Bulk action helpers ─────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const bs = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1c1c1e', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 36 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#444', alignSelf: 'center', marginTop: 10, marginBottom: 12 },
  subtitle: { color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 8, paddingHorizontal: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, gap: 14 },
  icon: { fontSize: 20, width: 28 },
  label: { color: '#fff', fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#333', marginHorizontal: 20 },
  cancelRow: { marginTop: 8, marginHorizontal: 16, backgroundColor: '#2c2c2e', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  cancelText: { color: '#0a84ff', fontSize: 16, fontWeight: '600' },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center', padding: 24 },
  folderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  folderIcon: { fontSize: 20 },
  folderName: { flex: 1, color: '#fff', fontSize: 16 },
  folderCount: { color: '#666', fontSize: 14 },
  detailsCard: {
    backgroundColor: '#1c1c1e', borderRadius: 16, marginHorizontal: 32, padding: 24,
    alignSelf: 'center', width: '80%',
  },
  detailsTitle: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  detailsRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333',
  },
  detailsLabel: { color: '#888', fontSize: 14 },
  detailsValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
  okBtn: { marginTop: 20, backgroundColor: '#0a84ff', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  okBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

// ─── Sort / filter sheet styles ─────────────────────────────────────────────────
const ss = StyleSheet.create({
  // Sort bottom sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1c1c1e', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 36 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#444', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  title: { color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2c2c2e' },
  rowLabel: { flex: 1, color: '#fff', fontSize: 16 },
  rowLabelActive: { color: '#0a84ff', fontWeight: '600' },
  check: { color: '#0a84ff', fontSize: 18, fontWeight: '700' },

  // Filter dropdown menu (appears near top-right)
  menuBackdrop: { flex: 1 },
  filterMenu: {
    position: 'absolute', top: 56, right: 12,
    backgroundColor: '#2c2c2e', borderRadius: 12,
    minWidth: 150, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 12,
  },
  filterOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  filterOptionIcon: { fontSize: 18 },
  filterOptionLabel: { flex: 1, color: '#fff', fontSize: 15 },
  filterOptionLabelActive: { color: '#0a84ff', fontWeight: '600' },
  filterOptionCheck: { color: '#0a84ff', fontSize: 16, fontWeight: '700' },
  filterMenuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#444', marginHorizontal: 12 },
});
