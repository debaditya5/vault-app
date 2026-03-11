import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import * as VideoThumbnails from 'expo-video-thumbnails';

const NUM_COLS = 3;
const CELL = Dimensions.get('window').width / NUM_COLS;
const PAGE = 30; // smaller page = faster initial load

// ── Persistent thumbnail cache (module-level — survives modal close/reopen) ───
const thumbnailCache = new Map<string, string>();

// ── Thumbnail generation queue (limits concurrent native calls) ────────────────
const MAX_THUMB_CONCURRENT = 4;
let thumbActive = 0;
const thumbPending: Array<() => void> = [];

function drainThumbQueue() {
  while (thumbActive < MAX_THUMB_CONCURRENT && thumbPending.length > 0) {
    thumbActive++;
    thumbPending.shift()!();
  }
}

function enqueueThumb(task: () => Promise<void>): () => void {
  let cancelled = false;
  const run = () => {
    if (cancelled) { thumbActive--; drainThumbQueue(); return; }
    task().finally(() => { thumbActive--; drainThumbQueue(); });
  };
  if (thumbActive < MAX_THUMB_CONCURRENT) { thumbActive++; run(); }
  else { thumbPending.push(run); }
  return () => { cancelled = true; };
}

// ── PickerThumb ───────────────────────────────────────────────────────────────
// On iOS, ph:// URIs work for both photos and videos via the Photos framework.
// On Android, content://video/media URIs are video files — Image can't render
// them. Use expo-video-thumbnails to generate a frame thumbnail instead.

interface ThumbProps {
  asset: MediaLibrary.Asset;
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
        const r = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 0, quality: 0.5 });
        thumbnailCache.set(asset.id, r.uri);
        if (alive) setThumbUri(r.uri);
      } catch {
        try {
          const info = await MediaLibrary.getAssetInfoAsync(asset);
          if (!info.localUri) { if (alive) onRemove(); return; }
          const r = await VideoThumbnails.getThumbnailAsync(info.localUri, { time: 0, quality: 0.5 });
          thumbnailCache.set(asset.id, r.uri);
          if (alive) setThumbUri(r.uri);
        } catch {
          if (alive) onRemove(); // asset is gone / inaccessible
        }
      }
    });

    return () => { alive = false; cancel(); };
  }, [asset.id, retryKey]);

  const handleError = useCallback(() => {
    if (needsGen && thumbnailCache.has(asset.id)) {
      // Cached thumbnail file was cleared by the OS — evict and regenerate
      thumbnailCache.delete(asset.id);
      setThumbUri(null);
      setRetryKey(k => k + 1);
    } else {
      onRemove();
    }
  }, [asset.id, needsGen, onRemove]);

  if (thumbUri === null) {
    return <View style={[styles.thumb, { backgroundColor: '#1a1a1a' }]} />;
  }

  return (
    <Image
      source={{ uri: thumbUri }}
      style={styles.thumb}
      onError={handleError}
    />
  );
}

// ── MediaPickerModal ──────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onCancel: () => void;
  onImport: (assets: MediaLibrary.Asset[]) => void;
}

