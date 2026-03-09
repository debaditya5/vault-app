import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Folder } from '../../types';

const CARD_SIZE = (Dimensions.get('window').width - 48) / 2;

interface FolderCardProps {
  folder: Folder;
  onPress: () => void;
  onLongPress: () => void;
  selected?: boolean;
  onMenuPress?: () => void;
}

export default function FolderCard({ folder, onPress, onLongPress, selected, onMenuPress }: FolderCardProps) {
  const inSelectMode = selected !== undefined;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
    >
      <View style={styles.thumbnail}>
        {folder.coverUri ? (
          <Image source={{ uri: folder.coverUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.folderIcon}>🗂️</Text>
          </View>
        )}

        {/* Checkbox — shown only when in select mode (selected is defined) */}
        {inSelectMode && (
          <View style={styles.checkboxContainer}>
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
              {selected && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
          </View>
        )}

        {/* Menu button — shown only when NOT in select mode */}
        {!inSelectMode && onMenuPress && (
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={(e) => { e.stopPropagation(); onMenuPress(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.menuBtnText}>···</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {folder.name}
        </Text>
        <Text style={styles.count}>{folder.itemCount} items</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CARD_SIZE,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1c1c1e',
  },
  thumbnail: {
    width: CARD_SIZE,
    height: CARD_SIZE,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
  },
  folderIcon: {
    fontSize: 48,
  },
  info: {
    padding: 10,
  },
  name: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  count: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  // Checkbox (top-right of thumbnail)
  checkboxContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#0a84ff',
    borderColor: '#0a84ff',
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  // Menu button (top-right of thumbnail, only when not in select mode)
  menuBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  menuBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
