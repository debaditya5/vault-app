import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setStatusBarHidden, setStatusBarTranslucent } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useSettings } from '../context/SettingsContext';
import OnboardingModal from '../components/common/OnboardingModal';

type Nav = StackNavigationProp<RootStackParamList>;

interface CityEntry {
  city: string;
  zone: string;
}

const CITIES_KEY = 'VAULT_WORLD_CITIES';

const DEFAULT_CITIES: CityEntry[] = [
  { city: 'New York',    zone: 'America/New_York' },
  { city: 'London',      zone: 'Europe/London' },
  { city: 'Paris',       zone: 'Europe/Paris' },
  { city: 'Dubai',       zone: 'Asia/Dubai' },
  { city: 'Mumbai',      zone: 'Asia/Kolkata' },
  { city: 'Tokyo',       zone: 'Asia/Tokyo' },
  { city: 'Sydney',      zone: 'Australia/Sydney' },
  { city: 'Los Angeles', zone: 'America/Los_Angeles' },
];

const ALL_CITIES: CityEntry[] = [
  { city: 'Auckland',     zone: 'Pacific/Auckland' },
  { city: 'Sydney',       zone: 'Australia/Sydney' },
  { city: 'Melbourne',    zone: 'Australia/Melbourne' },
  { city: 'Tokyo',        zone: 'Asia/Tokyo' },
  { city: 'Seoul',        zone: 'Asia/Seoul' },
  { city: 'Hong Kong',    zone: 'Asia/Hong_Kong' },
  { city: 'Shanghai',     zone: 'Asia/Shanghai' },
  { city: 'Singapore',    zone: 'Asia/Singapore' },
  { city: 'Bangkok',      zone: 'Asia/Bangkok' },
  { city: 'Dhaka',        zone: 'Asia/Dhaka' },
  { city: 'Mumbai',       zone: 'Asia/Kolkata' },
  { city: 'Dubai',        zone: 'Asia/Dubai' },
  { city: 'Riyadh',       zone: 'Asia/Riyadh' },
  { city: 'Nairobi',      zone: 'Africa/Nairobi' },
  { city: 'Cairo',        zone: 'Africa/Cairo' },
  { city: 'Johannesburg', zone: 'Africa/Johannesburg' },
  { city: 'Lagos',        zone: 'Africa/Lagos' },
  { city: 'Moscow',       zone: 'Europe/Moscow' },
  { city: 'Istanbul',     zone: 'Europe/Istanbul' },
  { city: 'Stockholm',    zone: 'Europe/Stockholm' },
  { city: 'Berlin',       zone: 'Europe/Berlin' },
  { city: 'Amsterdam',    zone: 'Europe/Amsterdam' },
  { city: 'Paris',        zone: 'Europe/Paris' },
  { city: 'Rome',         zone: 'Europe/Rome' },
  { city: 'Madrid',       zone: 'Europe/Madrid' },
  { city: 'London',       zone: 'Europe/London' },
  { city: 'São Paulo',    zone: 'America/Sao_Paulo' },
  { city: 'Buenos Aires', zone: 'America/Argentina/Buenos_Aires' },
  { city: 'New York',     zone: 'America/New_York' },
  { city: 'Toronto',      zone: 'America/Toronto' },
  { city: 'Chicago',      zone: 'America/Chicago' },
  { city: 'Mexico City',  zone: 'America/Mexico_City' },
  { city: 'Denver',       zone: 'America/Denver' },
  { city: 'Los Angeles',  zone: 'America/Los_Angeles' },
  { city: 'Vancouver',    zone: 'America/Vancouver' },
  { city: 'Anchorage',    zone: 'America/Anchorage' },
  { city: 'Honolulu',     zone: 'Pacific/Honolulu' },
];

function formatTime(zone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now);
}

function formatDate(zone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(now);
}

function getGMTOffset(zone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: zone,
    timeZoneName: 'shortOffset',
  }).formatToParts(now);
  return parts.find(p => p.type === 'timeZoneName')?.value ?? '';
}

