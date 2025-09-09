import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

const { width: windowWidth } = Dimensions.get('window');
const scale = windowWidth / 320;

const normalize = (size) => Math.round(size * scale);

const BibelContentScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const { bookName, displayName, initialChapter, highlightVerse, translationTable } = route.params;
  const bookDisplayName = displayName || bookName;
  const tableName = translationTable || 'bibelverse';

  // Data state
  const [currentChapter, setCurrentChapter] = useState(initialChapter || 1);
  const [verses, setVerses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [maxChapter, setMaxChapter] = useState(1);
  const [highlightedVerse, setHighlightedVerse] = useState(highlightVerse || null);

  // Cache state (in-memory for session)
  const [chapterCache, setChapterCache] = useState(new Map());
  const [prefetchingChapters, setPrefetchingChapters] = useState(new Set());

  // Refs for scrolling/highlight
  const scrollViewRef = useRef(null);
  const verseRefs = useRef(new Map());

  // Scrubber state for fast chapter jumping
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [previewChapter, setPreviewChapter] = useState(initialChapter || 1);
  const [scrubX, setScrubX] = useState(0);
  const [chapterInfoWidth, setChapterInfoWidth] = useState(0);
  const latestRef = useRef({ maxChapter: 1, width: 0, currentChapter: 1 });
  const suppressNextPressRef = useRef(false);
  const skipNextEffectRef = useRef(false);
  const lastPreviewRef = useRef(initialChapter || 1);

  useEffect(() => {
  if (skipNextEffectRef.current) {
      // skip effect once when we've already fetched explicitly
      skipNextEffectRef.current = false;
      return;
    }
  fetchChapterData();
  }, [bookName, currentChapter]);

  // Keep preview in sync with actual chapter
  useEffect(() => {
    setPreviewChapter(currentChapter);
  }, [currentChapter]);

  // Track latest values for pan computations
  useEffect(() => {
    latestRef.current = { maxChapter, width: chapterInfoWidth, currentChapter };
  }, [maxChapter, chapterInfoWidth, currentChapter]);

  // Auto-scroll to highlighted verse when content is loaded
  useEffect(() => {
    if (highlightedVerse && verses.length > 0) {
      const timer = setTimeout(() => {
        const verseRef = verseRefs.current.get(highlightedVerse);
        if (verseRef) {
          verseRef.measureLayout(
            scrollViewRef.current,
            (x, y) => {
              scrollViewRef.current?.scrollTo({ y: y - 100, animated: true });
            },
            () => console.log('Measure layout failed')
          );
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [highlightedVerse, verses]);

  // Helpers
  const getCacheKey = (book, chapter) => `${book}_${chapter}`;
  const sortVersesAsc = (arr) => {
    const list = Array.isArray(arr) ? [...arr] : [];
    return list.sort((a, b) => {
      const va = Number(a?.vers);
      const vb = Number(b?.vers);
      if (Number.isNaN(va) && Number.isNaN(vb)) return 0;
      if (Number.isNaN(va)) return 1;
      if (Number.isNaN(vb)) return -1;
      return va - vb;
    });
  };

  // Fetch a single chapter, with cache
  const fetchSingleChapter = async (book, chapter) => {
    const cacheKey = getCacheKey(book, chapter);
    if (chapterCache.has(cacheKey)) return chapterCache.get(cacheKey);
    if (prefetchingChapters.has(cacheKey)) return null;

    try {
      setPrefetchingChapters((prev) => new Set(prev).add(cacheKey));
      const { data: versesData, error: versesError } = await supabase
        .from(tableName)
        .select('id, vers, text, kapitel')
        .eq('buch', book)
        .eq('kapitel', chapter)
        .order('vers');

      if (versesError) {
        console.error(`Error fetching chapter ${chapter}:`, versesError);
        return null;
      }

  const sorted = sortVersesAsc(versesData || []);
  setChapterCache((prev) => new Map(prev).set(cacheKey, sorted));
  return sorted;
    } catch (error) {
      console.error(`Error fetching chapter ${chapter}:`, error);
      return null;
    } finally {
      setPrefetchingChapters((prev) => {
        const next = new Set(prev);
        next.delete(cacheKey);
        return next;
      });
    }
  };

  // Prefetch neighbors
  const prefetchAdjacentChapters = async (book, chapter, maxChap) => {
    const tasks = [];
    if (chapter > 1) {
      const prevKey = getCacheKey(book, chapter - 1);
      if (!chapterCache.has(prevKey) && !prefetchingChapters.has(prevKey)) tasks.push(fetchSingleChapter(book, chapter - 1));
    }
    if (chapter < maxChap) {
      const nextKey = getCacheKey(book, chapter + 1);
      if (!chapterCache.has(nextKey) && !prefetchingChapters.has(nextKey)) tasks.push(fetchSingleChapter(book, chapter + 1));
    }
    if (tasks.length) await Promise.all(tasks);
  };

  // Ensure maxChapter is loaded
  const ensureMaxChapterLoaded = async () => {
    if (maxChapter && maxChapter > 1) return maxChapter;
    try {
      const { data, error: maxChapterError } = await supabase
        .from(tableName)
        .select('kapitel')
        .eq('buch', bookName)
        .order('kapitel', { ascending: false })
        .limit(1);
      if (!maxChapterError && data && data.length > 0) {
        setMaxChapter(data[0].kapitel);
        return data[0].kapitel;
      }
      if (maxChapterError) console.error('Error fetching max chapter:', maxChapterError);
    } catch (e) {
      console.error('ensureMaxChapterLoaded error:', e);
    }
    return 1;
  };

  // Orchestrate chapter fetch + maxChapter
  const fetchChapterData = async () => {
    try {
      setLoading(true);

      // Load max chapter once
      await ensureMaxChapterLoaded();

      // Load current chapter (prefer cache)
      const cacheKey = getCacheKey(bookName, currentChapter);
      let currentVerses = chapterCache.get(cacheKey);
      if (!currentVerses) {
        currentVerses = await fetchSingleChapter(bookName, currentChapter);
      }
  if (currentVerses) setVerses(sortVersesAsc(currentVerses));
      setLoading(false);

      // Prefetch neighbors in background
      const maxChap = maxChapter > 1 ? maxChapter : 1;
      setTimeout(() => prefetchAdjacentChapters(bookName, currentChapter, maxChap), 100);
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Fehler', `Daten konnten nicht geladen werden: ${error.message}`);
      setLoading(false);
    }
  };

  // Explicit commit to a chapter: fetch immediately and update state, avoiding double fetch
  const commitChapterChange = async (toChapter, { recomputeFromScrub = false } = {}) => {
    try {
      console.log('[Scrub] commitChapterChange ->', toChapter);
      skipNextEffectRef.current = true;
  setLoading(true);
  // Immediately reflect the chosen chapter in the UI to avoid flashing old/current value
  setCurrentChapter(toChapter);
  setHighlightedVerse(null);

  // Ensure max chapter known for proper bounds and recompute mapping if needed
  const effectiveMax = await ensureMaxChapterLoaded();
  const upperBound = Math.max(1, effectiveMax || 1, maxChapter || 1, latestRef.current.maxChapter || 1);
  let targetChapter = Math.max(1, Math.min(toChapter, upperBound));
      if (recomputeFromScrub) {
        const effectiveWidth = chapterInfoWidth > 0 ? chapterInfoWidth : windowWidth;
        const ratio = effectiveWidth ? Math.max(0, Math.min(scrubX / effectiveWidth, 1)) : 0;
        targetChapter = Math.max(1, 1 + Math.floor(ratio * Math.max(0, (effectiveMax || 1) - 1) + 0.0001));
        console.log('[Scrub] commit x/width/ratio/max ->', scrubX, effectiveWidth, ratio.toFixed(3), effectiveMax, '=>', targetChapter);
      }
      // If clamping adjusted the chapter, update it again
      if (targetChapter !== toChapter) {
        setCurrentChapter(targetChapter);
      }

      // Load current chapter (prefer cache)
      const cacheKey = getCacheKey(bookName, targetChapter);
      let currentVerses = chapterCache.get(cacheKey);
      if (!currentVerses) {
        currentVerses = await fetchSingleChapter(bookName, targetChapter);
      }
  if (currentVerses) setVerses(sortVersesAsc(currentVerses));
      setLoading(false);

      // Prefetch neighbors in background
      const maxChap = effectiveMax > 1 ? effectiveMax : 1;
      setTimeout(() => prefetchAdjacentChapters(bookName, targetChapter, maxChap), 100);
    } catch (e) {
      console.error('commitChapterChange error:', e);
      setLoading(false);
    }
  };

  // Navigation handlers
  const handlePreviousChapter = () => {
    if (currentChapter > 1) {
      setCurrentChapter(currentChapter - 1);
      setHighlightedVerse(null);
    }
  };

  const handleNextChapter = () => {
    if (currentChapter < maxChapter) {
      setCurrentChapter(currentChapter + 1);
      setHighlightedVerse(null);
    }
  };

  const handleJumpBy = (delta) => {
    if (!maxChapter || maxChapter < 1) return;
    const target = Math.min(maxChapter, Math.max(1, currentChapter + delta));
    setCurrentChapter(target);
    setHighlightedVerse(null);
  };

  // Render a verse row
  const renderVerse = (verse) => {
    const isHighlighted = highlightedVerse && parseInt(verse.vers) === parseInt(highlightedVerse);
    return (
      <View
        key={verse.id}
        ref={(ref) => {
          if (ref && isHighlighted) verseRefs.current.set(highlightedVerse, ref);
        }}
        style={[styles.verseContainer, isHighlighted && { backgroundColor: colors.primary + '20', borderRadius: 8, padding: 8 }]}
      >
        <Text style={[styles.verseNumber, { color: colors.primary }]}>{verse.vers}</Text>
        <Text style={[styles.verseText, { color: colors.text }]}>{verse.text}</Text>
      </View>
    );
  };

  // PanResponder for fast chapter scrubbing on the chapter bar
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        const absDx = Math.abs(gesture.dx);
        const absDy = Math.abs(gesture.dy);
        return absDx > 6 && absDx > absDy;
      },
      onMoveShouldSetPanResponderCapture: (_evt, gesture) => {
        const absDx = Math.abs(gesture.dx);
        const absDy = Math.abs(gesture.dy);
        return absDx > 6 && absDx > absDy;
      },
      onPanResponderGrant: (evt) => {
        ensureMaxChapterLoaded();
        const effectiveWidth = latestRef.current.width > 0 ? latestRef.current.width : windowWidth;
        const x = Math.max(0, Math.min(evt.nativeEvent.locationX, effectiveWidth));
        setIsScrubbing(true);
        suppressNextPressRef.current = true;
        setScrubX(x);
  const maxC = Math.max(1, latestRef.current.maxChapter || 0, maxChapter || 0);
        const ratio = effectiveWidth ? x / effectiveWidth : 0;
        const target = Math.max(1, 1 + Math.floor(ratio * Math.max(0, (maxC || 1) - 1) + 0.0001));
        console.log('[Scrub] grant x/width/ratio/max ->', x, effectiveWidth, ratio.toFixed(3), maxC, '=>', target);
  setPreviewChapter(target);
  lastPreviewRef.current = target;
      },
      onPanResponderMove: (evt) => {
        const effectiveWidth = latestRef.current.width > 0 ? latestRef.current.width : windowWidth;
        const x = Math.max(0, Math.min(evt.nativeEvent.locationX, effectiveWidth));
        setScrubX(x);
  const maxC = Math.max(1, latestRef.current.maxChapter || 0, maxChapter || 0);
        const ratio = effectiveWidth ? x / effectiveWidth : 0;
        const target = Math.max(1, 1 + Math.floor(ratio * Math.max(0, (maxC || 1) - 1) + 0.0001));
        console.log('[Scrub] move x/width/ratio/max ->', x, effectiveWidth, ratio.toFixed(3), maxC, '=>', target);
  setPreviewChapter(target);
  lastPreviewRef.current = target;
      },
      onPanResponderRelease: () => {
  const toChapter = lastPreviewRef.current; // commit exactly the last shown number (robust against state lag)
        setIsScrubbing(false);
        commitChapterChange(toChapter);
        setTimeout(() => {
          suppressNextPressRef.current = false;
        }, 50);
      },
      onPanResponderTerminate: () => {
        setIsScrubbing(false);
        setTimeout(() => {
          suppressNextPressRef.current = false;
        }, 50);
      },
    })
  ).current;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header background wrapper with rounded bottom corners (extends behind notch) */}
      <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
        <SafeAreaView style={styles.headerSafeArea}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.white} />
            </TouchableOpacity>

            <View style={styles.headerTitle}>
              <Text style={[styles.bookTitle, { color: colors.white }]}>{bookDisplayName}</Text>
              <Text style={[styles.chapterTitle, { color: colors.white }]}>Kapitel {isScrubbing ? previewChapter : currentChapter}</Text>
            </View>

            <View style={styles.headerRight} />
          </View>
        </SafeAreaView>
      </View>

      {/* Rest of the content respects remaining safe areas */}
      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        {/* Chapter Navigation */}
        <View style={[styles.chapterNav, { backgroundColor: colors.cardBackground }]}>
          <TouchableOpacity
            onPress={handlePreviousChapter}
            onLongPress={() => handleJumpBy(-10)}
            disabled={currentChapter === 1}
            style={[styles.navButton, { backgroundColor: currentChapter === 1 ? colors.background : colors.primary }]}
          >
            <Ionicons name="chevron-back" size={20} color={currentChapter === 1 ? colors.textSecondary : colors.white} />
          </TouchableOpacity>

          <View style={styles.chapterInfo} collapsable={false} onLayout={(e) => setChapterInfoWidth(e.nativeEvent.layout.width)} {...panResponder.panHandlers}>
            <Text style={[styles.chapterNavText, { color: colors.primary }]}>Kapitel {isScrubbing ? previewChapter : currentChapter} von {maxChapter}</Text>
            {isScrubbing && chapterInfoWidth > 0 && (
              <View
                pointerEvents="none"
                style={[
                  styles.scrubBubble,
                  { backgroundColor: colors.primary, left: Math.max(10, Math.min(scrubX - 20, chapterInfoWidth - 40)) },
                ]}
              >
                <Text style={[styles.scrubBubbleText, { color: colors.white }]}>{previewChapter}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={handleNextChapter}
            onLongPress={() => handleJumpBy(10)}
            disabled={currentChapter === maxChapter}
            style={[styles.navButton, { backgroundColor: currentChapter === maxChapter ? colors.background : colors.primary }]}
          >
            <Ionicons name="chevron-forward" size={20} color={currentChapter === maxChapter ? colors.textSecondary : colors.white} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Kapitel wird geladen...</Text>
          </View>
        ) : (
          <ScrollView ref={scrollViewRef} style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {verses.length > 0 ? (
              verses.map(renderVerse)
            ) : (
              <View style={styles.noDataContainer}>
                <Ionicons name="book-outline" size={60} color={colors.cardBackground} />
                <Text style={[styles.noDataText, { color: colors.textSecondary }]}>Keine Verse für dieses Kapitel gefunden</Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  headerBackground: {
    backgroundColor: '#000', // overridden by dynamic color
    paddingTop: 0,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerSafeArea: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, alignItems: 'center' },
  bookTitle: { fontSize: normalize(18), fontFamily: 'Montserrat_600SemiBold', fontWeight: '600' },
  chapterTitle: { fontSize: normalize(14), fontFamily: 'Montserrat_400Regular', opacity: 0.9 },
  headerRight: { width: 40 },

  chapterNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    marginHorizontal: 20,
    marginTop: 15,
    borderRadius: 15,
  },
  navButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chapterInfo: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  chapterNavText: { fontSize: normalize(16), fontFamily: 'Montserrat_500Medium', fontWeight: '500' },

  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 25, paddingVertical: 20, paddingBottom: 100 },
  verseContainer: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-start' },
  verseNumber: { fontSize: normalize(12), fontFamily: 'Montserrat_600SemiBold', fontWeight: '600', marginRight: 10, marginTop: 2, minWidth: 25 },
  verseText: { fontSize: normalize(16), fontFamily: 'Montserrat_400Regular', lineHeight: normalize(24), flex: 1 },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  loadingText: { fontSize: normalize(16), fontFamily: 'Montserrat_400Regular', marginTop: 20 },
  noDataContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, paddingVertical: 60 },
  noDataText: { fontSize: normalize(16), fontFamily: 'Montserrat_400Regular', textAlign: 'center', marginTop: 20 },

  scrubBubble: {
    position: 'absolute',
    bottom: 44,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  scrubBubbleText: { fontSize: normalize(12), fontFamily: 'Montserrat_700Bold', fontWeight: '700' },
});

export default BibelContentScreen;
