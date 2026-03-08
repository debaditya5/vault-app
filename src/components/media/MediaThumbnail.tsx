import React, { useState, useEffect } from 'react';
import { View, Image, TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { MediaItem } from '../../types';

const THUMB_SIZE = (Dimensions.get('window').width - 4) / 3;

function formatDuration(seconds: number): string {
  const totalSecs = Math.floor(seconds);
  if (totalSecs < 60) {
    return `${totalSecs}s`;
  }
  if (totalSecs < 3600) {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  return `${h}h ${m}m`;
}

// In-memory thumbnail cache: mediaItem.id → thumbnail URI
const thumbCache = new Map<string, string>();

interface MediaThumbnailProps {
  item: MediaItem;
  onPress: () => void;
  onLongPress: () => void;
}

export default function MediaThumbnail({ item, onPress, onLongPress }: MediaThumbnailProps) {
  const [thumbUri, setThumbUri] = useState<string | null>(
    item.mediaType === 'video' ? (thumbCache.get(item.id) ?? null) : item.vaultUri
  );

  useEffect(() => {
    if (item.mediaType !== 'video' || thumbUri) return;
    let active = true;
    VideoThumbnails.getThumbnailAsync(item.vaultUri, { time: 500 })
      .then(({ uri }) => {
        if (!active) return;
        thumbCache.set(item.id, uri);
        setThumbUri(uri);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [item.id, item.vaultUri, item.mediaType, thumbUri]);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.placeholder]} />
      )}

      {item.mediaType === 'video' && (
        <View style={styles.playOverlay}>
          <View style={styles.playCircle}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
          {item.duration != null && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { width: THUMB_SIZE, height: THUMB_SIZE, margin: 1 },
  image: { width: '100%', height: '100%', backgroundColor: '#2c2c2e' },
  placeholder: { backgroundColor: '#1c1c1e' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  durationText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  playCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center', alignItems: 'center',
  },
  playIcon: {
    color: '#fff', fontSize: 14,
    marginLeft: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