export default function MediaPickerModal({ visible, onCancel, onImport }: Props) {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const cursor = useRef<string | undefined>(undefined);
  const fetchingRef = useRef(false);

  // Swipe-select refs
  const listTop = useRef(0);
  const listScrollY = useRef(0);
  const swipingRef = useRef(false);
  const swipedIds = useRef<Set<string>>(new Set());
  const swipeAnchorState = useRef(true);
  const selectedRef = useRef<Set<string>>(new Set());
  const assetsRef = useRef<MediaLibrary.Asset[]>([]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { assetsRef.current = assets; }, [assets]);

  // ── Fetching ─────────────────────────────────────────────────────────────

  const fetchPage = useCallback(async (reset = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        first: PAGE,
        after: reset ? undefined : cursor.current,
      });
      setAssets(prev => reset ? result.assets : [...prev, ...result.assets]);
      cursor.current = result.endCursor;
      setHasMore(result.hasNextPage);
    } catch {
      // show empty grid on error
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      cursor.current = undefined;
      thumbPending.length = 0; // discard stale queued tasks from previous open
      setSelected(new Set());
      setAssets([]);
      setHasMore(true);
      setScrollEnabled(true);
      fetchPage(true);
    }
  }, [visible]);

  // Refresh when device library changes while picker is open
  useEffect(() => {
    if (!visible) return;
    const sub = MediaLibrary.addListener(() => {
      cursor.current = undefined;
      fetchPage(true);
    });
    return () => sub.remove();
  }, [visible]);

  // ── Swipe-select ──────────────────────────────────────────────────────────

  const getAssetAtPos = (pageX: number, pageY: number): MediaLibrary.Asset | null => {
    const relY = pageY - listTop.current + listScrollY.current;
    const col = Math.min(NUM_COLS - 1, Math.max(0, Math.floor(pageX / CELL)));
    const row = Math.floor(relY / CELL);
    return assetsRef.current[row * NUM_COLS + col] ?? null;
  };

  const swipePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => swipingRef.current,
      onPanResponderGrant: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        const asset = getAssetAtPos(pageX, pageY);
        swipedIds.current = new Set();
        if (asset) {
          swipedIds.current.add(asset.id);
          swipeAnchorState.current = !selectedRef.current.has(asset.id);
          setSelected(prev => {
            const next = new Set(prev);
            swipeAnchorState.current ? next.add(asset.id) : next.delete(asset.id);
            return next;
          });
        } else {
          swipeAnchorState.current = true;
        }
      },
      onPanResponderMove: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        const asset = getAssetAtPos(pageX, pageY);
        if (!asset || swipedIds.current.has(asset.id)) return;
        swipedIds.current.add(asset.id);
        setSelected(prev => {
          const next = new Set(prev);
          swipeAnchorState.current ? next.add(asset.id) : next.delete(asset.id);
          return next;
        });
      },
      onPanResponderRelease: () => {
        swipingRef.current = false;
        swipedIds.current = new Set();
        setScrollEnabled(true);
      },
      onPanResponderTerminate: () => {
        swipingRef.current = false;
        swipedIds.current = new Set();
        setScrollEnabled(true);
      },
    })
  ).current;

  const handleLongPress = (asset: MediaLibrary.Asset) => {
    swipingRef.current = true;
    setScrollEnabled(false);
    swipedIds.current = new Set([asset.id]);
    swipeAnchorState.current = !selectedRef.current.has(asset.id);
    setSelected(prev => {
      const next = new Set(prev);
      swipeAnchorState.current ? next.add(asset.id) : next.delete(asset.id);
      return next;
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const removeAsset = (id: string) =>
    setAssets(prev => prev.filter(a => a.id !== id));

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const renderItem = ({ item }: { item: MediaLibrary.Asset }) => {
    const isSelected = selected.has(item.id);
    return (
      <TouchableOpacity
        style={styles.cell}
        onPress={() => toggle(item.id)}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={200}
        activeOpacity={0.85}
      >
        <PickerThumb asset={item} onRemove={() => removeAsset(item.id)} />
        {item.mediaType === MediaLibrary.MediaType.video && (
          <View style={styles.badge}>
            <Text style={styles.badgeIcon}>▶</Text>
            {item.duration > 0 && (
              <Text style={styles.badgeDur}>
                {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
              </Text>
            )}
          </View>
        )}
        {isSelected && (
          <View style={styles.overlay}>
            <View style={styles.checkCircle}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {selected.size > 0 ? `${selected.size} selected` : 'Select Media'}
          </Text>
          <TouchableOpacity
            onPress={() => onImport(assets.filter(a => selected.has(a.id)))}
            disabled={selected.size === 0}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.add, selected.size === 0 && styles.addOff]}>Add</Text>
          </TouchableOpacity>
        </View>

        <View
          style={styles.listContainer}
          onLayout={e => { listTop.current = e.nativeEvent.layout.y; }}
          {...swipePan.panHandlers}
        >
          <FlatList
            data={assets}
            numColumns={NUM_COLS}
            keyExtractor={a => a.id}
            renderItem={renderItem}
            scrollEnabled={scrollEnabled}
            onScroll={e => { listScrollY.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={5}
            onEndReached={() => { if (hasMore && !fetchingRef.current) fetchPage(); }}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loading
              ? <ActivityIndicator color="#fff" style={{ paddingVertical: 20 }} />
              : null}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333',
  },
  cancel: { color: '#aaa', fontSize: 16 },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  add: { color: '#0a84ff', fontSize: 16, fontWeight: '600' },
  addOff: { color: '#444' },
  listContainer: { flex: 1 },
  cell: { width: CELL, height: CELL },
  thumb: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute', bottom: 4, left: 4,
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  badgeIcon: {
    color: '#fff', fontSize: 10,
    textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  badgeDur: {
    color: '#fff', fontSize: 10,
    textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 132, 255, 0.35)',
    justifyContent: 'flex-start', alignItems: 'flex-end', padding: 5,
  },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#0a84ff', justifyContent: 'center', alignItems: 'center',
  },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
