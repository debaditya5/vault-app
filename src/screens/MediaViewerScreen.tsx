import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Text,
  Dimensions,
  Alert,
  FlatList,
  Modal,
  PanResponder,
  Platform,
} from 'react-native';
import {
  PanGestureHandler,
  TapGestureHandler,
  State,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setStatusBarHidden, setStatusBarTranslucent } from 'expo-status-bar';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useVault } from '../context/VaultContext';
import { useSettings } from '../context/SettingsContext';
import { MediaItem } from '../types';
import { RootStackParamList } from '../navigation/RootNavigator';

type Nav = StackNavigationProp<RootStackParamList, 'MediaViewer'>;
type Route = RouteProp<RootStackParamList, 'MediaViewer'>;

const { width, height } = Dimensions.get('window');

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

/** Formats milliseconds as M:SS */
function fmtMs(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Returns an image style that handles rotation correctly.
 * For 90°/270°: the image layout dimensions are swapped (width↔height) and
 * repositioned so the rotated result fills the screen without any cropping.
 */
function rotatedImageStyle(rotation: number | undefined) {
  const r = rotation ?? 0;
  if (r === 90 || r === 270) {
    return {
      position: 'absolute' as const,
      width: height,       // swap: layout uses screen height as width
      height: width,       // swap: layout uses screen width as height
      left: (width - height) / 2,
      top: (height - width) / 2,
      transform: [{ rotate: `${r}deg` }],
    };
  }
  return {
    width,
    height,
    ...(r ? { transform: [{ rotate: `${r}deg` }] } : {}),
  };
}

// ─── Seek Bar ──────────────────────────────────────────────────────────────────
interface SeekBarProps {
  posMs: number;
  durMs: number;
  onSeek: (ms: number) => void;
}

function SeekBar({ posMs, durMs, onSeek }: SeekBarProps) {
  const [dragPos, setDragPos] = useState<number | null>(null);
  const trackRef = useRef<View>(null);
  const trackLayout = useRef({ x: 0, width: 1 });

  // Keep refs current to avoid stale closures in PanResponder
  const onSeekRef = useRef(onSeek);
  useEffect(() => { onSeekRef.current = onSeek; }, [onSeek]);
  const durMsRef = useRef(durMs);
  useEffect(() => { durMsRef.current = durMs; }, [durMs]);

  const displayPos = dragPos ?? posMs;
  const progress = durMs > 0 ? Math.min(displayPos / durMs, 1) : 0;
  const fillPct = `${(progress * 100).toFixed(2)}%`;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.pageX - trackLayout.current.x;
        const ratio = Math.max(0, Math.min(x / trackLayout.current.width, 1));
        const ms = ratio * durMsRef.current;
        setDragPos(ms);
        onSeekRef.current(ms);
      },
      onPanResponderMove: (e) => {
        const x = e.nativeEvent.pageX - trackLayout.current.x;
        const ratio = Math.max(0, Math.min(x / trackLayout.current.width, 1));
        const ms = ratio * durMsRef.current;
        setDragPos(ms);
        onSeekRef.current(ms);
      },
      onPanResponderRelease: () => setDragPos(null),
      onPanResponderTerminate: () => setDragPos(null),
    })
  ).current;

  return (
    <View style={seekStyles.container}>
      <Text style={seekStyles.time}>{fmtMs(displayPos)}</Text>
      <View
        ref={trackRef}
        style={seekStyles.track}
        onLayout={() => {
          trackRef.current?.measure((_x, _y, w, _h, pageX) => {
            trackLayout.current.x = pageX;
            trackLayout.current.width = w;
          });
        }}
        {...panResponder.panHandlers}
        collapsable={false}
      >
        {/* Filled portion */}
        <View style={[seekStyles.fill, { width: fillPct as any }]} />
        {/* Draggable thumb */}
        <View style={[seekStyles.thumb, { left: fillPct as any }]} />
      </View>
      <Text style={seekStyles.time}>{fmtMs(durMs)}</Text>
    </View>
  );
}

const seekStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 10,
  },
  time: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
    width: 38,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  track: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    justifyContent: 'center',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 3,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    top: -5.5,
    marginLeft: -7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
});

