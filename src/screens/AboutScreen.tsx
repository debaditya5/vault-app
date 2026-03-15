import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

interface Section {
  title: string;
  icon: string;
  items: { heading: string; body: string }[];
}

const SECTIONS: Section[] = [
  {
    title: 'Getting In',
    icon: '🔐',
    items: [
      {
        heading: 'World Time decoy',
        body: 'The app opens as a World Time clock so it looks harmless to anyone glancing at your screen. Long-press the "World Time" title to reveal the PIN entry screen — the hold duration is adjustable in Settings → Security.',
      },
      {
        heading: 'PIN unlock',
        body: 'Enter your 6-digit PIN to unlock the vault. Three wrong attempts in a row return you to the World Time screen.',
      },
      {
        heading: 'False vault',
        body: 'If you set a false password in Settings → Security, entering it instead of your real PIN opens a separate, empty-looking decoy vault — safe to show if you feel pressured. Nothing about the real vault is visible.',
      },
    ],
  },
  {
    title: 'World Time',
    icon: '🌍',
    items: [
      {
        heading: 'Add & remove cities',
        body: 'Tap + in the top-right to add cities from a list of 35+ time zones. Swipe any row left to remove a city. Your list is saved automatically.',
      },
    ],
  },
  {
    title: 'Folders',
    icon: '🗂️',
    items: [
      {
        heading: 'Create & open',
        body: 'Tap the + button (bottom-right) on the Home screen to create a folder. Tap any folder card to open it and browse its media.',
      },
      {
        heading: 'Rename or delete',
        body: 'Long-press a folder to enter select mode, then tap ··· (top-right) for rename, remove cover, or delete. Swipe after long-pressing to select multiple folders at once.',
      },
      {
        heading: 'Folder cover',
        body: 'The first media item imported automatically becomes the cover thumbnail. You can remove it via the folder actions sheet.',
      },
    ],
  },
  {
    title: 'Importing Media',
    icon: '📥',
    items: [
      {
        heading: 'Add photos & videos',
        body: 'Open a folder, then tap + to open the media picker. Browse your device albums, filter by type, sort by date, and search by filename. Tap items to select them, then tap "Add" to import.',
      },
      {
        heading: 'Original files',
        body: 'Importing always copies the file into the vault\'s private storage. You\'ll be asked whether to keep or delete the original from your device gallery.',
      },
    ],
  },
  {
    title: 'Viewing Media',
    icon: '🖼️',
    items: [
      {
        heading: 'Browse & zoom',
        body: 'Tap any thumbnail to open the full-screen viewer. Swipe left/right to move between items. Pinch to zoom photos, or double-tap to toggle between fit and 2× zoom.',
      },
      {
        heading: 'Video controls',
        body: 'Videos play automatically. Tap to show/hide the control bar — play/pause, a seek scrubber, and speed options (0.5×, 1×, 1.5×, 2×).',
      },
      {
        heading: 'Slideshow',
        body: 'Tap the slideshow button in the folder\'s top bar to start an auto-advancing slideshow. The slide duration is set in Settings.',
      },
      {
        heading: 'Sort & filter',
        body: 'Use the filter bar inside a folder to view only photos or videos, and to sort by date (newest/oldest) or name (A–Z, Z–A).',
      },
    ],
  },
  {
    title: 'Search',
    icon: '🔍',
    items: [
      {
        heading: 'Global search',
        body: 'The search bar on the Home screen searches by filename across every folder. Results appear as a thumbnail grid — tap any result to open it in the viewer.',
      },
      {
        heading: 'In-folder search',
        body: 'The filter bar inside a folder also accepts a filename search, scoped to that folder only.',
      },
    ],
  },
  {
    title: 'Security',
    icon: '🛡️',
    items: [
      {
        heading: 'Auto-lock',
        body: 'The vault locks automatically when you switch apps or put your device to sleep. Your PIN is required to re-enter.',
      },
      {
        heading: 'Change PIN',
        body: 'Go to Settings → Change PIN. You\'ll confirm your current PIN before setting a new one.',
      },
      {
        heading: 'False password & hold duration',
        body: 'In Settings → Security you can set a false password (opens the decoy vault at the lock screen) and adjust how long you must hold "World Time" to reveal the PIN screen.',
      },
    ],
  },
];

export default function AboutScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.container}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Settings</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>How It Works</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            Everything you need to know about using your vault securely and effectively.
          </Text>

          {SECTIONS.map(section => (
            <View key={section.title} style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionIcon}>{section.icon}</Text>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
              <View style={styles.card}>
                {section.items.map((item, idx) => (
                  <View
                    key={item.heading}
                    style={[
                      styles.item,
                      idx < section.items.length - 1 && styles.itemBorder,
                    ]}
                  >
                    <Text style={styles.itemHeading}>{item.heading}</Text>
                    <Text style={styles.itemBody}>{item.body}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          <Text style={styles.footer}>TimeMatrix · Secure private storage</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#505050' },

  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#5e5e5e',
  },
  backBtn:  { width: 90 },
  backText: { color: '#0a84ff', fontSize: 17 },
  navTitle: { color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center' },

  scroll: { padding: 16, paddingBottom: 48 },

  intro: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 4,
  },

  section:        { marginBottom: 24 },
  sectionTitleRow:{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  sectionIcon:    { fontSize: 18, marginRight: 8 },
  sectionTitle:   { color: '#fff', fontSize: 16, fontWeight: '700' },

  card: { backgroundColor: '#3a3a3c', borderRadius: 12, overflow: 'hidden' },
  item: { paddingHorizontal: 16, paddingVertical: 14 },
  itemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#5e5e5e' },
  itemHeading:{ color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 5 },
  itemBody:   { color: '#aaa', fontSize: 14, lineHeight: 20 },

  footer: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    paddingBottom: 8,
  },
});
