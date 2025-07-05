import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const scale = width / 320;

const normalize = (size) => {
  return Math.round(size * scale);
};

const BibelContentScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const { bookName, displayName, initialChapter, highlightVerse, translationTable } = route.params;
  const bookDisplayName = displayName || bookName; // Fallback auf bookName wenn displayName nicht vorhanden
  const tableName = translationTable || 'bibelverse'; // Fallback auf Standard-Tabelle
  
  const [currentChapter, setCurrentChapter] = useState(initialChapter || 1);
  const [verses, setVerses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [maxChapter, setMaxChapter] = useState(1);
  const [highlightedVerse, setHighlightedVerse] = useState(highlightVerse || null);
  
  // Cache für Kapitel - bleibt nur während der App-Nutzung bestehen
  const [chapterCache, setChapterCache] = useState(new Map());
  const [prefetchingChapters, setPrefetchingChapters] = useState(new Set());
  
  // Ref für ScrollView um zu highlightVerse zu scrollen
  const scrollViewRef = useRef(null);
  const verseRefs = useRef(new Map());

  useEffect(() => {
    fetchChapterData();
  }, [bookName, currentChapter]);

  // Automatisches Scrollen zum hervorgehobenen Vers
  useEffect(() => {
    if (highlightedVerse && verses.length > 0) {
      const timer = setTimeout(() => {
        const verseRef = verseRefs.current.get(highlightedVerse);
        if (verseRef) {
          verseRef.measureLayout(
            scrollViewRef.current,
            (x, y) => {
              scrollViewRef.current?.scrollTo({
                y: y - 100, // Offset für bessere Sichtbarkeit
                animated: true,
              });
            },
            () => console.log('Measure layout failed')
          );
        }
      }, 500); // Warten bis die Verse gerendert sind
      
      return () => clearTimeout(timer);
    }
  }, [highlightedVerse, verses]);

  // Cache-Schlüssel generieren
  const getCacheKey = (book, chapter) => `${book}_${chapter}`;

  // Einzelnes Kapitel aus der Datenbank laden
  const fetchSingleChapter = async (book, chapter) => {
    const cacheKey = getCacheKey(book, chapter);
    
    // Prüfen ob bereits im Cache
    if (chapterCache.has(cacheKey)) {
      console.log(`Chapter ${chapter} loaded from cache`);
      return chapterCache.get(cacheKey);
    }

    // Prüfen ob bereits am Laden
    if (prefetchingChapters.has(cacheKey)) {
      console.log(`Chapter ${chapter} is already being fetched`);
      return null;
    }

    try {
      setPrefetchingChapters(prev => new Set(prev).add(cacheKey));
      
      const { data: versesData, error: versesError } = await supabase
        .from(tableName)
        .select('*')
        .eq('buch', book)
        .eq('kapitel', chapter)
        .order('vers');

      if (versesError) {
        console.error(`Error fetching chapter ${chapter}:`, versesError);
        return null;
      }

      console.log(`Chapter ${chapter} fetched from database:`, versesData?.length || 0, 'verses');
      
      // Im Cache speichern
      setChapterCache(prev => new Map(prev).set(cacheKey, versesData || []));
      
      return versesData || [];
    } catch (error) {
      console.error(`Error fetching chapter ${chapter}:`, error);
      return null;
    } finally {
      setPrefetchingChapters(prev => {
        const newSet = new Set(prev);
        newSet.delete(cacheKey);
        return newSet;
      });
    }
  };

  // Vorherige und nächste Kapitel vorab laden
  const prefetchAdjacentChapters = async (book, chapter, maxChap) => {
    const prefetchPromises = [];
    
    // Vorheriges Kapitel laden
    if (chapter > 1) {
      const prevChapter = chapter - 1;
      const prevKey = getCacheKey(book, prevChapter);
      if (!chapterCache.has(prevKey) && !prefetchingChapters.has(prevKey)) {
        console.log(`Prefetching previous chapter: ${prevChapter}`);
        prefetchPromises.push(fetchSingleChapter(book, prevChapter));
      }
    }
    
    // Nächstes Kapitel laden
    if (chapter < maxChap) {
      const nextChapter = chapter + 1;
      const nextKey = getCacheKey(book, nextChapter);
      if (!chapterCache.has(nextKey) && !prefetchingChapters.has(nextKey)) {
        console.log(`Prefetching next chapter: ${nextChapter}`);
        prefetchPromises.push(fetchSingleChapter(book, nextChapter));
      }
    }
    
    // Alle Prefetch-Operationen parallel ausführen
    if (prefetchPromises.length > 0) {
      await Promise.all(prefetchPromises);
    }
  };

  const fetchChapterData = async () => {
    try {
      setLoading(true);
      
      console.log('Fetching data for:', bookName, 'Kapitel:', currentChapter);
      
      // Prüfen ob aktuelles Kapitel bereits im Cache ist
      const cacheKey = getCacheKey(bookName, currentChapter);
      
      let currentVerses = null;
      let maxChapterData = null;
      
      if (chapterCache.has(cacheKey)) {
        console.log(`Loading chapter ${currentChapter} from cache`);
        currentVerses = chapterCache.get(cacheKey);
        setVerses(currentVerses);
        setLoading(false);
      }

      // Max Chapter nur einmal laden (beim ersten Aufruf)
      if (maxChapter === 1) {
        const { data, error: maxChapterError } = await supabase
          .from(tableName)
          .select('kapitel')
          .eq('buch', bookName)
          .order('kapitel', { ascending: false })
          .limit(1);

        if (maxChapterError) {
          console.error('Error fetching max chapter:', maxChapterError);
        } else if (data && data.length > 0) {
          maxChapterData = data;
          setMaxChapter(data[0].kapitel);
          console.log('Max chapter for', bookName, ':', data[0].kapitel);
        }
      }

      // Aktuelles Kapitel laden falls nicht im Cache
      if (!currentVerses) {
        currentVerses = await fetchSingleChapter(bookName, currentChapter);
        if (currentVerses) {
          setVerses(currentVerses);
        }
        setLoading(false);
      }

      // Angrenzende Kapitel vorab laden (asynchron im Hintergrund)
      const maxChap = maxChapter > 1 ? maxChapter : (maxChapterData?.[0]?.kapitel || 1);
      setTimeout(() => {
        prefetchAdjacentChapters(bookName, currentChapter, maxChap);
      }, 100); // Kleine Verzögerung um UI-Blocking zu vermeiden

    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Fehler', `Daten konnten nicht geladen werden: ${error.message}`);
      setLoading(false);
    }
  };

  const handlePreviousChapter = () => {
    if (currentChapter > 1) {
      const newChapter = currentChapter - 1;
      console.log(`Navigating to previous chapter: ${newChapter}`);
      setCurrentChapter(newChapter);
      setHighlightedVerse(null); // Reset highlighting beim Kapitelwechsel
    }
  };

  const handleNextChapter = () => {
    if (currentChapter < maxChapter) {
      const newChapter = currentChapter + 1;
      console.log(`Navigating to next chapter: ${newChapter}`);
      setCurrentChapter(newChapter);
      setHighlightedVerse(null); // Reset highlighting beim Kapitelwechsel
    }
  };

  const renderVerse = (verse) => {
    const isHighlighted = highlightedVerse && parseInt(verse.vers) === parseInt(highlightedVerse);
    
    return (
      <View 
        key={verse.id} 
        ref={(ref) => {
          if (ref && highlightedVerse && parseInt(verse.vers) === parseInt(highlightedVerse)) {
            verseRefs.current.set(highlightedVerse, ref);
          }
        }}
        style={[
          styles.verseContainer,
          isHighlighted && { backgroundColor: colors.primary + '20', borderRadius: 8, padding: 8 }
        ]}
      >
        <Text style={[styles.verseNumber, { color: colors.primary }]}>
          {verse.vers}
        </Text>
        <Text style={[styles.verseText, { color: colors.text }]}>
          {verse.text}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>
          
          <View style={styles.headerTitle}>
            <Text style={[styles.bookTitle, { color: colors.white }]}>
              {bookDisplayName}
            </Text>
            <Text style={[styles.chapterTitle, { color: colors.white }]}>
              Kapitel {currentChapter}
            </Text>
          </View>
          
          <View style={styles.headerRight} />
        </View>

        {/* Chapter Navigation */}
        <View style={[styles.chapterNav, { backgroundColor: colors.cardBackground }]}>
          <TouchableOpacity
            onPress={handlePreviousChapter}
            disabled={currentChapter === 1}
            style={[
              styles.navButton,
              { backgroundColor: currentChapter === 1 ? colors.background : colors.primary }
            ]}
          >
            <Ionicons 
              name="chevron-back" 
              size={20} 
              color={currentChapter === 1 ? colors.textSecondary : colors.white} 
            />
          </TouchableOpacity>

          <View style={styles.chapterInfo}>
            <Text style={[styles.chapterNavText, { color: colors.primary }]}>
              Kapitel {currentChapter} von {maxChapter}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleNextChapter}
            disabled={currentChapter === maxChapter}
            style={[
              styles.navButton,
              { backgroundColor: currentChapter === maxChapter ? colors.background : colors.primary }
            ]}
          >
            <Ionicons 
              name="chevron-forward" 
              size={20} 
              color={currentChapter === maxChapter ? colors.textSecondary : colors.white} 
            />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Kapitel wird geladen...
            </Text>
          </View>
        ) : (
          <ScrollView 
            ref={scrollViewRef}
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {verses.length > 0 ? (
              verses.map(renderVerse)
            ) : (
              <View style={styles.noDataContainer}>
                <Ionicons name="book-outline" size={60} color={colors.cardBackground} />
                <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
                  Keine Verse für dieses Kapitel gefunden
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    alignItems: 'center',
  },
  bookTitle: {
    fontSize: normalize(18),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
  },
  chapterTitle: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_400Regular',
    opacity: 0.9,
  },
  headerRight: {
    width: 40,
  },
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
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterInfo: {
    flex: 1,
    alignItems: 'center',
  },
  chapterNavText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_500Medium',
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  verseContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  verseNumber: {
    fontSize: normalize(12),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    marginRight: 8,
    marginTop: 2,
    minWidth: 25,
  },
  verseText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    lineHeight: normalize(24),
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    marginTop: 20,
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  noDataText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default BibelContentScreen;