export default function SplashScreen() {
  const navigation = useNavigation<Nav>();
  const { longPressDelay } = useSettings();

  const [now, setNow] = useState(new Date());
  const [cities, setCities] = useState<CityEntry[]>(DEFAULT_CITIES);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [pressing, setPressing] = useState(false);

  // Keep longPressDelay accessible inside stable PanResponder callbacks
  const longPressDelayRef = useRef(longPressDelay);
  useEffect(() => { longPressDelayRef.current = longPressDelay; }, [longPressDelay]);

  useEffect(() => {
    setStatusBarTranslucent(true);
    setStatusBarHidden(true, 'slide');
    return () => {
      setStatusBarHidden(false, 'none');
      setStatusBarTranslucent(false);
    };
  }, []);

  // Load persisted city list
  useEffect(() => {
    AsyncStorage.getItem(CITIES_KEY).then((json) => {
      if (json) {
        try { setCities(JSON.parse(json)); } catch {}
      }
    });
  }, []);

  // Tick clock every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const removeCity = useCallback((zone: string) => {
    setCities(prev => {
      const next = prev.filter(c => c.zone !== zone);
      AsyncStorage.setItem(CITIES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addCity = useCallback((entry: CityEntry) => {
    setCities(prev => {
      if (prev.some(c => c.zone === entry.zone)) return prev;
      const next = [...prev, entry];
      AsyncStorage.setItem(CITIES_KEY, JSON.stringify(next));
      return next;
    });
    setShowAddModal(false);
    setSearch('');
  }, []);

  // Long-press the "World Time" title to unlock
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
    const delay = longPressDelayRef.current;
    setPressing(true);
    Animated.timing(scaleAnim, { toValue: 0.92, duration: delay, useNativeDriver: true }).start();
    timerRef.current = setTimeout(() => navigation.replace('Lock'), delay);
  }, [navigation, scaleAnim]);

  const onPressOut = useCallback(() => {
    setPressing(false);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  }, [scaleAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: onPressIn,
      onPanResponderRelease: onPressOut,
      onPanResponderTerminate: onPressOut,
    })
  ).current;

  const available = ALL_CITIES.filter(
    c =>
      !cities.some(existing => existing.zone === c.zone) &&
      c.city.toLowerCase().includes(search.toLowerCase())
  );

  const bg = '#505050';
  const rowBg = '#505050';
  const rowBorder = '#5e5e5e';
  const metaColor = '#b0b0b0';
  const timeColor = '#d0d0d0';

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <OnboardingModal onDone={() => {}} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Animated.View
          style={[styles.titleWrapper, { transform: [{ scale: scaleAnim }] }]}
          {...panResponder.panHandlers}
        >
          <Text style={styles.title}>World Time</Text>
        </Animated.View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAddModal(true)}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Text style={styles.addBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* ── City list ── */}
      <FlatList
        data={cities}
        keyExtractor={item => item.zone}
        scrollEnabled={!pressing}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Swipeable
            renderRightActions={() => (
              <TouchableOpacity
                style={[styles.deleteAction, { borderBottomColor: rowBorder }]}
                onPress={() => removeCity(item.zone)}
              >
                <Text style={styles.deleteText}>Remove</Text>
              </TouchableOpacity>
            )}
          >
            <View style={[styles.zoneRow, { backgroundColor: rowBg, borderBottomColor: rowBorder }]}>
              <View style={styles.zoneLeft}>
                <Text style={styles.cityName}>{item.city}</Text>
                <Text style={[styles.cityMeta, { color: metaColor }]}>
                  {getGMTOffset(item.zone, now)} · {formatDate(item.zone, now)}
                </Text>
              </View>
              <Text style={[styles.cityTime, { color: timeColor }]}>{formatTime(item.zone, now)}</Text>
            </View>
          </Swipeable>
        )}
      />

      {/* ── Add City Modal ── */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowAddModal(false); setSearch(''); }}
      >
        <View style={[styles.modal, { backgroundColor: bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: rowBorder }]}>
            <Text style={styles.modalTitle}>Add City</Text>
            <TouchableOpacity onPress={() => { setShowAddModal(false); setSearch(''); }}>
              <Text style={styles.modalClose}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder="Search cities…"
            placeholderTextColor="#555"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />

          <FlatList
            data={available}
            keyExtractor={item => item.zone}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.modalRow} onPress={() => addCity(item)}>
                <Text style={styles.modalCity}>{item.city}</Text>
                <Text style={[styles.modalOffset, { color: metaColor }]}>{getGMTOffset(item.zone, now)}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: rowBorder }]} />}
          />
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  titleWrapper: { flex: 1 },
  title: { color: '#fff', fontSize: 42, fontWeight: '800', letterSpacing: 0.5 },
  addBtn: { paddingTop: 6, paddingLeft: 12 },
  addBtnText: { color: '#0a84ff', fontSize: 28, lineHeight: 34 },

  // City rows
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  zoneLeft: { flex: 1, paddingRight: 12 },
  cityName: { color: '#fff', fontSize: 17, fontWeight: '500' },
  cityMeta: { fontSize: 12, marginTop: 3 },
  cityTime: {
    fontSize: 20,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },

  // Swipe-to-delete action
  deleteAction: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e1e1e',
  },
  deleteText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  // Add city modal
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalClose: { color: '#0a84ff', fontSize: 16 },
  searchInput: {
    margin: 16,
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  modalCity: { color: '#fff', fontSize: 16 },
  modalOffset: { fontSize: 14 },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 20,
  },
});
