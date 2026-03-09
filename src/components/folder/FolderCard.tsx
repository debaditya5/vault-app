import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Folder } from '../../types';

const CARD_SIZE = (Dimensions.get('window').width - 48) / 2;

interface FolderCardProps {
  folder: Folder;
  onPress: () => void;
  onLongPress: () => void;
  selected?: boolean;
}

export default function FolderCard({ folder, onPress, onLongPress, selected }: FolderCardProps) {
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
          <Image source={{ uri: folder.coverUri }} style={styles.image} resizeMode="cover" contextMenuHidden />
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
});
