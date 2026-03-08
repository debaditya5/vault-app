import React, { useState } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
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

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { folders, addFolder, deleteFolder } = useVault();
  const { lock } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [activeFolder, setActiveFolder] = useState<Folder | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);

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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Vault</Text>
        <TouchableOpacity onPress={lock} style={styles.lockBtn}>
          <Text style={styles.lockBtnText}>🔒</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={folders}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.columnWrapper}
        renderItem={({ item }) => (
          <FolderCard
            folder={item}
            onPress={() => navigation.navigate('Folder', { folder: item })}
            onLongPress={() => setActiveFolder(item)}
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

      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

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
  headerTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
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
});
