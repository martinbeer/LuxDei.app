import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Share, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { filterPrayers } from '../data/prayers';

const { width: windowWidth } = Dimensions.get('window');
const scale = windowWidth / 320;
const normalize = (size) => Math.round(size * scale);

export default function RosenkranzScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();

  const results = useMemo(() => filterPrayers({ category: 'rosary' }), []);
  const [showSchedule, setShowSchedule] = useState(false);

  // Weekday -> Rosary mapping (German)
  const weekdayInfo = useMemo(() => {
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const mysteriesByDay = {
      Sonntag: 'Glorreicher Rosenkranz',
      Montag: 'Freudenreicher Rosenkranz',
      Dienstag: 'Schmerzhafter Rosenkranz',
      Mittwoch: 'Glorreicher Rosenkranz',
      Donnerstag: 'Lichtreicher Rosenkranz',
      Freitag: 'Schmerzhafter Rosenkranz',
      Samstag: 'Freudenreicher Rosenkranz',
    };
    const idx = new Date().getDay(); // 0=Sunday
    const todayName = days[idx];
    const todayMystery = mysteriesByDay[todayName];
    return { days, mysteriesByDay, todayName, todayMystery };
  }, []);

  const animValuesRef = useRef({});
  const getAnimFor = (id) => {
    if (!animValuesRef.current[id]) animValuesRef.current[id] = new Animated.Value(0);
    return animValuesRef.current[id];
  };
  useEffect(() => {
    results.forEach((p, idx) => {
      const v = getAnimFor(p.id);
      Animated.timing(v, { toValue: 1, duration: 280, delay: idx * 40, useNativeDriver: true }).start();
    });
  }, [results]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.white} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.white }]} numberOfLines={1}>Rosenkranz</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, paddingTop: 10 }}>
        {/* Dropdown: Which rosary on which day */}
        <View style={[styles.infoCard, { backgroundColor: colors.cardBackground }]}>
          <TouchableOpacity
            onPress={() => setShowSchedule((v) => !v)}
            style={[styles.infoHeaderBar, { borderColor: colors.primary + '30' }]}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="calendar" size={18} color={colors.primary} />
              <Text style={[styles.infoTitle, { color: colors.primary }]}>Wann wird welcher Rosenkranz gebetet?</Text>
            </View>
            <Ionicons name={showSchedule ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
          </TouchableOpacity>

          {showSchedule && (
            <View style={styles.infoList}>
              {weekdayInfo.days.map((d) => (
                <View key={d} style={styles.infoRow}>
                  <Text style={[styles.infoDay, { color: d === weekdayInfo.todayName ? colors.primary : colors.text }]}>{d}</Text>
                  <Text style={[styles.infoMystery, { color: d === weekdayInfo.todayName ? colors.primary : colors.text }]}>{weekdayInfo.mysteriesByDay[d]}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Tutorial entry button */}
        <TouchableOpacity
          onPress={() => navigation.navigate('RosenkranzTutorial')}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            paddingVertical: 14, borderRadius: 12, marginBottom: 16,
            backgroundColor: colors.primary
          }}
          activeOpacity={0.9}
        >
          <Ionicons name="school" size={18} color={colors.white} />
          <Text style={{ marginLeft: 8, color: colors.white, fontFamily: 'Montserrat_600SemiBold' }}>Rosenkranz Tutorial</Text>
        </TouchableOpacity>
        {results.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.cardBackground} />
            <Text style={{ marginTop: 10, color: colors.textSecondary }}>Keine Gebete gefunden</Text>
          </View>
        ) : (
          results.map((p) => {
            const anim = getAnimFor(p.id);
            return (
              <Animated.View key={p.id} style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
                <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: colors.primary }]}>{p.title}</Text>
                    <Ionicons name={'chevron-down'} size={18} color={colors.primary} />
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.primary + '40', paddingHorizontal: 10, paddingVertical: 10 }]}
                      onPress={() => Share.share({ message: `${p.title}\n\n${p.text}` })}
                    >
                      <Ionicons name="share-social" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                      onPress={() => navigation.navigate('GebetDetail', { prayer: p, autoStart: true })}
                    >
                      <Ionicons name="play" size={16} color={colors.white} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBackground: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerSafeArea: { backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: normalize(20), fontFamily: 'Montserrat_700Bold', fontWeight: '700', textAlign: 'center' },
  card: { borderRadius: 14, padding: 14, marginBottom: 12, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: normalize(16), fontFamily: 'Montserrat_600SemiBold', fontWeight: '600' },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10 },
  infoCard: { borderRadius: 14, padding: 14, marginBottom: 14 },
  infoHeaderBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  infoTitle: { marginLeft: 8, fontSize: normalize(14), fontFamily: 'Montserrat_600SemiBold', fontWeight: '600' },
  infoToday: { fontSize: normalize(14), fontFamily: 'Montserrat_500Medium', marginBottom: 8 },
  infoList: { marginTop: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  infoDay: { fontSize: normalize(13), fontFamily: 'Montserrat_500Medium' },
  infoMystery: { fontSize: normalize(13), fontFamily: 'Montserrat_400Regular' },
});
