import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert, PanResponder, Pressable, Share, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import * as Clipboard from 'expo-clipboard';
import { queryChurchFathersWithAI } from '../lib/churchFathersAIGateway';

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

  // Kirchenväter Search State
  const [referencePanelVisible, setReferencePanelVisible] = useState(false);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceContent, setReferenceContent] = useState(null);
  const [referenceError, setReferenceError] = useState(null);
  const [selectedVerse, setSelectedVerse] = useState(null);

  // LuxAI Question State
  const [showLuxaiInput, setShowLuxaiInput] = useState(false);
  const [luxaiQuestion, setLuxaiQuestion] = useState('');
  const [selectedVerseForQuestion, setSelectedVerseForQuestion] = useState(null);
  const [luxaiInputHeight, setLuxaiInputHeight] = useState(40);
  const luxaiRealInputRef = useRef(null);

  // Refs for scrolling/highlight
  const scrollViewRef = useRef(null);
  const verseRefs = useRef(new Map());
  const isMountedRef = useRef(true);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Force re-render when referenceContent changes
  useEffect(() => {
    console.log('[BibelContentScreen] referenceContent changed:', referenceContent?.length, 'items');
  }, [referenceContent]);

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
  const handleToggleHighlight = (targetVerse) => {
    setHighlightedVerse((prev) => {
      if (prev) {
        verseRefs.current.delete(prev);
      }
      if (prev && parseInt(prev, 10) === parseInt(targetVerse, 10)) {
        return null;
      }
      return targetVerse;
    });
  };

  const handleVerseLongPress = (verse) => {
    const reference = `${bookDisplayName} ${currentChapter},${verse.vers}`;
    const verseMessage = `${reference}\n\n${verse.text}`;

    Alert.alert(
      'Versoptionen',
      reference,
      [
        {
          text:
            highlightedVerse && parseInt(highlightedVerse, 10) === parseInt(verse.vers, 10)
              ? 'Markierung entfernen'
              : 'Vers markieren',
          onPress: () => handleToggleHighlight(verse.vers),
        },
        {
          text: 'Kopieren',
          onPress: () => {
            Clipboard.setStringAsync(verseMessage).catch((err) =>
              console.warn('Clipboard copy failed', err)
            );
          },
        },
        {
          text: 'Teilen',
          onPress: () => {
            Share.share({ message: verseMessage }).catch((err) =>
              console.warn('Share failed', err)
            );
          },
        },
        {
          text: 'Kirchenväter durchsuchen',
          onPress: () => {
            // Verzögerung damit Alert geschlossen wird bevor Modal öffnet
            setTimeout(() => {
              handleSearchKirchenvaeter(verse);
            }, 100);
          },
        },
        {
          text: 'LuxAI fragen',
          onPress: () => {
            setSelectedVerseForQuestion(verse);
            setShowLuxaiInput(true);
          },
        },
        { text: 'Abbrechen', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const handleSearchKirchenvaeter = async (verse) => {
    console.log('[BibelContentScreen] Starting Kirchenväter search for verse:', verse);
    setSelectedVerse(verse);
    setReferenceContent(null);
    setReferenceError(null);
    setReferenceLoading(true);
    // WICHTIG: Modal erst NACH Datenbeschaffung öffnen!
    // setReferencePanelVisible(true);  // NICHT hier!

    try {
      const result = await queryChurchFathersWithAI({
        book: bookDisplayName,
        chapter: currentChapter,
        verse: verse.vers,
        verseText: verse.text,
        translationTable: tableName,
      });

      console.log('[BibelContentScreen] AI Gateway result:', result);
      console.log('[BibelContentScreen] Passages:', result.passages);
      console.log('[BibelContentScreen] Passages length:', result.passages?.length);
      console.log('[BibelContentScreen] Source:', result.source);

      if (result.passages && result.passages.length > 0) {
        console.log('[BibelContentScreen] Setting reference content with', result.passages.length, 'items from', result.source);
        setReferenceContent(result.passages);
        setReferenceError(null);
      } else {
        console.log('[BibelContentScreen] No passages found');
        setReferenceContent([]);
        setReferenceError(result.message || result.error || 'Keine Kirchenväter-Zitate zu diesem Vers gefunden.');
      }
      
      // State-Updates abschließen
      setReferenceLoading(false);
      
      // Modal JETZT öffnen wenn Daten da sind!
      setTimeout(() => {
        setReferencePanelVisible(true);
      }, 0);
      
    } catch (error) {
      console.warn('[BibelContentScreen] Kirchenväter Suche Exception:', error);
      setReferenceError('Fehler bei der Suche: ' + (error?.message || 'Unbekannter Fehler'));
      setReferenceLoading(false);
      // Modal auch im Error-Fall öffnen damit Fehler angezeigt wird
      setTimeout(() => {
        setReferencePanelVisible(true);
      }, 0);
    }
  };

  const handleSendToLuxai = () => {
    if (!luxaiQuestion.trim() || !selectedVerseForQuestion) {
      return;
    }

    const verseRef = `[${bookDisplayName} ${currentChapter},${selectedVerseForQuestion.vers}]`;
    const messageText = `${verseRef} ${luxaiQuestion}`;

    console.log('[BibelContentScreen] Sending to LuxAI:', messageText);

    // Schließe Modal
    setShowLuxaiInput(false);
    setLuxaiQuestion('');

    // Navigiere zu ChatScreen und sende Nachricht automatisch
    setTimeout(() => {
      navigation.navigate('Chat', {
        initialMessage: messageText,
        autoSend: true,  // ← Neue Parameter für automatisches Senden
        verse: selectedVerseForQuestion,
        bookDisplayName: bookDisplayName,
        chapter: currentChapter,
      });
    }, 300);
  };

  const renderVerse = (verse) => {
    const isHighlighted = highlightedVerse && parseInt(verse.vers) === parseInt(highlightedVerse);
    const highlightStyle = isHighlighted
      ? { backgroundColor: colors.primary + '20', borderRadius: 8, padding: 8 }
      : null;
    return (
      <Pressable
        key={verse.id}
        ref={(ref) => {
          if (ref && isHighlighted) verseRefs.current.set(highlightedVerse, ref);
        }}
        onLongPress={() => handleVerseLongPress(verse)}
        delayLongPress={350}
        android_ripple={{ color: colors.primary + '22' }}
        style={({ pressed }) => [
          styles.verseContainer,
          highlightStyle,
          pressed && !isHighlighted ? { opacity: 0.7 } : null,
        ]}
      >
        <Text style={[styles.verseNumber, { color: colors.primary }]}>{verse.vers}</Text>
        <Text style={[styles.verseText, { color: colors.text }]}>{verse.text}</Text>
      </Pressable>
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
                <Text style={[styles.noDataText, { color: colors.textSecondary }]}>Keine Verse f++r dieses Kapitel gefunden</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Kirchenväter Referenzen Modal */}
        <Modal
          visible={referencePanelVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setReferencePanelVisible(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
            <View style={[styles.referencePanel, { backgroundColor: colors.background }]}>
              {/* Header */}
              <View style={[styles.referencePanelHeader, { borderBottomColor: colors.primary }]}>
                <Text style={[styles.referencePanelTitle, { color: colors.text }]}>
                  Kirchenväter zu {selectedVerse ? `${bookDisplayName} ${currentChapter},${selectedVerse.vers}` : 'diesem Vers'}
                </Text>
                <TouchableOpacity
                  onPress={() => setReferencePanelVisible(false)}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Content */}
              {referenceLoading ? (
                <View style={styles.referencePanelLoading}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Suche lädt...</Text>
                </View>
              ) : referenceError ? (
                <View style={styles.referencePanelError}>
                  <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
                  <Text style={[styles.errorText, { color: colors.textSecondary }]}>{referenceError}</Text>
                </View>
              ) : Array.isArray(referenceContent) && referenceContent.length > 0 ? (
                <ScrollView
                  style={styles.referencePanelContent}
                  showsVerticalScrollIndicator={true}
                  scrollEventThrottle={16}
                  contentContainerStyle={styles.referencePanelScrollContent}
                  nestedScrollEnabled={true}
                >
                  {referenceContent.map((passage, idx) => {
                    console.log(`[BibelContentScreen] Rendering passage ${idx}:`, passage.author);
                    return (
                      <View key={idx} style={[styles.referenceQuote, { borderLeftColor: colors.primary }]}>
                        <Text style={[styles.referenceAuthor, { color: colors.primary }]}>
                          {passage.author}
                        </Text>
                        <Text style={[styles.referenceWork, { color: colors.textSecondary }]}>
                          {passage.work}
                        </Text>
                        <Text style={[styles.referenceExcerpt, { color: colors.text }]} numberOfLines={5}>
                          {passage.excerpt}
                        </Text>
                        {passage.relevance && (
                          <Text style={[styles.referenceRelevance, { color: colors.textSecondary, marginTop: 6, fontSize: 12, fontStyle: 'italic' }]}>
                            {passage.relevance}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              ) : (
                <View style={styles.referencePanelEmpty}>
                  <Ionicons name="book-outline" size={40} color={colors.textSecondary} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    {referenceContent === null 
                      ? 'Lädt...' 
                      : referenceContent === undefined
                      ? 'Undefined State'
                      : Array.isArray(referenceContent)
                      ? `Array aber leer (${referenceContent.length} items)`
                      : 'Keine Zitate gefunden'
                    }
                  </Text>
                  {/* Debug Info */}
                  <Text style={[{ color: colors.textSecondary, fontSize: 10, marginTop: 10 }]}>
                    State: {JSON.stringify({ 
                      loading: referenceLoading, 
                      contentLength: referenceContent?.length,
                      contentType: typeof referenceContent,
                      error: referenceError,
                      isArray: Array.isArray(referenceContent)
                    })}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* LuxAI Input Modal with KeyboardAvoidingView */}
        <Modal
          visible={showLuxaiInput}
          transparent={true}
          animationType="slide"
          onRequestClose={() => {
            setShowLuxaiInput(false);
            setLuxaiQuestion('');
          }}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.luxaiKeyboardContainer}
          >
            <View style={[styles.luxaiModalContainer, { backgroundColor: colors.background }]}>
              {/* Header */}
              <View style={[styles.luxaiPanelHeader, { backgroundColor: colors.background, borderBottomColor: colors.primary }]}>
                <Text style={[styles.luxaiPanelTitle, { color: colors.text }]}>
                  LuxAI fragen zu {selectedVerseForQuestion ? `${bookDisplayName} ${currentChapter},${selectedVerseForQuestion.vers}` : 'diesem Vers'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowLuxaiInput(false);
                    setLuxaiQuestion('');
                  }}
                  style={styles.luxaiCloseButton}
                >
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Scrollable Content */}
              <ScrollView 
                style={styles.luxaiContentScroll} 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.luxaiScrollContent}
              >
                {/* Verse Preview */}
                {selectedVerseForQuestion && (
                  <View style={[styles.luxaiInputContainer, { backgroundColor: colors.background }]}>
                    <View style={[styles.luxaiVersePreview, { backgroundColor: colors.cardBackground }]}>
                      <Text style={[styles.luxaiVerseRef, { color: colors.primary }]}>
                        {bookDisplayName} {currentChapter},{selectedVerseForQuestion.vers}
                      </Text>
                      <Text style={[styles.luxaiVerseText, { color: colors.text }]} numberOfLines={3}>
                        {selectedVerseForQuestion.text}
                      </Text>
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Input Area at Bottom */}
              <View style={[styles.luxaiInputFooter, { backgroundColor: colors.background, borderTopColor: colors.primary }]}>
                <View style={[
                  styles.luxaiTextInputWrapper, 
                  { 
                    backgroundColor: colors.primary + '30',
                    borderColor: colors.primary + '60'
                  }
                ]}>
                  <TextInput
                    ref={luxaiRealInputRef}
                    style={[
                      styles.luxaiTextInput, 
                      { 
                        color: colors.primary,
                        height: Math.max(40, Math.min(120, luxaiInputHeight))
                      }
                    ]}
                    placeholder="Deine Frage eingeben..."
                    placeholderTextColor={colors.primary + '70'}
                    value={luxaiQuestion}
                    onChangeText={setLuxaiQuestion}
                    onContentSizeChange={(e) => setLuxaiInputHeight(e.nativeEvent.contentSize.height)}
                    multiline={true}
                    maxLength={500}
                    returnKeyType="send"
                    onSubmitEditing={handleSendToLuxai}
                    blurOnSubmit={false}
                    autoFocus={true}
                  />
                  <TouchableOpacity
                    onPress={handleSendToLuxai}
                    disabled={!luxaiQuestion.trim()}
                    style={[
                      styles.luxaiSendButton,
                      { 
                        backgroundColor: luxaiQuestion.trim() ? colors.primary : colors.primary + '40',
                      }
                    ]}
                  >
                    <Ionicons 
                      name="send" 
                      size={normalize(16)} 
                      color={luxaiQuestion.trim() ? colors.white : colors.primary}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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

  // Kirchenväter Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  referencePanel: {
    width: '90%',
    height: '85%',  // ← GEÄNDERT: Explizite Höhe statt maxHeight
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    flexDirection: 'column',  // ← HINZUGEFÜGT: Stellt sicher dass children richtig layoutet sind
  },
  referencePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  referencePanelTitle: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  closeButton: {
    padding: 8,
  },
  referencePanelContent: {
    flex: 1,  // ← Nimmt jetzt alle verfügbare Höhe
  },
  referencePanelScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,  // ← HINZUGEFÜGT: ScrollView kann expandieren
  },
  referenceQuote: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  referenceAuthor: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    marginBottom: 4,
  },
  referenceWork: {
    fontSize: normalize(12),
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 6,
  },
  referenceExcerpt: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_400Regular',
    lineHeight: normalize(20),
  },
  referencePanelLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  referencePanelError: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    marginTop: 12,
  },
  referencePanelEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_400Regular',
    marginTop: 12,
  },

  // LuxAI Input Modal Styles
  luxaiKeyboardContainer: {
    flex: 1,
  },
  luxaiModalContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  luxaiContentScroll: {
    flex: 1,
  },
  luxaiScrollContent: {
    paddingBottom: 20,
  },
  luxaiInputFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  luxaiPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  luxaiPanelTitle: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  luxaiCloseButton: {
    padding: 8,
  },
  luxaiInputContainer: {
    padding: 16,
  },
  luxaiVersePreview: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
  },
  luxaiVerseRef: {
    fontSize: normalize(13),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    marginBottom: 4,
  },
  luxaiVerseText: {
    fontSize: normalize(13),
    fontFamily: 'Montserrat_400Regular',
    lineHeight: normalize(18),
  },
  luxaiTextInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 30,
    borderWidth: 1,
    paddingLeft: 18,
    paddingRight: 10,
    paddingVertical: 12,
    minHeight: 56,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 12,
  },
  luxaiTextInput: {
    flex: 1,
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    paddingVertical: 6,
    height: 40,
  },
  luxaiCharCount: {
    fontSize: normalize(11),
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'right',
    marginBottom: 12,
  },
  luxaiSendButton: {
    width: normalize(40),
    height: normalize(40),
    borderRadius: normalize(20),
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  luxaiSendButtonText: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
  },
});

export default BibelContentScreen;
