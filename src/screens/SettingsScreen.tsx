import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Paths } from 'expo-file-system';
import { useAuth } from '../context/AuthContext';
import { useVault } from '../context/VaultContext';
import { useSettings } from '../context/SettingsContext';
import { RootStackParamList } from '../navigation/RootNavigator';

type Nav = StackNavigationProp<RootStackParamList>;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const SLIDESHOW_OPTIONS = [
  { label: '2s', ms: 2000 },
  { label: '3s', ms: 3000 },
  { label: '4s', ms: 4000 },
  { label: '5s', ms: 5000 },
  { label: '10s', ms: 10000 },
];

const LONG_PRESS_OPTIONS = [
  { label: '0.5s', ms: 500 },
  { label: '1s',   ms: 1000 },
  { label: '1.5s', ms: 1500 },
  { label: '2s',   ms: 2000 },
  { label: '3s',   ms: 3000 },
];

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { lock } = useAuth();
  const { folders, mediaByFolder } = useVault();
  const { slideshowInterval, setSlideshowInterval, longPressDelay, setLongPressDelay, authMethod, setAuthMethod } = useSettings();

  const storageStats = useMemo(() => {
    let totalItems = 0;
    let totalBytes = 0;
    for (const folderId of Object.keys(mediaByFolder)) {
      const items = mediaByFolder[folderId] ?? [];
      totalItems += items.length;
      for (const item of items) totalBytes += item.fileSizeBytes ?? 0;
    }
    return { totalItems, totalBytes, folderCount: folders.length };
  }, [folders, mediaByFolder]);

  const vaultPath = `${Paths.document.uri}vault/`;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>Settings</Text>

        {/* Security */}
        <Text style={styles.sectionHeader}>Security</Text>
        <View style={styles.card}>
          {/* Auth method selector */}
          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Auth Method</Text>
              <Text style={styles.rowSublabel}>PIN (6 digits) or Password (8+ chars)</Text>
            </View>
            <View style={styles.durationRow}>
              {(['pin', 'password'] as const).map((method) => (
                <TouchableOpacity
                  key={method}
                  style={[styles.durationChip, authMethod === method && styles.durationChipActive]}
                  onPress={() => {
                    if (authMethod !== method) {
                      navigation.navigate('ChangePin', { targetMethod: method });
                    }
                  }}
                >
                  <Text style={[styles.durationChipText, authMethod === method && styles.durationChipTextActive]}>
                    {method === 'pin' ? 'PIN' : 'Password'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.row, styles.rowBorder]}
            onPress={() => navigation.navigate('ChangePin', {})}
            activeOpacity={0.6}
          >
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>{authMethod === 'pin' ? 'Change PIN' : 'Change Password'}</Text>
              <Text style={styles.rowSublabel}>{authMethod === 'pin' ? 'Update your 6-digit vault PIN' : 'Update your vault password'}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={lock} activeOpacity={0.6}>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Lock Vault</Text>
              <Text style={styles.rowSublabel}>Return to lock screen immediately</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Splash Hold Duration</Text>
              <Text style={styles.rowSublabel}>How long to hold "SECRET" to unlock</Text>
            </View>
            <View style={styles.durationRow}>
              {LONG_PRESS_OPTIONS.map(({ label, ms }) => (
                <TouchableOpacity
                  key={ms}
                  style={[styles.durationChip, longPressDelay === ms && styles.durationChipActive]}
                  onPress={() => setLongPressDelay(ms)}
                >
                  <Text style={[styles.durationChipText, longPressDelay === ms && styles.durationChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Slideshow */}
        <Text style={styles.sectionHeader}>Slideshow</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Slide Duration</Text>
              <Text style={styles.rowSublabel}>How long each slide is shown</Text>
            </View>
            <View style={styles.durationRow}>
              {SLIDESHOW_OPTIONS.map(({ label, ms }) => (
                <TouchableOpacity
                  key={ms}
                  style={[styles.durationChip, slideshowInterval === ms && styles.durationChipActive]}
                  onPress={() => setSlideshowInterval(ms)}
                >
                  <Text style={[styles.durationChipText, slideshowInterval === ms && styles.durationChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Storage */}
        <Text style={styles.sectionHeader}>Storage</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.rowContent}><Text style={styles.rowLabel}>Folders</Text></View>
            <Text style={styles.rowValue}>{storageStats.folderCount}</Text>
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.rowContent}><Text style={styles.rowLabel}>Total Items</Text></View>
            <Text style={styles.rowValue}>{storageStats.totalItems}</Text>
          </View>
          <View style={[styles.row, styles.rowBorder]}>
            <View style={styles.rowContent}><Text style={styles.rowLabel}>Space Used</Text></View>
            <Text style={styles.rowValue}>{formatBytes(storageStats.totalBytes)}</Text>
          </View>
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Storage Location</Text>
              <Text style={styles.pathText} numberOfLines={3} selectable>{vaultPath}</Text>
            </View>
          </View>
        </View>

        {/* About */}
        <Text style={styles.sectionHeader}>About</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Vault</Text>
              <Text style={styles.rowSublabel}>Secure photo &amp; video storage</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { padding: 16, paddingBottom: 40 },
  heading: { color: '#fff', fontSize: 28, fontWeight: '700', marginBottom: 8, paddingHorizontal: 4 },
  sectionHeader: {
    color: '#888', fontSize: 13, fontWeight: '500', textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 24, marginBottom: 6, paddingHorizontal: 4,
  },
  card: { backgroundColor: '#1c1c1e', borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  rowContent: { flex: 1 },
  rowLabel: { color: '#fff', fontSize: 16 },
  rowSublabel: { color: '#888', fontSize: 13, marginTop: 2 },
  rowValue: { color: '#888', fontSize: 15 },
  chevron: { color: '#666', fontSize: 20, marginLeft: 8 },
  pathText: { color: '#0a84ff', fontSize: 12, marginTop: 4, fontFamily: 'monospace', lineHeight: 18 },

  // Slideshow duration chips
  durationRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  durationChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: '#2c2c2e',
  },
  durationChipActive: { backgroundColor: '#0a84ff' },
  durationChipText: { color: '#888', fontSize: 13, fontWeight: '500' },
  durationChipTextActive: { color: '#fff', fontWeight: '700' },
});
