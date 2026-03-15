import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { isAvailable as nativeSearchAvailable, searchAssets as nativeSearchAssets, NativeAsset } from 'media-search';
import { formatDuration } from '../../utils/formatBytes';

const PAGE      = 30;
const THUMB_SIZE = 62;

// ── Session-level thumbnail cache + queue ─────────────────────────────────────
const thumbnailCache = new Map<string, string>();

const MAX_THUMB_CONCURRENT = 4;
let thumbActive  = 0;
let thumbPending: Array<() => void> = [];
let thumbEpoch   = 0;

function drainThumbQueue() {
  while (thumbActive < MAX_THUMB_CONCURRENT && thumbPending.length > 0) {
    thumbActive++;
    thumbPending.shift()!();
  }
}

function resetThumbQueue() {
  thumbEpoch++;
  thumbPending = [];
  thumbActive  = 0;
}

function enqueueThumb(task: () => Promise<void>): () => void {
  let cancelled = false;
  const epoch   = thumbEpoch;
  const run = () => {
    if (cancelled || thumbEpoch !== epoch) return;
    task().finally(() => {
      if (thumbEpoch === epoch) { thumbActive--; drainThumbQueue(); }
    });
  };
  if (thumbActive < MAX_THUMB_CONCURRENT) { thumbActive++; run(); }
  else { thumbPending.push(run); }
  return () => { cancelled = true; };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('thumb_timeout')), ms)),
  ]);
}

// ── PickerThumb ───────────────────────────────────────────────────────────────
interface ThumbProps {
  asset:    MediaLibrary.Asset;
  onRemove: () => void;
}

function PickerThumb({ asset, onRemove }: ThumbProps) {
  const needsGen =
    Platform.OS === 'android' &&
    asset.mediaType === MediaLibrary.MediaType.video;

  const [thumbUri, setThumbUri] = useState<string | null>(
    needsGen ? (thumbnailCache.get(asset.id) ?? null) : asset.uri,
  );
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!needsGen) return;
    const cached = thumbnailCache.get(asset.id);
    if (cached) { setThumbUri(cached); return; }
    let alive = true;
    const cancel = enqueueThumb(async () => {
      try {
        const r = await withTimeout(
          VideoThumbnails.getThumbnailAsync(asset.uri, { time: 0, quality: 0.5 }),
          12000,
        );
        thumbnailCache.set(asset.id, r.uri);
        if (alive) setThumbUri(r.uri);
      } catch {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(asset);
          if (!info.localUri) { if (alive) onRemove(); return; }
          const r = await withTimeout(
            VideoThumbnails.getThumbnailAsync(info.localUri, { time: 0, quality: 0.5 }),
            12000,
          );
          thumbnailCache.set(asset.id, r.uri);
          if (alive) setThumbUri(r.uri);
        } catch {
          if (alive) onRemove();
        }
      }
    });
    return () => { alive = false; cancel(); };
  }, [asset.id, retryKey]);

  const handleError = useCallback(() => {
    if (needsGen && thumbnailCache.has(asset.id)) {
      thumbnailCache.delete(asset.id);
      setThumbUri(null);
      setRetryKey(k => k + 1);
    } else {
      onRemove();
    }
  }, [asset.id, needsGen, onRemove]);

  if (thumbUri === null) return <View style={styles.thumb} />;
  return <Image source={{ uri: thumbUri }} style={styles.thumb} onError={handleError} />;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type TypeFilter = 'all' | 'photo' | 'video';
type SortOrder  = 'desc' | 'asc';

