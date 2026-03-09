import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as MediaLibrary from 'expo-media-library';
import { useVault } from '../context/VaultContext';
import MediaThumbnail from '../components/media/MediaThumbnail';
import MediaActionsSheet from '../components/media/MediaActionsSheet';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { MediaItem } from '../types';
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

export default function FolderScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { folder } = route.params;
  const { mediaByFolder, deleteMediaBatch } = useVault();
  const { importMedia, isImporting } = useMediaImport(folder.id);

  // ── Select mode ────────────────────────────────────────────────────────────
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Media action sheet ─────────────────────────────────────────────────────
  const [activeItem, setActiveItem] = useState<MediaItem | null>(null);

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

  // ── Select helpers ─────────────────────────────────────────────────────────
  const enterSelectMode = useCallback((item: MediaItem) => {
    setIsSelecting(true);
    setSelectedIds(new Set([item.id]));
  }, []);

  const exitSelectMode = () => { setIsSelecting(false); setSelectedIds(new Set()); };

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
    setActiveItem(item);
  };

  // ── Bulk actions ───────────────────────────────────────────────────────────
  const handleUnhide = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow access to save media to your gallery.'); return; }
    const toDelete: MediaItem[] = [];
    for (const item of selectedItems) {
      try { await MediaLibrary.saveToLibraryAsync(item.vaultUri); toDelete.push(item); } catch { /* skip */ }
    }
    if (toDelete.length > 0) await deleteMediaBatch(toDelete);
    exitSelectMode();
  };

  const handleDeleteSelected = async () => { await deleteMediaBatch(selectedItems); exitSelectMode(); };

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
            <TouchableOpacity
              onPress={() => setSelectedIds(selectedIds.size === rawItems.length ? new Set() : new Set(rawItems.map((m) => m.id)))}
              style={styles.headerRight}
            >
              <Text style={styles.selectAllText}>{selectedIds.size === rawItems.length ? 'None' : 'All'}</Text>
            </TouchableOpacity>
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
      <FlatList
        data={displayedItems}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={styles.list}
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

      <MediaActionsSheet
        item={activeItem}
        onClose={() => setActiveItem(null)}
        onEnterSelect={(item) => enterSelectMode(item)}
      />

      <ConfirmDialog
        visible={showDeleteConfirm}
        title="Delete Items"
        message={`Permanently delete ${selectedIds.size} item${selectedIds.size !== 1 ? 's' : ''} from your vault?`}
        onConfirm={async () => { setShowDeleteConfirm(false); await handleDeleteSelected(); }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
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
  selectAllText: { color: '#0a84ff', fontSize: 17, textAlign: 'right' },
  headerTitle: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  headerIconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1c1c1e', justifyContent: 'center', alignItems: 'center' },
  headerIcon: { color: '#0a84ff', fontSize: 16 },
  headerIconActive: { color: '#fff' },
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
