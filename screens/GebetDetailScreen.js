import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, BackHandler, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { loadPrayerDetail } from '../lib/prayersApi';

const MIN_SECONDS = 12;
const MAX_SECONDS = 180;
const CHARS_PER_SEC = 22; // a bit faster so total duration is shorter

// Typography scaling like the rest of the app
const { width: windowWidth } = Dimensions.get('window');
const scale = windowWidth / 320;
const normalize = (size) => Math.round(size * scale);

export default function GebetDetailScreen({ route, navigation }) {
  const { colors, disablePrayerTimer } = useTheme();
  const { prayer, autoStart } = route.params || {};
  const [detail, setDetail] = useState(null);
  const baseText = String(prayer?.text || '');
  const text = String((detail?.text ?? baseText) || '');
  const title = (detail?.title || prayer?.title) || 'Gebet';

  // Lazy-load full text if missing or very short
  useEffect(() => {
    let alive = true;
    const needs = !prayer?.text || String(prayer.text).trim().length < 8;
    if (!needs) return;
    (async () => {
      const d = await loadPrayerDetail({ slug: prayer?.slug, id: prayer?.id });
      if (!alive) return;
      if (d) setDetail(d);
    })();
    return () => { alive = false; };
  }, [prayer?.id, prayer?.slug, prayer?.text]);

  // Format text: start each sentence on a new line
  const formattedText = useMemo(() => {
    try {
      let t = text.replace(/\r\n/g, '\n');
      // Optional: normalize ellipses to a single character to avoid triple breaks
      t = t.replace(/\.\.\./g, '…');
      // Insert newline after sentence-ending punctuation clusters
      t = t.replace(/([.!?]+)\s+/g, '$1\n');
      // Collapse multiple newlines
      t = t.replace(/\n{2,}/g, '\n');
      return t.trim();
    } catch {
      return text;
    }
  }, [text]);

  const length = useMemo(() => text.replace(/\s+/g, ' ').trim().length, [text]);
  const plannedSeconds = useMemo(() => {
    const s = Math.ceil(length / CHARS_PER_SEC);
    return Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, s));
  }, [length]);

  const [started, setStarted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(plannedSeconds);
  const intervalRef = useRef(null);
  const timerDisabled = !!disablePrayerTimer;
  const locked = !timerDisabled && started && secondsLeft > 0; // block navigation while locked only if timer enabled

  // Prevent leaving while running
  useEffect(() => {
    const onBeforeRemove = (e) => {
      if (!locked) return;
      e.preventDefault();
    };
    const unsub = navigation.addListener('beforeRemove', onBeforeRemove);
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (locked) return true; // block
      return false;
    });
    // Block tab switching while locked
    const parent = navigation.getParent();
    const onTabPress = (e) => { if (locked) e.preventDefault(); };
    const parentUnsub = parent ? parent.addListener('tabPress', onTabPress) : undefined;
    // Disable swipe-back gestures while locked
    navigation.setOptions({ gestureEnabled: !locked });
    return () => { unsub(); backHandler.remove(); parentUnsub && parentUnsub(); };
  }, [navigation, locked]);

  useEffect(() => {
    if (timerDisabled || !started) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [started, timerDisabled]);

  useEffect(() => {
    // reset if prayer changes
  setStarted(false);
    setSecondsLeft(plannedSeconds);
  }, [plannedSeconds]);

  useEffect(() => {
    if (timerDisabled) {
      // No timer: always consider started for showing text, but no countdown
      setStarted(true);
      setSecondsLeft(0);
      return;
    }
    if (autoStart && !started && secondsLeft === plannedSeconds) {
      setStarted(true);
    }
  }, [autoStart, started, secondsLeft, plannedSeconds, timerDisabled]);

  const progress = started ? (secondsLeft > 0 ? (1 - secondsLeft / plannedSeconds) : 1) : 0;
  const mm = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
  const ss = Math.floor(secondsLeft % 60).toString().padStart(2, '0');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <TouchableOpacity
              disabled={locked}
              onPress={() => navigation.goBack()}
              style={[styles.backButton, locked && { opacity: 0.5 }]}
            >
              <Ionicons name="arrow-back" size={24} color={colors.white} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.white }]} numberOfLines={1}>
              {title}
            </Text>
            <View style={{ width: 40, alignItems: 'flex-end', justifyContent: 'center' }}>
              {locked ? <Ionicons name="lock-closed" size={18} color={colors.white} /> : null}
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 }}>
  {!started ? (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <Ionicons name="book-outline" size={48} color={colors.cardBackground} />
            <Text style={{ marginTop: 10, color: colors.textSecondary, textAlign: 'center' }}>
              Drücke "Starten", um das Gebet zu öffnen.
            </Text>
          </View>
  ) : (
          <>
            {!baseText && !detail && (
              <Text style={{ color: colors.textSecondary, marginBottom: 10 }}>Lade vollständigen Text…</Text>
            )}
            <Text style={[styles.bodyText, { color: colors.text }]}>
              {formattedText}
            </Text>
          </>
        )}
      </ScrollView>

      {/* Bottom action & progress */}
      <SafeAreaView edges={["bottom"]} style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={styles.bottomRow}>
          {/* Progress CTA only */}
          <TouchableOpacity
            disabled={!timerDisabled && started && secondsLeft > 0}
            onPress={() => {
              if (!started) setStarted(true);
              else if (timerDisabled || secondsLeft === 0) navigation.goBack();
            }}
            style={[styles.progressCta, { backgroundColor: colors.cardBackground, borderColor: colors.primary }]}
            activeOpacity={0.9}
          >
            <View
              style={[
                styles.progressCtaFill,
                {
                  width: timerDisabled ? '100%' : `${progress * 100}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
            <Text style={[styles.progressCtaText, { color: started ? colors.white : colors.primary }]}>
              {timerDisabled ? (started ? 'Fertig' : 'Öffnen') : (!started ? 'Starten' : secondsLeft > 0 ? `${mm}:${ss}` : 'Fertig')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBackground: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerSafeArea: { backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
  flex: 1, fontSize: normalize(18), fontFamily: 'Montserrat_600SemiBold', fontWeight: '600', textAlign: 'center',
  },
  bodyText: {
  fontSize: normalize(18),
  lineHeight: normalize(28),
    fontFamily: 'Montserrat_400Regular',
  },
  progressBar: {
    height: 8,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  timeText: {
    fontSize: 13,
    fontFamily: 'Montserrat_500Medium',
    fontWeight: '500',
  },
  cta: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
  },
  ctaText: {
  fontSize: normalize(16),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
  },
  // New progress CTA styles
  progressCta: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  progressCtaFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  progressCtaText: {
  fontSize: normalize(16),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
  },
});