interface AlbumHeader {
  id:    string;
  title: string;
  count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toMediaTypes(f: TypeFilter): MediaLibrary.MediaTypeValue[] {
  if (f === 'photo') return [MediaLibrary.MediaType.photo];
  if (f === 'video') return [MediaLibrary.MediaType.video];
  return [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video];
}

function toSortBy(o: SortOrder): MediaLibrary.SortByValue[] {
  return [[MediaLibrary.SortBy.creationTime, o === 'asc']] as MediaLibrary.SortByValue[];
}

const formatDur = (sec: number) => formatDuration(sec);

/** Cast a NativeAsset to MediaLibrary.Asset for the rest of the app. */
function nativeToAsset(n: NativeAsset): MediaLibrary.Asset {
  return {
    id:           n.id,
    filename:     n.filename,
    uri:          n.uri,
    mediaType:    n.mediaType === 'video'
                    ? MediaLibrary.MediaType.video
                    : MediaLibrary.MediaType.photo,
    duration:     n.duration,
    width:        n.width,
    height:       n.height,
    creationTime: n.creationTime,
    modificationTime: n.creationTime,
    albumId:      undefined,
  } as unknown as MediaLibrary.Asset;
}

// ── MediaPickerModal ──────────────────────────────────────────────────────────
interface Props {
  visible:  boolean;
  onCancel: () => void;
  onImport: (assets: MediaLibrary.Asset[]) => void;
}

export default function MediaPickerModal({ visible, onCancel, onImport }: Props) {

  // ── Album list
  const [albums,        setAlbums]        = useState<AlbumHeader[]>([]);
  const [albumsLoading, setAlbumsLoading] = useState(false);

  // ── Expanded album — paginated browse
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [expandedAssets,  setExpandedAssets]  = useState<MediaLibrary.Asset[]>([]);
  const [expandedHasMore, setExpandedHasMore] = useState(false);
  const [expandedLoading, setExpandedLoading] = useState(false);

  const expandedCursor = useRef<string | undefined>(undefined);
  const fetchGenRef    = useRef(0);
  const fetchingRef    = useRef(false);

  // ── Search
  const [searchText,    setSearchText]    = useState('');
  const [searchResults, setSearchResults] = useState<MediaLibrary.Asset[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchGenRef = useRef(0);

  // ── Selection
  const [selectedMap, setSelectedMap] = useState<Map<string, MediaLibrary.Asset>>(new Map());

  // ── Filters
  const [typeFilter,    setTypeFilter]    = useState<TypeFilter>('all');
  const [sortOrder,     setSortOrder]     = useState<SortOrder>('desc');
  const [showTypeSheet, setShowTypeSheet] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);

  // ── Stable refs
  const expandedIdRef      = useRef<string | null>(null);
  const expandedHasMoreRef = useRef(false);
  const typeFilterRef      = useRef<TypeFilter>('all');
  const sortOrderRef       = useRef<SortOrder>('desc');
  useEffect(() => { expandedIdRef.current      = expandedId;      }, [expandedId]);
  useEffect(() => { expandedHasMoreRef.current = expandedHasMore; }, [expandedHasMore]);
  useEffect(() => { typeFilterRef.current      = typeFilter;      }, [typeFilter]);
  useEffect(() => { sortOrderRef.current       = sortOrder;       }, [sortOrder]);

  // ── Scrollbar
  const scrollViewRef  = useRef<ScrollView>(null);
  const listScrollY    = useRef(0);
  const [sbListH,    setSbListH]    = useState(0);
  const [sbContentH, setSbContentH] = useState(0);
  const thumbTopAnim   = useRef(new Animated.Value(0)).current;
  const sbDragStart    = useRef({ thumbTop: 0 });
  const sbThumbHRef    = useRef(0);
  const sbTrackHRef    = useRef(0);
  const sbScrollRef    = useRef(0);

  const MIN_THUMB = 44;
  const sbThumbH  = sbListH > 0 && sbContentH > sbListH
    ? Math.max(MIN_THUMB, (sbListH / sbContentH) * sbListH) : 0;

  useEffect(() => { sbThumbHRef.current = sbThumbH; }, [sbThumbH]);
  useEffect(() => {
    sbTrackHRef.current = Math.max(0, sbListH - sbThumbH);
    sbScrollRef.current = Math.max(0, sbContentH - sbListH);
  }, [sbListH, sbContentH, sbThumbH]);

  const updateThumb = useCallback((y: number) => {
    const track      = sbTrackHRef.current;
    const scrollable = sbScrollRef.current;
    if (track <= 0 || scrollable <= 0) return;
    thumbTopAnim.setValue(Math.min(track, Math.max(0, (y / scrollable) * track)));
  }, [thumbTopAnim]);

  const sbPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        const track      = sbTrackHRef.current;
        const scrollable = sbScrollRef.current;
        const touchY     = e.nativeEvent.locationY;
        const newTop     = Math.min(track, Math.max(0, touchY - sbThumbHRef.current / 2));
        thumbTopAnim.setValue(newTop);
        sbDragStart.current.thumbTop = newTop;
        if (scrollable > 0 && track > 0) {
          const y = (newTop / track) * scrollable;
          listScrollY.current = y;
          scrollViewRef.current?.scrollTo({ y, animated: false });
        }
      },
      onPanResponderMove: (_, g) => {
        const track      = sbTrackHRef.current;
        const scrollable = sbScrollRef.current;
        if (track <= 0 || scrollable <= 0) return;
        const newTop = Math.min(track, Math.max(0, sbDragStart.current.thumbTop + g.dy));
        thumbTopAnim.setValue(newTop);
        const y = (newTop / track) * scrollable;
        listScrollY.current = y;
        scrollViewRef.current?.scrollTo({ y, animated: false });
      },
      onPanResponderRelease:   () => {},
      onPanResponderTerminate: () => {},
    })
  ).current;

  const sbVisible = sbThumbH > 0;

  // ── Fetch album headers
  const fetchAlbums = useCallback(async () => {
    setAlbumsLoading(true);
    try {
      const result = Platform.OS === 'ios'
        ? await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true })
        : await MediaLibrary.getAlbumsAsync();
      setAlbums(
        result
          .filter(a => a.assetCount > 0)
          .map(a => ({ id: a.id, title: a.title, count: a.assetCount }))
      );
    } catch {
      setAlbums([]);
    } finally {
      setAlbumsLoading(false);
    }
  }, []);

  // ── Fetch one page for normal browse
  const fetchAlbumAssets = useCallback(async (
    albumId: string, tf: TypeFilter, so: SortOrder, reset: boolean,
  ) => {
    if (!reset && fetchingRef.current) return;
    fetchingRef.current = true;
    const gen = ++fetchGenRef.current;
    if (reset) {
      expandedCursor.current = undefined;
      setExpandedAssets([]);
      setExpandedHasMore(false);
    }
    setExpandedLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        album: albumId, first: PAGE,
        after: reset ? undefined : expandedCursor.current,
        sortBy: toSortBy(so), mediaType: toMediaTypes(tf),
      });
      if (fetchGenRef.current !== gen) return;
      expandedCursor.current = result.endCursor;
      setExpandedAssets(prev => reset ? result.assets : [...prev, ...result.assets]);
      setExpandedHasMore(result.hasNextPage);
    } catch {
      if (fetchGenRef.current === gen) setExpandedAssets([]);
    } finally {
      if (fetchGenRef.current === gen) setExpandedLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  // ── Run search
  // With native module: single OS DB call — instant.
  // Fallback (no native module): full-album JS scan in batches of 200.
  const runSearch = useCallback(async (
    albumId: string, query: string, tf: TypeFilter, so: SortOrder,
  ) => {
    const gen = ++searchGenRef.current;
    setSearchResults([]);
    setSearchLoading(true);

    try {
      if (nativeSearchAvailable) {
        // ── Native path: one round-trip to the OS media DB
        const raw = await nativeSearchAssets({
          albumId,
          query,
          mediaType: tf,
          limit: 500,
        });
        if (searchGenRef.current !== gen) return;
        setSearchResults(raw.map(nativeToAsset));
      } else {
        // ── JS fallback: page through all assets and filter
        let cursor: string | undefined = undefined;
        while (true) {
          if (searchGenRef.current !== gen) return;
          const result = await MediaLibrary.getAssetsAsync({
            album: albumId, first: 200,
            after: cursor,
            sortBy: toSortBy(so),
            mediaType: toMediaTypes(tf),
          });
          if (searchGenRef.current !== gen) return;
          const q = query.toLowerCase();
          const matches = result.assets.filter(a =>
            a.filename.toLowerCase().includes(q)
          );
          if (matches.length > 0) {
            setSearchResults(prev => [...prev, ...matches]);
          }
          if (!result.hasNextPage) break;
          cursor = result.endCursor;
        }
      }
    } catch {
      // leave whatever partial results we have
    } finally {
      if (searchGenRef.current === gen) setSearchLoading(false);
    }
  }, []);

  // ── Trigger search on text change (300 ms debounce)
  useEffect(() => {
    if (searchText.length === 0 || !expandedId) {
      searchGenRef.current++;
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    const id = expandedId;
    const q  = searchText;
    const tf = typeFilter;
    const so = sortOrder;
    const t  = setTimeout(() => runSearch(id, q, tf, so), 300);
    return () => clearTimeout(t);
  }, [searchText, expandedId, typeFilter, sortOrder]);

  // ── Open / close modal
  useEffect(() => {
    if (visible) {
      setSelectedMap(new Map());
      setExpandedId(null);
      setExpandedAssets([]);
      setExpandedHasMore(false);
      setSearchText('');
      setSearchResults([]);
      setSearchLoading(false);
      thumbTopAnim.setValue(0);
      resetThumbQueue();
      fetchAlbums();
    } else {
      resetThumbQueue();
      fetchGenRef.current++;
      searchGenRef.current++;
    }
  }, [visible]);

  // ── Accordion toggle
  const toggleSection = useCallback((album: AlbumHeader) => {
    if (expandedIdRef.current === album.id) {
      fetchGenRef.current++;
      searchGenRef.current++;
      fetchingRef.current = false;
      setExpandedId(null);
      setExpandedAssets([]);
      setExpandedHasMore(false);
      setSearchText('');
      setSearchResults([]);
      setSearchLoading(false);
    } else {
      fetchGenRef.current++;
      searchGenRef.current++;
      fetchingRef.current = false;
      setExpandedId(album.id);
      setSearchText('');
      setSearchResults([]);
      setSearchLoading(false);
      fetchAlbumAssets(album.id, typeFilterRef.current, sortOrderRef.current, true);
    }
  }, [fetchAlbumAssets]);

  // ── Filter handlers
  const handleTypeFilter = (f: TypeFilter) => {
    setTypeFilter(f);
    setShowTypeSheet(false);
    const id = expandedIdRef.current;
    if (id) {
      fetchingRef.current = false;
      fetchAlbumAssets(id, f, sortOrderRef.current, true);
      if (searchText.length > 0) runSearch(id, searchText, f, sortOrderRef.current);
    }
  };

  const handleSortOrder = (o: SortOrder) => {
    setSortOrder(o);
    setShowSortSheet(false);
    const id = expandedIdRef.current;
    if (id) {
      fetchingRef.current = false;
      fetchAlbumAssets(id, typeFilterRef.current, o, true);
      if (searchText.length > 0) runSearch(id, searchText, typeFilterRef.current, o);
    }
  };

  // ── Selection
  const toggle = useCallback((asset: MediaLibrary.Asset) => {
    setSelectedMap(prev => {
      const n = new Map(prev);
      n.has(asset.id) ? n.delete(asset.id) : n.set(asset.id, asset);
      return n;
    });
  }, []);

  const removeAsset = useCallback((id: string) => {
    setExpandedAssets(prev => prev.filter(a => a.id !== id));
    setSearchResults(prev => prev.filter(a => a.id !== id));
    setSelectedMap(prev => { const n = new Map(prev); n.delete(id); return n; });
  }, []);

  // ── What to show
  const isSearching   = searchText.length > 0;
  const displayAssets = isSearching ? searchResults : expandedAssets;

  // ── List row renderer
  const renderListRow = (item: MediaLibrary.Asset) => {
    const isSelected = selectedMap.has(item.id);
    const isVideo    = item.mediaType === MediaLibrary.MediaType.video;
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.listRow, isSelected && styles.listRowSelected]}
        onPress={() => toggle(item)}
        activeOpacity={0.85}
      >
        <View style={styles.listThumbWrap}>
          <PickerThumb asset={item} onRemove={() => removeAsset(item.id)} />
          {isVideo && item.duration > 0 && (
            <View style={styles.durBadge}>
              <Text style={styles.durText}>{formatDur(item.duration)}</Text>
            </View>
          )}
          {isVideo && (
            <View style={styles.playBadge}>
              <Text style={styles.playIcon}>▶</Text>
            </View>
          )}
          {isSelected && (
            <View style={styles.listOverlay}>
              <View style={styles.checkCircle}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
            </View>
          )}
        </View>
        <View style={styles.listMeta}>
          <Text style={styles.listName} numberOfLines={2}>{item.filename}</Text>
          {isVideo && item.duration > 0 && (
            <Text style={styles.listDur}>{formatDur(item.duration)}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Derived
  const selectedList = Array.from(selectedMap.values());
  const typeLabel    = typeFilter === 'all' ? 'All Media' : typeFilter === 'photo' ? 'Photos' : 'Videos';
  const typeIcon     = typeFilter === 'video' ? '🎬' : '📷';
  const sortLabel    = sortOrder === 'desc' ? 'Newest' : 'Oldest';
  const isFiltered   = typeFilter !== 'all';
  const isSorted     = sortOrder  !== 'desc';

  // ── Render
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <SafeAreaView style={styles.root}>

        {/* ── Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            {selectedList.length > 0 && (
              <TouchableOpacity onPress={() => setSelectedMap(new Map())} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.unselectAll}>Unselect All</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.title}>
            {selectedList.length > 0 ? `${selectedList.length} selected` : 'Select Media'}
          </Text>
          <TouchableOpacity
            onPress={() => onImport(selectedList)}
            disabled={selectedList.length === 0}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.add, selectedList.length === 0 && styles.addOff]}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* ── Filter Bar */}
        <View style={styles.filterBar}>
          <TouchableOpacity
            style={[styles.chip, isFiltered && styles.chipActive]}
            onPress={() => setShowTypeSheet(true)}
          >
            <Text style={styles.chipIcon}>{typeIcon}</Text>
            <Text style={[styles.chipText, isFiltered && styles.chipTextActive]}>{typeLabel}</Text>
            <Text style={[styles.chipArrow, isFiltered && styles.chipTextActive]}>▾</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, isSorted && styles.chipActive]}
            onPress={() => setShowSortSheet(true)}
          >
            <Text style={styles.chipIcon}>↕</Text>
            <Text style={[styles.chipText, isSorted && styles.chipTextActive]}>{sortLabel}</Text>
            <Text style={[styles.chipArrow, isSorted && styles.chipTextActive]}>▾</Text>
          </TouchableOpacity>

          {expandedId !== null && (
            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search filename…"
                placeholderTextColor="#555"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              {searchLoading && (
                <ActivityIndicator size="small" color="#555" style={{ marginLeft: 4 }} />
              )}
            </View>
          )}
        </View>

        {/* ── Accordion */}
        <View style={styles.listContainer}>
          {albumsLoading ? (
            <View style={styles.centered}><ActivityIndicator color="#fff" /></View>
          ) : albums.length === 0 ? (
            <View style={styles.centered}><Text style={styles.emptyText}>No media found</Text></View>
          ) : (
            <ScrollView
              ref={scrollViewRef}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={e => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const y = contentOffset.y;
                listScrollY.current = y;
                updateThumb(y);
                const distFromBottom = contentSize.height - layoutMeasurement.height - y;
                if (
                  distFromBottom < 400 &&
                  expandedHasMoreRef.current &&
                  !fetchingRef.current &&
                  expandedIdRef.current &&
                  !isSearching
                ) {
                  fetchAlbumAssets(
                    expandedIdRef.current,
                    typeFilterRef.current,
                    sortOrderRef.current,
                    false,
                  );
                }
              }}
              onLayout={e => setSbListH(e.nativeEvent.layout.height)}
              onContentSizeChange={(_, h) => setSbContentH(h)}
            >
              {albums.map(album => {
                const isOpen = expandedId === album.id;
                return (
                  <View key={album.id}>
                    <TouchableOpacity
                      style={styles.accordionHeader}
                      onPress={() => toggleSection(album)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.accordionIcon}>📁</Text>
                      <Text style={styles.accordionTitle} numberOfLines={1}>{album.title}</Text>
                      <Text style={styles.accordionCount}>{album.count}</Text>
                      <Text style={styles.accordionChevron}>{isOpen ? '▼' : '▶'}</Text>
                    </TouchableOpacity>

                    {isOpen && (
                      <View>
                        {/* Search result summary */}
                        {isSearching && !searchLoading && (
                          <View style={styles.searchStatus}>
                            <Text style={styles.searchStatusText}>
                              {searchResults.length === 0
                                ? 'No matches'
                                : `${searchResults.length} match${searchResults.length !== 1 ? 'es' : ''}`}
                            </Text>
                            {!nativeSearchAvailable && (
                              <Text style={styles.searchStatusSub}>
                                (JS fallback — run prebuild for instant search)
                              </Text>
                            )}
                          </View>
                        )}

                        {displayAssets.length === 0 && !expandedLoading && !searchLoading && (
                          <View style={styles.sectionEmpty}>
                            <Text style={styles.emptyText}>
                              {isSearching ? 'No matches' : 'No media found'}
                            </Text>
                          </View>
                        )}

                        {displayAssets.map(asset => renderListRow(asset))}

                        {!isSearching && expandedLoading && (
                          <ActivityIndicator color="#aaa" style={styles.loadingMore} />
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}

          {sbVisible && (
            <View style={styles.sbTrack} pointerEvents="auto" {...sbPan.panHandlers}>
              <Animated.View style={{ transform: [{ translateY: thumbTopAnim }] }}>
                <View style={[styles.sbThumb, { height: sbThumbH }]} />
              </Animated.View>
            </View>
          )}
        </View>

        {/* ── Type Sheet */}
        <Modal transparent animationType="slide" visible={showTypeSheet} onRequestClose={() => setShowTypeSheet(false)}>
          <TouchableOpacity style={sheet.backdrop} activeOpacity={1} onPress={() => setShowTypeSheet(false)}>
            <View style={sheet.panel}>
              <View style={sheet.handle} />
              <Text style={sheet.sheetTitle}>Filter by Type</Text>
              {([
                ['all',   '📷', 'All Media'   ],
                ['photo', '📷', 'Photos Only' ],
                ['video', '🎬', 'Videos Only' ],
              ] as const).map(([val, icon, label]) => (
                <TouchableOpacity key={val} style={sheet.row} onPress={() => handleTypeFilter(val)}>
                  <Text style={sheet.rowIcon}>{icon}</Text>
                  <Text style={[sheet.rowLabel, typeFilter === val && sheet.rowLabelActive]}>{label}</Text>
                  {typeFilter === val && <Text style={sheet.check}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ── Sort Sheet */}
        <Modal transparent animationType="slide" visible={showSortSheet} onRequestClose={() => setShowSortSheet(false)}>
          <TouchableOpacity style={sheet.backdrop} activeOpacity={1} onPress={() => setShowSortSheet(false)}>
            <View style={sheet.panel}>
              <View style={sheet.handle} />
              <Text style={sheet.sheetTitle}>Sort by Date Added</Text>
              {([
                ['desc', '↓', 'Newest First'],
                ['asc',  '↑', 'Oldest First'],
              ] as const).map(([val, icon, label]) => (
                <TouchableOpacity key={val} style={sheet.row} onPress={() => handleSortOrder(val)}>
                  <Text style={sheet.rowIcon}>{icon}</Text>
                  <Text style={[sheet.rowLabel, sortOrder === val && sheet.rowLabelActive]}>{label}</Text>
                  {sortOrder === val && <Text style={sheet.check}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333',
  },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cancel:       { color: '#aaa', fontSize: 16 },
  unselectAll:  { color: '#0a84ff', fontSize: 14 },
  title:        { color: '#fff', fontSize: 16, fontWeight: '600' },
  add:          { color: '#0a84ff', fontSize: 16, fontWeight: '600' },
  addOff:       { color: '#444' },

  filterBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#222',
  },
  chip:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#1c1c1e' },
  chipActive:     { backgroundColor: '#0a84ff' },
  chipIcon:       { fontSize: 12 },
  chipText:       { color: '#aaa', fontSize: 12, fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  chipArrow:      { color: '#555', fontSize: 10 },

  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1c1c1e', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 5, gap: 5,
  },
  searchIcon:  { fontSize: 11 },
  searchInput: { flex: 1, color: '#fff', fontSize: 13, padding: 0, margin: 0 },

  searchStatus: {
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: '#0d0d0d',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1a1a1a',
  },
  searchStatusText: { color: '#666', fontSize: 12 },
  searchStatusSub:  { color: '#444', fontSize: 10, marginTop: 1 },

  listContainer: { flex: 1 },

  thumb: { width: THUMB_SIZE, height: THUMB_SIZE, backgroundColor: '#1a1a1a', borderRadius: 4 },

  listRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1a1a1a',
  },
  listRowSelected: { backgroundColor: 'rgba(10,132,255,0.12)' },

  listThumbWrap: {
    width: THUMB_SIZE, height: THUMB_SIZE,
    borderRadius: 4, overflow: 'hidden', flexShrink: 0,
  },
  listOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,132,255,0.35)',
    justifyContent: 'flex-start', alignItems: 'flex-end', padding: 3,
  },
  checkCircle: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#0a84ff', justifyContent: 'center', alignItems: 'center' },
  checkMark:   { color: '#fff', fontSize: 11, fontWeight: '700' },

  durBadge: {
    position: 'absolute', bottom: 2, right: 2,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 3,
    paddingHorizontal: 3, paddingVertical: 1,
  },
  durText: { color: '#fff', fontSize: 9, fontWeight: '600' },

  playBadge: { position: 'absolute', bottom: 2, left: 3 },
  playIcon:  { color: '#fff', fontSize: 9, textShadowColor: '#000', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },

  listMeta: { flex: 1, paddingLeft: 12, justifyContent: 'center' },
  listName: { color: '#fff', fontSize: 13, fontWeight: '500', lineHeight: 18 },
  listDur:  { color: '#888', fontSize: 12, marginTop: 3 },

  accordionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: '#111',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#222',
  },
  accordionIcon:    { fontSize: 16, marginRight: 8 },
  accordionTitle:   { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  accordionCount:   { color: '#555', fontSize: 12, marginRight: 8 },
  accordionChevron: { color: '#888', fontSize: 11 },

  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionEmpty: { paddingVertical: 24, alignItems: 'center' },
  emptyText:    { color: '#555', fontSize: 15 },
  loadingMore:  { paddingVertical: 16 },

  sbTrack: { position: 'absolute', top: 6, right: 0, bottom: 6, width: 20, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2 },
  sbThumb: { width: 4, borderRadius: 2, backgroundColor: '#ffffff', alignSelf: 'center' },
});

// ── Bottom-sheet styles ───────────────────────────────────────────────────────
const sheet = StyleSheet.create({
  backdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  panel:          { backgroundColor: '#1c1c1e', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 36 },
  handle:         { width: 36, height: 4, borderRadius: 2, backgroundColor: '#444', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetTitle:     { color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6 },
  row:            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2c2c2e' },
  rowIcon:        { width: 28, fontSize: 16 },
  rowLabel:       { flex: 1, color: '#fff', fontSize: 16 },
  rowLabelActive: { color: '#0a84ff', fontWeight: '600' },
  check:          { color: '#0a84ff', fontSize: 18, fontWeight: '700' },
});