// ─── Video page ────────────────────────────────────────────────────────────────
interface VideoPageProps {
  item: MediaItem;
  isCurrent: boolean;
  onProgressUpdate: (posMs: number, durMs: number, isPlaying: boolean) => void;
  seekFnRef: React.MutableRefObject<((ms: number) => void) | null>;
  playbackRate: number;
  controlsVisible: boolean;
  onTap: () => void;
}

interface SeekInfo { delta: number; targetMs: number }

function VideoPage({ item, isCurrent, onProgressUpdate, seekFnRef, playbackRate, controlsVisible, onTap }: VideoPageProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [seekInfo, setSeekInfo] = useState<SeekInfo | null>(null);
  const [postSeek, setPostSeek] = useState(false);
  const postSeekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable refs to avoid stale closures in event listeners
  const isCurrentRef = useRef(isCurrent);
  useEffect(() => { isCurrentRef.current = isCurrent; }, [isCurrent]);
  const onProgressUpdateRef = useRef(onProgressUpdate);
  useEffect(() => { onProgressUpdateRef.current = onProgressUpdate; }, [onProgressUpdate]);

  // Refs so handlers always see fresh values
  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  const hasEndedRef = useRef(false);
  useEffect(() => { hasEndedRef.current = hasEnded; }, [hasEnded]);
  const onTapRef = useRef(onTap);
  useEffect(() => { onTapRef.current = onTap; }, [onTap]);

  // Seed duration from stored metadata so the seekbar shows immediately on open.
  const cachedDurRef = useRef(item.duration != null ? item.duration * 1000 : 0);

  const player = useVideoPlayer(item.vaultUri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.1;
  });

  // ── Tap / double-tap ───────────────────────────────────────────────────────
  const lastTapTimeRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePress = () => {
    if (!isPlayingRef.current) {
      // Single tap when not playing → play immediately
      if (hasEndedRef.current) { player.currentTime = 0; setHasEnded(false); }
      player.play();
    } else {
      // Playing: single tap = toggle controls (after delay), double tap = pause
      const now = Date.now();
      const diff = now - lastTapTimeRef.current;
      lastTapTimeRef.current = now;
      if (diff < 300) {
        // Double tap → pause
        if (singleTapTimerRef.current) {
          clearTimeout(singleTapTimerRef.current);
          singleTapTimerRef.current = null;
        }
        player.pause();
      } else {
        // Single tap — wait to confirm it's not a double tap, then toggle controls
        if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = setTimeout(() => {
          singleTapTimerRef.current = null;
          onTapRef.current();
        }, 280);
      }
    }
  };

  const handleTapStateChange = (event: { nativeEvent: { state: number } }) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      handlePress();
    }
  };

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    if (postSeekTimerRef.current) clearTimeout(postSeekTimerRef.current);
  }, []);

  // ── Horizontal swipe to seek ───────────────────────────────────────────────
  // Uses RNGH PanGestureHandler with:
  //   activeOffsetX  — only activates after ±10px horizontal movement
  //   failOffsetY    — immediately fails (yields) if vertical movement > 5px,
  //                    which lets the navigation's swipe-down-to-dismiss run freely.
  const dragStartMsRef = useRef(0);

  const handlePanStateChange = (event: { nativeEvent: { state: number; translationX: number } }) => {
    const { state, translationX } = event.nativeEvent;
    if (state === State.BEGAN) {
      // Capture the playback position at the moment the finger touches down
      dragStartMsRef.current = player.currentTime * 1000;
    } else if (state === State.END) {
      const deltaMs = (translationX / width) * 90000;
      const durMs = player.duration != null && player.duration > 0
        ? player.duration * 1000 : cachedDurRef.current;
      player.currentTime = Math.max(0, Math.min(dragStartMsRef.current + deltaMs, durMs)) / 1000;
      setSeekInfo(null);
      // Suppress play-button flash while player catches up to the new position
      setPostSeek(true);
      if (postSeekTimerRef.current) clearTimeout(postSeekTimerRef.current);
      postSeekTimerRef.current = setTimeout(() => { setPostSeek(false); postSeekTimerRef.current = null; }, 400);
    } else if (state === State.FAILED || state === State.CANCELLED) {
      setSeekInfo(null);
    }
  };

  const handlePanGestureEvent = (event: { nativeEvent: { translationX: number } }) => {
    const { translationX } = event.nativeEvent;
    const deltaMs = (translationX / width) * 90000;
    const durMs = player.duration != null && player.duration > 0
      ? player.duration * 1000 : cachedDurRef.current;
    const targetMs = Math.max(0, Math.min(dragStartMsRef.current + deltaMs, durMs));
    setSeekInfo({ delta: deltaMs, targetMs });
  };

  // Pause and reset UI when navigating away; re-emit duration when becoming current
  useEffect(() => {
    if (isCurrent) {
      onProgressUpdate(player.currentTime * 1000, cachedDurRef.current, player.playing);
    } else {
      player.pause();
      setIsPlaying(false);
      setHasEnded(false);
    }
  }, [isCurrent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Register seek function so parent can call it
  useEffect(() => {
    if (isCurrent) {
      seekFnRef.current = (ms: number) => { player.currentTime = ms / 1000; };
    }
    return () => { if (isCurrent) seekFnRef.current = null; };
  }, [isCurrent, player, seekFnRef]);

  // Sync playback rate — correct property is `playbackRate` in expo-video 3.x
  useEffect(() => { player.playbackRate = playbackRate; }, [player, playbackRate]);

  // Playing / paused changes
  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing);
    });
    return () => sub.remove();
  }, [player]);

  // Periodic time updates → parent seek bar
  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (isCurrentRef.current) {
        const playerDur = (player.duration ?? 0) * 1000;
        const durMs = playerDur > 0 ? playerDur : cachedDurRef.current;
        onProgressUpdateRef.current(currentTime * 1000, durMs, player.playing);
      }
    });
    return () => sub.remove();
  }, [player]);

  // Duration available after load — always cache it; emit to parent only when current
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        const durMs = (player.duration ?? 0) * 1000;
        cachedDurRef.current = durMs;
        if (isCurrentRef.current) {
          onProgressUpdateRef.current(player.currentTime * 1000, durMs, false);
        }
      }
    });
    return () => sub.remove();
  }, [player]);

  // End of video
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      player.pause();
      setIsPlaying(false);
      setHasEnded(true);
    });
    return () => sub.remove();
  }, [player]);

  const seekDeltaSec = seekInfo ? Math.round(seekInfo.delta / 1000) : 0;

  return (
    // PanGestureHandler handles horizontal seek natively.
    // activeOffsetX activates only after ±10px horizontal movement.
    // failOffsetY yields immediately on ≥5px vertical movement so the
    // navigation's swipe-down-to-dismiss gesture is never blocked.
    <PanGestureHandler
      onGestureEvent={handlePanGestureEvent}
      onHandlerStateChange={handlePanStateChange}
      activeOffsetX={[-5, 5]}
      failOffsetY={[-15, 15]}
    >
      <View style={styles.page}>
        <VideoView
          player={player}
          style={rotatedImageStyle(item.rotation)}
          nativeControls={false}
          contentFit="contain"
          surfaceType="textureView"
        />
        {/* TapGestureHandler for single/double-tap play-pause.
            maxDeltaY ensures swipe-down correctly fails the tap. */}
        <TapGestureHandler
          numberOfTaps={1}
          maxDeltaY={5}
          onHandlerStateChange={handleTapStateChange}
        >
          <View style={StyleSheet.absoluteFill}>
            {!isPlaying && seekInfo === null && !postSeek && (
              <View style={[StyleSheet.absoluteFill, styles.playOverlay]} pointerEvents="none">
                <View style={styles.playBtnCircle}>
                  <Text style={[styles.playBtnIcon, hasEnded && { marginLeft: 0, marginTop: Platform.OS === 'android' ? 4 : 0 }]}>
                    {hasEnded ? '↺' : '▶'}
                  </Text>
                </View>
                <Text style={styles.playBtnLabel}>{hasEnded ? 'Replay' : 'Play'}</Text>
              </View>
            )}
            {seekInfo !== null && (
              <View style={[StyleSheet.absoluteFill, vidGesture.overlay]} pointerEvents="none">
                <View style={vidGesture.badge}>
                  <Text style={vidGesture.arrow}>{seekDeltaSec >= 0 ? '▶▶' : '◀◀'}</Text>
                  <Text style={vidGesture.delta}>{seekDeltaSec >= 0 ? '+' : ''}{seekDeltaSec}s</Text>
                  <Text style={vidGesture.target}>{fmtMs(seekInfo.targetMs)}</Text>
                </View>
              </View>
            )}
          </View>
        </TapGestureHandler>
      </View>
    </PanGestureHandler>
  );
}

const vidGesture = StyleSheet.create({
  overlay: { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 88 },
  badge: {
    alignItems: 'center',
    gap: 2,
  },
  arrow: { color: 'rgba(255,255,255,0.75)', fontSize: 16 },
  delta: {
    color: '#fff', fontSize: 20, fontWeight: '400', fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  target: {
    color: 'rgba(255,255,255,0.6)', fontSize: 12, fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
});

// ─── Playback Speed Sheet ──────────────────────────────────────────────────────
const SPEED_OPTIONS = [
  { label: '0.25×', value: 0.25 },
  { label: '0.5×',  value: 0.5  },
  { label: '1×',    value: 1    },
  { label: '2×',    value: 2    },
  { label: '4×',    value: 4    },
  { label: '8×',    value: 8    },
];

interface SpeedSheetProps {
  visible: boolean;
  current: number;
  onSelect: (rate: number) => void;
  onClose: () => void;
}

function SpeedSheet({ visible, current, onSelect, onClose }: SpeedSheetProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <TouchableOpacity style={spd.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={spd.card}>
          <Text style={spd.title}>Playback Speed</Text>
          <View style={spd.grid}>
            {SPEED_OPTIONS.map(({ label, value }) => (
              <TouchableOpacity
                key={value}
                style={[spd.chip, current === value && spd.chipActive]}
                onPress={() => { onSelect(value); onClose(); }}
              >
                <Text style={[spd.chipText, current === value && spd.chipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={spd.cancelBtn} onPress={onClose}>
            <Text style={spd.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const spd = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 20,
  },
  chip: {
    width: 90,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#2c2c2e',
    alignItems: 'center',
  },
  chipActive: { backgroundColor: '#0a84ff' },
  chipText: { color: '#aaa', fontSize: 17, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  cancelBtn: {
    backgroundColor: '#2c2c2e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: { color: '#0a84ff', fontSize: 16, fontWeight: '600' },
});

// ─── Main screen ───────────────────────────────────────────────────────────────
type MenuSheet = 'closed' | 'menu' | 'details';

export default function MediaViewerScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { deleteMedia, setFolderCover, rotateMedia } = useVault();
  const { slideshowInterval } = useSettings();

  const [items, setItems] = useState<MediaItem[]>(route.params.items);
  const [currentIndex, setCurrentIndex] = useState(route.params.initialIndex);
  const [menuSheet, setMenuSheet] = useState<MenuSheet>('closed');
  const [isSlideshowing, setIsSlideshowing] = useState(false);
  const [videoProgress, setVideoProgress] = useState({ posMs: 0, durMs: 0, isPlaying: false });
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedSheet, setShowSpeedSheet] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const flatListRef = useRef<FlatList<MediaItem>>(null);
  const slideshowRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const seekFnRef = useRef<((ms: number) => void) | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentItem = items[currentIndex];

  // ── Controls auto-hide helpers ─────────────────────────────────────────────
  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  }, []);

  const scheduleHide = useCallback((ms = 3000) => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), ms);
  }, [clearHideTimer]);

  const handleScreenTap = useCallback(() => {
    if (controlsVisible) {
      setControlsVisible(false);
      clearHideTimer();
    } else {
      setControlsVisible(true);
      if (videoProgress.isPlaying) scheduleHide();
    }
  }, [controlsVisible, videoProgress.isPlaying, clearHideTimer, scheduleHide]);

  // Make status bar translucent when entering viewer so hiding it doesn't shift layout,
  // then hide/show with controls. Restore non-translucent on unmount.
  useEffect(() => {
    setStatusBarTranslucent(true);
    return () => {
      setStatusBarHidden(false, 'none');
      setStatusBarTranslucent(false);
    };
  }, []);

  useEffect(() => {
    setStatusBarHidden(!controlsVisible, 'slide');
  }, [controlsVisible]);

  // Auto-hide on mount
  useEffect(() => {
    scheduleHide(3000);
    return () => clearHideTimer();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-hide when video starts playing; show when it pauses
  useEffect(() => {
    if (videoProgress.isPlaying) {
      setControlsVisible(true);
      scheduleHide(3000);
    } else if (currentItem?.mediaType === 'video') {
      clearHideTimer();
      setControlsVisible(true);
    }
  }, [videoProgress.isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset seekbar state when the current item is not a video
  useEffect(() => {
    if (currentItem?.mediaType !== 'video') {
      setVideoProgress({ posMs: 0, durMs: 0, isPlaying: false });
    }
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Video progress callback (stable ref) ──────────────────────────────────
  const handleVideoProgress = useCallback(
    (posMs: number, durMs: number, isPlaying: boolean) => {
      setVideoProgress({ posMs, durMs, isPlaying });
    },
    []
  );

  const handleSeek = useCallback((ms: number) => {
    seekFnRef.current?.(ms);
  }, []);

  // ── Slideshow ──────────────────────────────────────────────────────────────
  const stopSlideshow = useCallback(() => {
    if (slideshowRef.current) { clearInterval(slideshowRef.current); slideshowRef.current = null; }
    setIsSlideshowing(false);
  }, []);

  const startSlideshow = useCallback(() => {
    setIsSlideshowing(true);
    slideshowRef.current = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % items.length;
        flatListRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, slideshowInterval);
  }, [items.length, slideshowInterval]);

  useEffect(() => () => stopSlideshow(), [stopSlideshow]);

  // ── Navigation arrows ──────────────────────────────────────────────────────
  const goToPrev = () => {
    if (currentIndex <= 0) return;
    const next = currentIndex - 1;
    flatListRef.current?.scrollToIndex({ index: next, animated: true });
    setCurrentIndex(next);
    stopSlideshow();
  };

  const goToNext = () => {
    if (currentIndex >= items.length - 1) return;
    const next = currentIndex + 1;
    flatListRef.current?.scrollToIndex({ index: next, animated: true });
    setCurrentIndex(next);
    stopSlideshow();
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }, []
  );

  // ── Item removal ───────────────────────────────────────────────────────────
  const removeCurrentItem = useCallback(async () => {
    stopSlideshow();
    await deleteMedia(currentItem);
    if (items.length === 1) { navigation.goBack(); return; }
    const newItems = items.filter((_, i) => i !== currentIndex);
    const newIndex = Math.min(currentIndex, newItems.length - 1);
    setItems(newItems);
    if (currentIndex >= newItems.length) {
      flatListRef.current?.scrollToIndex({ index: newIndex, animated: false });
      setCurrentIndex(newIndex);
    }
  }, [currentItem, currentIndex, deleteMedia, items, navigation, stopSlideshow]);

  // ── Menu actions ───────────────────────────────────────────────────────────
  const handleSetCover = async () => {
    setMenuSheet('closed');
    await setFolderCover(currentItem.folderId, currentItem.vaultUri);
  };

  const handleDelete = () => {
    setMenuSheet('closed');
    Alert.alert('Delete', 'Permanently delete this item from your vault?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: removeCurrentItem },
    ]);
  };

  const handleRotate = async () => {
    setMenuSheet('closed');
    const newRotation = ((currentItem.rotation ?? 0) + 90) % 360;
    await rotateMedia(currentItem);
    setItems((prev) => prev.map((m) => m.id === currentItem.id ? { ...m, rotation: newRotation } : m));
  };

  // ── Render items ───────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item, index }: { item: MediaItem; index: number }) => {
    if (item.mediaType === 'video') {
      return (
        <VideoPage
          item={item}
          isCurrent={index === currentIndex}
          onProgressUpdate={handleVideoProgress}
          seekFnRef={seekFnRef}
          playbackRate={playbackRate}
          controlsVisible={controlsVisible}
          onTap={handleScreenTap}
        />
      );
    }
    return (
      <TouchableWithoutFeedback onPress={handleScreenTap}>
        <View style={styles.page}>
          <Image
            source={{ uri: item.vaultUri }}
            style={rotatedImageStyle(item.rotation)}
            resizeMode="contain"
          />
        </View>
      </TouchableWithoutFeedback>
    );
  }, [currentIndex, handleVideoProgress, playbackRate, controlsVisible, handleScreenTap]);

  const showSeekBar = currentItem?.mediaType === 'video' && videoProgress.durMs > 0;

  return (
    <View style={styles.container}>
      {/* Status bar managed via imperative API to avoid conflict with expo-status-bar */}
      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={(item) => item.id}
        extraData={playbackRate}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={route.params.initialIndex}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {/* Back button — top left */}
      {controlsVisible && (
        <View style={[styles.topLeft, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom bar — seek bar always visible for videos; control row only when controls visible */}
      {(showSeekBar || controlsVisible) && (
        <View style={[styles.bottomBar, !controlsVisible && styles.bottomBarTransparent, { paddingBottom: insets.bottom }]}>
          {showSeekBar && (
            <SeekBar
              posMs={videoProgress.posMs}
              durMs={videoProgress.durMs}
              onSeek={handleSeek}
            />
          )}

          {controlsVisible && (
            <View style={styles.controlRow}>
              {/* 3-dot menu */}
              <TouchableOpacity style={styles.menuBtn} onPress={() => { clearHideTimer(); setMenuSheet('menu'); }} activeOpacity={0.8}>
                <Text style={styles.menuBtnText}>•••</Text>
              </TouchableOpacity>

              {/* Nav + slideshow */}
              <View style={styles.navGroup}>
                <TouchableOpacity
                  style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
                  onPress={goToPrev} disabled={currentIndex === 0}
                >
                  <Text style={styles.navBtnText}>‹</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navBtn} onPress={() => isSlideshowing ? stopSlideshow() : startSlideshow()}>
                  <Text style={styles.navBtnText}>{isSlideshowing ? '⏸' : '▶'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.navBtn, currentIndex === items.length - 1 && styles.navBtnDisabled]}
                  onPress={goToNext} disabled={currentIndex === items.length - 1}
                >
                  <Text style={styles.navBtnText}>›</Text>
                </TouchableOpacity>
              </View>

              {/* Counter */}
              <View style={styles.counter}>
                <Text style={styles.counterText}>{currentIndex + 1}/{items.length}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 3-dot action menu */}
      <Modal transparent animationType="slide" visible={menuSheet === 'menu'} onRequestClose={() => setMenuSheet('closed')}>
        <TouchableOpacity style={ms.backdrop} activeOpacity={1} onPress={() => setMenuSheet('closed')}>
          <View style={ms.sheet}>
            <View style={ms.handle} />
            {currentItem?.mediaType !== 'video' && (
              <>
                <MenuRow icon="🖼️" label="Set as Album Cover" onPress={handleSetCover} />
                <ms.Divider />
              </>
            )}
            <MenuRow icon="ℹ️" label="Details" onPress={() => setMenuSheet('details')} />
            <ms.Divider />
            <MenuRow icon="↻" label="Rotate 90°" onPress={handleRotate} />
            {currentItem?.mediaType === 'video' && (
              <>
                <ms.Divider />
                <MenuRow
                  icon="⏩"
                  label={`Playback Speed  ${playbackRate === 1 ? '1×' : `${playbackRate}×`}`}
                  onPress={() => { setMenuSheet('closed'); setShowSpeedSheet(true); }}
                />
              </>
            )}
            <ms.Divider />
            <MenuRow icon="🗑️" label="Delete" onPress={handleDelete} danger />
            <TouchableOpacity style={ms.cancelRow} onPress={() => setMenuSheet('closed')}>
              <Text style={ms.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Playback speed sheet */}
      <SpeedSheet
        visible={showSpeedSheet}
        current={playbackRate}
        onSelect={setPlaybackRate}
        onClose={() => setShowSpeedSheet(false)}
      />

      {/* Details modal */}
      <Modal transparent animationType="fade" visible={menuSheet === 'details'} onRequestClose={() => setMenuSheet('closed')}>
        <TouchableOpacity style={ms.backdrop} activeOpacity={1} onPress={() => setMenuSheet('closed')}>
          <View style={ms.detailsCard}>
            <Text style={ms.detailsTitle}>Details</Text>
            <DetailRow label="Name" value={currentItem?.fileName} />
            <DetailRow label="Date Added" value={currentItem ? formatDate(currentItem.importedAt) : ''} />
            <DetailRow label="File Size" value={currentItem ? formatBytes(currentItem.fileSizeBytes) : ''} />
            <DetailRow label="Type" value={currentItem?.mediaType === 'video' ? 'Video' : 'Photo'} />
            {currentItem?.mediaType === 'video' && currentItem.duration != null && (
              <DetailRow label="Duration" value={`${Math.round(currentItem.duration)}s`} />
            )}
            <TouchableOpacity style={ms.detailsOkBtn} onPress={() => setMenuSheet('closed')}>
              <Text style={ms.detailsOkText}>OK</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Small helper components ───────────────────────────────────────────────────
function MenuRow({ icon, label, onPress, danger }: {
  icon: string; label: string; onPress: () => void; danger?: boolean;
}) {
  return (
    <TouchableOpacity style={ms.row} onPress={onPress}>
      <Text style={ms.rowIcon}>{icon}</Text>
      <Text style={[ms.rowLabel, danger && ms.deleteLabel]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={ms.detailsRow}>
      <Text style={ms.detailsLabel}>{label}</Text>
      <Text style={ms.detailsValue} numberOfLines={2}>{value ?? '—'}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  page: { width, height },
  media: { width, height },

  playOverlay: { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  playBtnCircle: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 3.5, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.8, shadowRadius: 16, elevation: 16,
  },
  playBtnIcon: { color: '#fff', fontSize: 48, marginLeft: 8, lineHeight: 56, includeFontPadding: false, textAlign: 'center' },
  playBtnLabel: {
    color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 16, letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },

  // Back button
  topLeft: {
    position: 'absolute', top: 0, left: 0,
    paddingLeft: 16,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  backBtnText: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  bottomBarTransparent: {
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  controlRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  menuBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  menuBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 3 },
  navGroup: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  navBtn: {
    width: 48, height: 44, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { color: '#fff', fontSize: 22 },
  counter: { width: 52, alignItems: 'flex-end' },
  counterText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '500' },
});

// ─── Menu / Details styles ─────────────────────────────────────────────────────
const ms = {
  ...StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: '#1c1c1e', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 36 },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#444', alignSelf: 'center', marginTop: 10, marginBottom: 12 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 14 },
    rowIcon: { fontSize: 20 },
    rowLabel: { color: '#fff', fontSize: 16 },
    deleteLabel: { color: '#ff3b30' },
    dividerLine: { height: StyleSheet.hairlineWidth, backgroundColor: '#333', marginHorizontal: 20 },
    cancelRow: { marginTop: 8, marginHorizontal: 16, backgroundColor: '#2c2c2e', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
    cancelText: { color: '#0a84ff', fontSize: 16, fontWeight: '600' },
    detailsCard: { backgroundColor: '#1c1c1e', borderRadius: 16, marginHorizontal: 32, padding: 24, alignSelf: 'center', width: '80%' },
    detailsTitle: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
    detailsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333', gap: 12 },
    detailsLabel: { color: '#888', fontSize: 14, flexShrink: 0 },
    detailsValue: { color: '#fff', fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'right' },
    detailsOkBtn: { marginTop: 20, backgroundColor: '#0a84ff', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    detailsOkText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  }),
  Divider: () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: '#333', marginHorizontal: 20 }} />,
};
