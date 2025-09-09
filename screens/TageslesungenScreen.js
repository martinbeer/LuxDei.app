import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { getDatabaseBookName } from '../utils/bookMapping';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const scale = width / 320;

const normalize = (size) => {
  return Math.round(size * scale);
};

const TageslesungenScreen = () => {
  const { colors } = useTheme();
  const navigation = useNavigation();
  
  const [loading, setLoading] = useState(true);
  const [liturgicalData, setLiturgicalData] = useState(null);
  const [selectedTranslation, setSelectedTranslation] = useState('Allioli-Arndt');
  const [showTranslationDropdown, setShowTranslationDropdown] = useState(false);
  const [readings, setReadings] = useState([]);
  const [selectedReading, setSelectedReading] = useState(null);
  const [selectedReadingIndex, setSelectedReadingIndex] = useState(0);
  const isFetchingRef = useRef(false);

  const translations = [
    { name: 'Allioli-Arndt', table: 'bibelverse' },
    { name: 'Schöningh', table: 'bibelverse_schoenigh' },
    { name: 'Einheitsübersetzung', table: 'bibelverse_einheit' }
  ];

  // Fetch liturgical data from API
  const fetchLiturgicalData = async () => {
    try {
      if (isFetchingRef.current) {
        return;
      }
      isFetchingRef.current = true;
      // Fetch today's data including weekday/title/readings/link (wdtrlu)
      const url = `https://www.eucharistiefeier.de/lk/api.php?format=json&tag=0&info=wdtrlu&dup=e&bahn=j`;
      const response = await fetch(url);
      const raw = await response.text();
      const trimmed = raw.trim().replace(/^\uFEFF/, '');
      const data = JSON.parse(trimmed);

      console.log('Liturgical API Response:', data);

      if (data.Zelebrationen && Object.keys(data.Zelebrationen).length > 0) {
        const celebrations = Object.values(data.Zelebrationen);

        // Heuristic: prefer the weekday entry if present (key often ends with 'w'), else take the first
        // Fallback to last as before if ordering suggests weekday last
        let mainCelebration = celebrations[celebrations.length - 1];
        const weekday = celebrations.find(c => (c?.Tl || '').toLowerCase().includes('woche im jahreskreis'));
        if (weekday) mainCelebration = weekday;

        setLiturgicalData(mainCelebration);
        console.log('Selected celebration:', mainCelebration);
        parseReadings(mainCelebration);
      } else {
        // Create empty placeholders if no data
        parseReadings({});
      }
    } catch (error) {
      console.error('Error fetching liturgical data:', error);
  // Optional: surface to UI if needed
  // Alert.alert('Fehler', 'Konnte liturgische Daten nicht laden');
      parseReadings({}); // Create empty placeholders on error
    } finally {
      setLoading(false);
  isFetchingRef.current = false;
    }
  };

  // Parse readings from liturgical data
  const parseReadings = (data) => {
    const readingTypes = [];
    
    // Always create these standard reading types, even if empty
    readingTypes.push({
      id: 'L1',
      title: '1. Lesung',
      reference: data.L1 || '',
      type: 'reading'
    });
    
    readingTypes.push({
      id: 'AP',
      title: 'Antwortpsalm',
      reference: data.AP || '',
      type: 'psalm'
    });
    
    // Only add second reading if it exists and is not empty
    if (data.L2 && data.L2.trim() !== '') {
      readingTypes.push({
        id: 'L2',
        title: 'Zweite Lesung',
        reference: data.L2,
        type: 'reading'
      });
    }
    
    readingTypes.push({
      id: 'EV',
      title: 'Evangelium',
      reference: data.EV || '',
      type: 'gospel'
    });
    
    console.log('Parsed readings:', readingTypes);
    setReadings(readingTypes);
    // Set first reading as selected by default
    if (readingTypes.length > 0) {
      setSelectedReading(readingTypes[0]);
      setSelectedReadingIndex(0);
    }
  };

  // Handle reading selection
  const handleReadingSelect = (reading, index) => {
    setSelectedReading(reading);
    setSelectedReadingIndex(index);
  };

  // Handle translation selection
  const handleTranslationSelect = (translation) => {
    setSelectedTranslation(translation.name);
    setShowTranslationDropdown(false);
  };

  useEffect(() => {
    fetchLiturgicalData();
  }, []);

  useEffect(() => {
    if (readings.length > 0 && selectedReadingIndex < readings.length) {
      setSelectedReading(readings[selectedReadingIndex]);
    }
  }, [selectedTranslation]);

  // Parse bible reference and handle complex references
  const parseBibleReference = (reference) => {
    if (!reference) return null;
    
    // Remove common prefixes and clean up
    const cleaned = reference.replace(/^(Lesung aus|Evangelium nach|Psalm)\s+/i, '').trim();
    
    // Handle complex references with multiple parts (e.g. "2 Tim 1, 13-14; 2, 1-3")
    const parts = cleaned.split(';');
    const allReferences = [];
    
    for (let part of parts) {
      part = part.trim();
      
      // Try to match book chapter,verse pattern
      const match = part.match(/^(.+?)\s+(\d+)[,:]\s*(.+)$/);
      if (match) {
        const [, bookAbbr, chapter, verses] = match;
        const abbrNorm = bookAbbr.replace(/\.$/, '').trim();
        const fullBookName = mapBookAbbreviation(abbrNorm);
        
        if (fullBookName) {
          allReferences.push({
            book: fullBookName,
            chapter: parseInt(chapter),
            verses: verses.trim()
          });
        }
      } else {
        // Handle cases like "2, 1-3" (continuation of previous book)
        const continuationMatch = part.match(/^(\d+)[,:]\s*(.+)$/);
        if (continuationMatch && allReferences.length > 0) {
          const [, chapter, verses] = continuationMatch;
          const previousRef = allReferences[allReferences.length - 1];
          allReferences.push({
            book: previousRef.book,
            chapter: parseInt(chapter),
            verses: verses.trim()
          });
        }
      }
    }
    
    return allReferences.length > 0 ? allReferences : null;
  };

  // Map book abbreviations to full names
  const mapBookAbbreviation = (abbr) => {
    const bookMappings = {
      'Gen': 'Genesis', 'Ex': 'Exodus', 'Lev': 'Levitikus', 'Num': 'Numeri', 'Dtn': 'Deuteronomium',
      'Jos': 'Josua', 'Ri': 'Richter', 'Rut': 'Rut', '1 Sam': '1. Samuel', '2 Sam': '2. Samuel',
      '1 Kön': '1. Könige', '2 Kön': '2. Könige', '1 Chr': '1. Chronik', '2 Chr': '2. Chronik',
      'Esra': 'Esra', 'Neh': 'Nehemia', 'Tob': 'Tobit', 'Jdt': 'Judit', 'Est': 'Ester',
      '1 Makk': '1. Makkabäer', '2 Makk': '2. Makkabäer', 'Ijob': 'Ijob', 'Ps': 'Psalmen',
      'Spr': 'Sprichwörter', 'Koh': 'Kohelet', 'Hld': 'Hoheslied', 'Weish': 'Weisheit',
      'Sir': 'Jesus Sirach', 'Jes': 'Jesaja', 'Jer': 'Jeremia', 'Klgl': 'Klagelieder',
      'Bar': 'Baruch', 'Ez': 'Ezechiel', 'Dan': 'Daniel', 'Hos': 'Hosea', 'Joel': 'Joel',
      'Am': 'Amos', 'Obd': 'Obadja', 'Jona': 'Jona', 'Mi': 'Micha', 'Nah': 'Nahum',
      'Hab': 'Habakuk', 'Zef': 'Zefanja', 'Hag': 'Haggai', 'Sach': 'Sacharja', 'Mal': 'Maleachi',
      'Mt': 'Matthäus', 'Mk': 'Markus', 'Lk': 'Lukas', 'Joh': 'Johannes', 'Apg': 'Apostelgeschichte',
      'Röm': 'Römer', '1 Kor': '1. Korinther', '2 Kor': '2. Korinther', 'Gal': 'Galater',
      'Eph': 'Epheser', 'Phil': 'Philipper', 'Kol': 'Kolosser', '1 Thess': '1. Thessalonicher',
      '2 Thess': '2. Thessalonicher', '1 Tim': '1. Timotheus', '2 Tim': '2. Timotheus',
      'Tit': 'Titus', 'Phlm': 'Philemon', 'Hebr': 'Hebräer', 'Jak': 'Jakobus',
      '1 Petr': '1. Petrus', '2 Petr': '2. Petrus', '1 Joh': '1. Johannes', '2 Joh': '2. Johannes',
      '3 Joh': '3. Johannes', 'Jud': 'Judas', 'Offb': 'Offenbarung'
    };
    
    return bookMappings[abbr] || abbr;
  };

  // Fetch verses for multiple references
  const fetchVersesForReading = async (references) => {
    if (!references || references.length === 0) return [];
    
    const currentTranslation = translations.find(t => t.name === selectedTranslation);
    const tableName = currentTranslation?.table || 'bibelverse';
    
    let allVerses = [];
    
    for (const ref of references) {
      const databaseBookName = getDatabaseBookName(ref.book, tableName);
      if (!databaseBookName) continue;
      
      try {
        // Parse verse range - handle complex cases like "1-3.5.7-9"
        const verseRanges = ref.verses.split('.');
        let refVerses = [];
        
        for (const range of verseRanges) {
          let trimmedRange = range.trim();
          
          // Remove letters from verse references (e.g., "3a" becomes "3", "3b-4" becomes "3-4")
          trimmedRange = trimmedRange.replace(/[a-zA-Z]/g, '');
          
          // Skip empty ranges
          if (!trimmedRange || trimmedRange === '') continue;
          
          let startVerse = 1, endVerse = null;
          
          if (trimmedRange.includes('-')) {
            const verseParts = trimmedRange.split('-');
            startVerse = parseInt(verseParts[0].trim());
            endVerse = parseInt(verseParts[1].trim());
          } else {
            startVerse = parseInt(trimmedRange);
            endVerse = startVerse;
          }
          
          console.log('Processed range:', range, '->', trimmedRange, 'verses:', startVerse, 'to', endVerse);
          
          console.log('Query params:', {
            table: tableName,
            book: databaseBookName,
            chapter: ref.chapter,
            startVerse,
            endVerse,
            hasTestament: tableName === 'bibelverse_schoenigh' || tableName === 'bibelverse_einheit'
          });
          
          if (startVerse && endVerse && !isNaN(startVerse) && !isNaN(endVerse)) {
            let query = supabase
              .from(tableName)
              .select('*')
              .eq('buch', databaseBookName)
              .eq('kapitel', ref.chapter)
              .gte('vers', startVerse)
              .lte('vers', endVerse);
            
            // Add testament filter for tables that have it (Schöningh und Einheitsübersetzung)
            if (tableName === 'bibelverse_schoenigh' || tableName === 'bibelverse_einheit') {
              const newTestamentAbbr = new Set([
                'Mt','Mk','Lk','Joh','Apg','Röm','1Kor','2Kor','Gal','Eph','Phil','Kol',
                '1Thess','2Thess','1Tim','2Tim','Tit','Phlm','Hebr','Jak','1Petr','2Petr',
                '1Joh','2Joh','3Joh','Jud','Offb'
              ]);
              const newTestamentFullNames = new Set([
                'Matthäusevangelium','Markusevangelium','Lukasevangelium','Johannesevangelium','Apostelgeschichte',
                'Römerbrief','1. Korintherbrief','2. Korintherbrief','Galaterbrief','Epheserbrief','Philipperbrief',
                'Kolosserbrief','1. Thessalonicherbrief','2. Thessalonicherbrief','1. Timotheusbrief','2. Timotheusbrief',
                'Titusbrief','Philemonbrief','Hebräerbrief','Jakobusbrief','1. Petrusbrief','2. Petrusbrief',
                '1. Johannesbrief','2. Johannesbrief','3. Johannesbrief','Judasbrief','Offenbarung des Johannes'
              ]);
              const isNewTestament = newTestamentAbbr.has(databaseBookName) || newTestamentFullNames.has(databaseBookName);
              query = query.eq('testament', isNewTestament ? 'NT' : 'OT');
            }
            
            let { data, error } = await query.order('vers');
            
            // Allioli uses old psalm numbering; if we query Die Psalmen 66 v16+ and get empty, try previous psalm (65)
            if (
              (!error && (!data || data.length === 0)) &&
              tableName === 'bibelverse' &&
              databaseBookName === 'Die Psalmen' &&
              typeof ref.chapter === 'number' &&
              (startVerse >= 16 || endVerse >= 16)
            ) {
              console.log('No results for Psalmen', ref.chapter, 'trying old numbering (chapter - 1)');
              const altQuery = supabase
                .from(tableName)
                .select('*')
                .eq('buch', databaseBookName)
                .eq('kapitel', ref.chapter - 1)
                .gte('vers', startVerse)
                .lte('vers', endVerse);
              const altRes = await altQuery.order('vers');
              data = altRes.data;
              error = altRes.error;
            }
            
            console.log('Query result:', { 
              dataLength: data?.length, 
              error,
              firstVerse: data?.[0]?.vers,
              lastVerse: data?.[data && data.length ? data.length - 1 : 0]?.vers
            });
            
            if (!error && data) {
              refVerses = [...refVerses, ...data];
            } else if (error) {
              console.error('Supabase query error:', error);
            }
          } else {
            console.warn('Invalid verse numbers:', { startVerse, endVerse });
          }
        }
        
        // Remove duplicates and sort
        const uniqueVerses = refVerses.filter((verse, index, self) => 
          index === self.findIndex(v => v.vers === verse.vers)
        ).sort((a, b) => a.vers - b.vers);

        console.log('Final verses for', ref.book, ':', uniqueVerses.length, 'verses');
        
        // Add chapter info to verses for display
        const versesWithChapter = uniqueVerses.map(verse => ({
          ...verse,
          displayChapter: ref.chapter,
          displayBook: ref.book
        }));
        
        allVerses = [...allVerses, ...versesWithChapter];
      } catch (error) {
        console.error('Error fetching verses for reference:', ref, error);
      }
    }
    
    return allVerses;
  };

  // Handle tab selection
  const handleTabPress = (index) => {
    setSelectedTab(index);
  };

  useEffect(() => {
    fetchLiturgicalData();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
        <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
          <SafeAreaView style={styles.headerSafeArea}>
            <View style={styles.header}>
              <TouchableOpacity 
                onPress={() => navigation.goBack()}
                style={styles.backButton}
              >
                <Ionicons name="arrow-back" size={24} color={colors.white} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.white }]}>Tageslesungen</Text>
              <View style={styles.headerRight} />
            </View>
          </SafeAreaView>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Lade Tageslesungen...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      {/* Header with extended background */}
      <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
  <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color={colors.white} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.white }]}>Tageslesungen</Text>
            <View style={styles.headerRight} />
          </View>
        </SafeAreaView>
      </View>

  {/* Content */}
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          onScrollBeginDrag={() => setShowTranslationDropdown(false)}
        >
          {/* Date Card */}
          {liturgicalData && (
            <View style={[styles.dateCard, { backgroundColor: colors.cardBackground }]}>
              <Text style={[styles.dateTitle, { color: colors.primary }]}>
                {liturgicalData.Tl || 'Liturgischer Tag'}
              </Text>
              {liturgicalData.Bem && (
                <Text style={[styles.dateSubtitle, { color: colors.textSecondary }]}>
                  {liturgicalData.Bem}
                </Text>
              )}
            </View>
          )}

          {/* Translation Dropdown */}
          <View style={styles.translationSection}>
            <TouchableOpacity
              style={[styles.translationSelector, { backgroundColor: colors.cardBackground }]}
              onPress={() => setShowTranslationDropdown(!showTranslationDropdown)}
            >
              <Text style={[styles.translationText, { color: colors.primary }]}>
                {selectedTranslation}
              </Text>
              <Ionicons 
                name={showTranslationDropdown ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.primary}
              />
            </TouchableOpacity>

            {showTranslationDropdown && (
              <View style={[styles.translationDropdown, { backgroundColor: colors.cardBackground }]}>
                {translations.map((translation, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.translationOption,
                      translation.name === selectedTranslation && { backgroundColor: colors.primary + '20' }
                    ]}
                    onPress={() => handleTranslationSelect(translation)}
                  >
                    <Text style={[
                      styles.translationOptionText,
                      { color: colors.text },
                      translation.name === selectedTranslation && { color: colors.primary, fontWeight: '600' }
                    ]}>
                      {translation.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Readings Selection */}
          {readings.length > 0 && (
            <View style={styles.readingsSection}>
              <Text style={[styles.sectionTitle, { color: colors.primary }]}>Lesungen</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.readingButtonsContainer}
                style={styles.readingButtonsScroll}
              >
                {readings.map((reading, index) => (
                  <TouchableOpacity
                    key={reading.id}
                    style={[
                      styles.readingButton,
                      { backgroundColor: colors.cardBackground },
                      selectedReadingIndex === index && { backgroundColor: colors.primary }
                    ]}
                    onPress={() => handleReadingSelect(reading, index)}
                  >
                    <Text style={[
                      styles.readingButtonText,
                      { color: colors.primary },
                      selectedReadingIndex === index && { color: colors.white }
                    ]}>
                      {reading.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Selected Reading Content */}
          {selectedReading && (
            <ReadingContent 
              reading={selectedReading}
              selectedTranslation={selectedTranslation}
              colors={colors}
            />
          )}
        </ScrollView>
    </View>
  );
};

// Component to display reading content with verses
const ReadingContent = ({ reading, selectedTranslation, colors }) => {
  const [verses, setVerses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [displayRef, setDisplayRef] = useState('');

  // Parse bible reference and handle complex references
  const parseBibleReference = (reference) => {
    if (!reference) return null;
    
    // Remove common prefixes and clean up
    let cleaned = reference
      .replace(/^vgl\.\s*/i, '') // drop "vgl. " prefix if present
      .replace(/^(Lesung aus|Evangelium nach|Psalm)\s+/i, '') // standard leading labels
      .trim();
    // Normalize dashes to hyphen
    cleaned = cleaned.replace(/[–—−]/g, '-');
    
    console.log('ReadingContent - Parsing reference:', reference, '-> cleaned:', cleaned);
    
    // Handle complex psalm references like "Ps 135 (134), 1-2.3-4.5-6 (R: 3a)"
    if (cleaned.includes('(R:')) {
      // Remove the response indicator
      cleaned = cleaned.replace(/\s*\(R:[^)]*\)/, '');
    }
    
    // Handle psalm with alternative numbering like "Ps 135 (134)" or letters e.g. "(113A)": keep first number only
    if (/^Ps\s+\d+/.test(cleaned)) {
      cleaned = cleaned.replace(/^(Ps\s+\d+)\s*\([^)]*\)/, '$1');
    }
    // Replace German "u." (und) in verse list with point separator for parsing
    cleaned = cleaned.replace(/\su\.\s*/g, '.');
    
    console.log('ReadingContent - After psalm cleanup:', cleaned);
    
    // Handle complex references with multiple parts (e.g. "2 Tim 1, 13-14; 2, 1-3")
    const parts = cleaned.split(';');
    const allReferences = [];
    
    for (let part of parts) {
      part = part.trim();
      
      // Try to match book chapter,verse pattern
      const match = part.match(/^(.+?)\s+(\d+)[,:]\s*(.+)$/);
      if (match) {
  const [, bookAbbr, chapter, versesRaw] = match;
        // Normalize abbreviation (drop trailing dot) before mapping
        const abbrNorm = bookAbbr.replace(/\.$/, '').trim();
        const fullBookName = mapBookAbbreviation(abbrNorm);
        // Normalize spaces around hyphens and commas in verses
        let verses = (versesRaw || '').replace(/[–—−]/g, '-');
        verses = verses.replace(/\s*-\s*/g, '-');
        verses = verses.replace(/,\s*/g, ', ');
        
        console.log('ReadingContent - Matched book reference:', {
          original: part,
          bookAbbr: abbrNorm,
          fullBookName,
          chapter,
          verses
        });
        
        if (fullBookName) {
          // Detect cross-chapter range like "21 - 19, 1". Avoid matching within-chapter lists like "3-9, 12".
          // Use the raw verses string for detection and require no dot separators in the same part.
          const raw = (versesRaw || '').trim();
          // Require spaces around hyphen in the raw string to denote cross-chapter (e.g., "21 - 19, 1")
          const crossStrict = /^(\d+)\s+-\s+(\d+)\s*,\s*(\d+)$/.exec(raw);
          const hasDotSeparator = raw.includes('.');
          if (crossStrict && !hasDotSeparator) {
            const startV = parseInt(crossStrict[1]);
            const nextChap = parseInt(crossStrict[2]);
            const nextV = parseInt(crossStrict[3]);
            // Push open-ended range for current chapter, and explicit verse for next chapter
            allReferences.push({ book: fullBookName, chapter: parseInt(chapter), verses: `${startV}-` });
            allReferences.push({ book: fullBookName, chapter: nextChap, verses: `${nextV}` });
          } else {
            allReferences.push({
              book: fullBookName,
              chapter: parseInt(chapter),
              verses: verses.trim()
            });
          }
        }
      } else {
        // Handle cases like "2, 1-3" (continuation of previous book)
        const continuationMatch = part.match(/^(\d+)[,:]\s*(.+)$/);
        if (continuationMatch && allReferences.length > 0) {
          const [, chapter, verses] = continuationMatch;
          const previousRef = allReferences[allReferences.length - 1];
          allReferences.push({
            book: previousRef.book,
            chapter: parseInt(chapter),
            verses: verses.trim()
          });
          
          console.log('ReadingContent - Added continuation reference:', {
            book: previousRef.book,
            chapter: parseInt(chapter),
            verses: verses.trim()
          });
        } else {
          console.warn('ReadingContent - Could not parse reference part:', part);
        }
      }
    }
    
    console.log('ReadingContent - Final parsed references:', allReferences);
    return allReferences.length > 0 ? allReferences : null;
  };

  // Build a cleaned display reference string; for psalms remove (R: ..) and alt numbering
  const formatReferenceForDisplay = (originalRef) => {
    if (!originalRef) return '';
    if (reading.type === 'psalm') {
      let ref = originalRef;
      // Remove response and parentheses numbering after Ps N (keep main psalm number)
      ref = ref.replace(/\s*\(R:[^)]*\)/, '');
      ref = ref.replace(/^(Ps\s+\d+)\s*\([^)]*\)/, '$1');
      // Normalize dashes and spaces
      ref = ref.replace(/[–—−]/g, '-');
      // Replace " u. " with ". " and collapse spaces
      ref = ref.replace(/\su\.\s*/g, '.');
      // Remove letter suffixes from verse numbers (e.g., 3a -> 3)
      // but only in the verse-list part after the comma
      ref = ref.replace(/(,\s*)([^,]+)/, (m, p1, p2) => p1 + p2.replace(/[a-zA-Z]/g, ''));
      // Tidy multiple dots
      ref = ref.replace(/\.{2,}/g, '.');
      return ref.trim();
    }
    // Non-psalm: leave as-is (already human friendly from API)
    return originalRef;
  };

  // Map book abbreviations to full names
  const mapBookAbbreviation = (abbr) => {
    const bookMappings = {
      'Gen': 'Genesis', 'Ex': 'Exodus', 'Lev': 'Levitikus', 'Num': 'Numeri', 'Dtn': 'Deuteronomium',
      'Jos': 'Josua', 'Ri': 'Richter', 'Rut': 'Rut', '1 Sam': '1. Samuel', '2 Sam': '2. Samuel',
      '1 Kön': '1. Könige', '2 Kön': '2. Könige', '1 Chr': '1. Chronik', '2 Chr': '2. Chronik',
      'Esra': 'Esra', 'Neh': 'Nehemia', 'Tob': 'Tobit', 'Jdt': 'Judit', 'Est': 'Ester',
      '1 Makk': '1. Makkabäer', '2 Makk': '2. Makkabäer', 'Ijob': 'Ijob', 'Ps': 'Psalmen',
      'Spr': 'Sprichwörter', 'Koh': 'Kohelet', 'Hld': 'Hoheslied', 'Weish': 'Weisheit',
      'Sir': 'Jesus Sirach', 'Jes': 'Jesaja', 'Jer': 'Jeremia', 'Klgl': 'Klagelieder',
      'Bar': 'Baruch', 'Ez': 'Ezechiel', 'Dan': 'Daniel', 'Hos': 'Hosea', 'Joel': 'Joel',
      'Am': 'Amos', 'Obd': 'Obadja', 'Jona': 'Jona', 'Mi': 'Micha', 'Nah': 'Nahum',
      'Hab': 'Habakuk', 'Zef': 'Zefanja', 'Hag': 'Haggai', 'Sach': 'Sacharja', 'Mal': 'Maleachi',
      'Mt': 'Matthäus', 'Mk': 'Markus', 'Lk': 'Lukas', 'Joh': 'Johannes', 'Apg': 'Apostelgeschichte',
      'Röm': 'Römer', '1 Kor': '1. Korinther', '2 Kor': '2. Korinther', 'Gal': 'Galater',
      'Eph': 'Epheser', 'Phil': 'Philipper', 'Kol': 'Kolosser', '1 Thess': '1. Thessalonicher',
      '2 Thess': '2. Thessalonicher', '1 Tim': '1. Timotheus', '2 Tim': '2. Timotheus',
      'Tit': 'Titus', 'Phlm': 'Philemon', 'Hebr': 'Hebräer', 'Jak': 'Jakobus',
      '1 Petr': '1. Petrus', '2 Petr': '2. Petrus', '1 Joh': '1. Johannes', '2 Joh': '2. Johannes',
      '3 Joh': '3. Johannes', 'Jud': 'Judas', 'Offb': 'Offenbarung'
    };
    
    return bookMappings[abbr] || abbr;
  };

  // Fetch verses for multiple references
  const fetchVersesForReading = async (references) => {
    if (!references || references.length === 0) return [];
    
    const translations = [
      { name: 'Allioli-Arndt', table: 'bibelverse' },
      { name: 'Schöningh', table: 'bibelverse_schoenigh' },
      { name: 'Einheitsübersetzung', table: 'bibelverse_einheit' }
    ];
    
    const currentTranslation = translations.find(t => t.name === selectedTranslation);
    const tableName = currentTranslation?.table || 'bibelverse';
    
    console.log('Using translation:', selectedTranslation, 'table:', tableName);
    
    let allVerses = [];
    
    for (const ref of references) {
      const databaseBookName = getDatabaseBookName(ref.book, tableName);
      console.log('Book mapping:', ref.book, '->', databaseBookName);
      
      if (!databaseBookName) {
        console.warn('No database book name found for:', ref.book);
        continue;
      }
      
      try {
        // Parse verse range - handle complex cases like "1-3a.3b-4.5.6"
        const verseRanges = ref.verses.split('.');
        let refVerses = [];
        
        console.log('Parsing verse ranges for:', ref.book, ref.chapter, ref.verses);
        console.log('Verse ranges:', verseRanges);
        
    for (const range of verseRanges) {
          let trimmedRange = range.trim();
          
          // Remove letters from verse references (e.g., "3a" becomes "3", "3b-4" becomes "3-4")
          trimmedRange = trimmedRange.replace(/[a-zA-Z]/g, '');
          
          // Skip empty ranges
          if (!trimmedRange || trimmedRange === '') continue;
          
          let startVerse = 1, endVerse = null;
          
          if (trimmedRange.includes('-')) {
      const verseParts = trimmedRange.split('-');
      startVerse = parseInt(verseParts[0].trim());
      const rhs = (verseParts[1] || '').trim();
      endVerse = rhs === '' ? null : parseInt(rhs);
          } else {
            startVerse = parseInt(trimmedRange);
            endVerse = startVerse;
          }
          
          console.log('Processed range:', range, '->', trimmedRange, 'verses:', startVerse, 'to', endVerse);
          
          console.log('Query params:', {
            table: tableName,
            book: databaseBookName,
            chapter: ref.chapter,
            startVerse,
            endVerse,
            hasTestament: tableName === 'bibelverse_schoenigh' || tableName === 'bibelverse_einheit'
          });
          
          if (startVerse && !isNaN(startVerse)) {
            let query = supabase
              .from(tableName)
              .select('*')
              .eq('buch', databaseBookName)
              .eq('kapitel', ref.chapter)
              .gte('vers', startVerse);
            if (endVerse !== null && !isNaN(endVerse)) {
              query = query.lte('vers', endVerse);
            }
            
            // Add testament filter for tables that have it (Schöningh und Einheitsübersetzung)
            if (tableName === 'bibelverse_schoenigh' || tableName === 'bibelverse_einheit') {
              const newTestamentAbbr = new Set([
                'Mt','Mk','Lk','Joh','Apg','Röm','1Kor','2Kor','Gal','Eph','Phil','Kol',
                '1Thess','2Thess','1Tim','2Tim','Tit','Phlm','Hebr','Jak','1Petr','2Petr',
                '1Joh','2Joh','3Joh','Jud','Offb'
              ]);
              const newTestamentFullNames = new Set([
                'Matthäusevangelium','Markusevangelium','Lukasevangelium','Johannesevangelium','Apostelgeschichte',
                'Römerbrief','1. Korintherbrief','2. Korintherbrief','Galaterbrief','Epheserbrief','Philipperbrief',
                'Kolosserbrief','1. Thessalonicherbrief','2. Thessalonicherbrief','1. Timotheusbrief','2. Timotheusbrief',
                'Titusbrief','Philemonbrief','Hebräerbrief','Jakobusbrief','1. Petrusbrief','2. Petrusbrief',
                '1. Johannesbrief','2. Johannesbrief','3. Johannesbrief','Judasbrief','Offenbarung des Johannes'
              ]);
              const isNewTestament = newTestamentAbbr.has(databaseBookName) || newTestamentFullNames.has(databaseBookName);
              query = query.eq('testament', isNewTestament ? 'NT' : 'OT');
            }
            
            let { data, error } = await query.order('vers');
            
            // Allioli uses old psalm numbering; if we query Die Psalmen 66 v16+ and get empty, try previous psalm (65)
            if (
              (!error && (!data || data.length === 0)) &&
              tableName === 'bibelverse' &&
              databaseBookName === 'Die Psalmen' &&
              typeof ref.chapter === 'number' &&
              (startVerse >= 16 || endVerse >= 16)
            ) {
              console.log('No results for Psalmen', ref.chapter, 'trying old numbering (chapter - 1)');
              let altQuery = supabase
                .from(tableName)
                .select('*')
                .eq('buch', databaseBookName)
                .eq('kapitel', ref.chapter - 1)
                .gte('vers', startVerse);
              if (endVerse !== null && !isNaN(endVerse)) {
                altQuery = altQuery.lte('vers', endVerse);
              }
              const altRes = await altQuery.order('vers');
              data = altRes.data;
              error = altRes.error;
            }
            
            console.log('Query result:', { 
              dataLength: data?.length, 
              error,
              firstVerse: data?.[0]?.vers,
              lastVerse: data?.[data && data.length ? data.length - 1 : 0]?.vers
            });
            
            if (!error && data) {
              refVerses = [...refVerses, ...data];
            } else if (error) {
              console.error('Supabase query error:', error);
            }
          } else {
            console.warn('Invalid verse numbers:', { startVerse, endVerse });
          }
        }
        
        // Remove duplicates and sort
        const uniqueVerses = refVerses.filter((verse, index, self) => 
          index === self.findIndex(v => v.vers === verse.vers)
        ).sort((a, b) => a.vers - b.vers);

        console.log('Final verses for', ref.book, ':', uniqueVerses.length, 'verses');
        
        // Add chapter info to verses for display
        const versesWithChapter = uniqueVerses.map(verse => ({
          ...verse,
          displayChapter: ref.chapter,
          displayBook: ref.book
        }));
        
        allVerses = [...allVerses, ...versesWithChapter];
      } catch (error) {
        console.error('Error fetching verses for reference:', ref, error);
      }
    }
    
    return allVerses;
  };

  useEffect(() => {
    let isActive = true;
    const loadVerses = async () => {
      setLoading(true);
      try {
        if (!reading.reference || reading.reference.trim() === '') {
          if (isActive) {
            setVerses([]);
            setDisplayRef('');
          }
          return;
        }

        // Prepare display reference string (esp. for Psalmen)
        if (isActive) setDisplayRef(formatReferenceForDisplay(reading.reference));

        const references = parseBibleReference(reading.reference);
        if (references) {
          const fetchedVerses = await fetchVersesForReading(references);
          if (isActive) setVerses(fetchedVerses);
        } else {
          if (isActive) setVerses([]);
        }
      } catch (e) {
        console.error('ReadingContent - loadVerses error:', e);
        if (isActive) setVerses([]);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    loadVerses();
    return () => { isActive = false; };
  }, [reading, selectedTranslation]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Lade {reading.title}...
        </Text>
      </View>
    );
  }

  if (!reading.reference || reading.reference.trim() === '') {
    return (
      <View style={styles.noVersesContainer}>
        <Ionicons name="book-outline" size={40} color={colors.cardBackground} />
        <Text style={[styles.noVersesText, { color: colors.textSecondary }]}>
          Für diese Lesung ist keine Bibelstelle verfügbar
        </Text>
      </View>
    );
  }

  if (verses.length === 0) {
    return (
      <View style={styles.noVersesContainer}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.cardBackground} />
        <Text style={[styles.noVersesText, { color: colors.textSecondary }]}>
          Bibeltext für "{reading.reference}" konnte nicht gefunden werden
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.readingContentSection}>
      {/* Reference Header */}
      <View style={[styles.referenceHeader, { backgroundColor: colors.cardBackground }]}>
        <Text style={[styles.referenceText, { color: colors.primary }]}>
          {displayRef || reading.reference}
        </Text>
      </View>

      {/* Verses rendered like BibelContentScreen with numbers */}
      <View style={[styles.versesTextContainer, { backgroundColor: colors.cardBackground }]}>
        {verses.map((verse) => (
          <View key={verse.id} style={{ flexDirection: 'row', marginBottom: 12, alignItems: 'flex-start' }}>
            <Text style={[styles.verseNumber, { color: colors.primary }]}>
              {verse.vers}
            </Text>
            <Text style={[styles.versesText, { color: colors.text }]}>
              {String(verse.text || '').replace(/\//g, '').trim()}
            </Text>
          </View>
        ))}
      </View>
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
  headerBackground: {
    backgroundColor: '#000', // will be overridden by dynamic color
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
  flex: 1,
  fontSize: normalize(18),
  fontFamily: 'Montserrat_600SemiBold',
  fontWeight: '600',
  textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  dateCard: {
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
    alignItems: 'center',
  },
  dateTitle: {
    fontSize: normalize(18),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  dateSubtitle: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
  },
  translationSection: {
    marginBottom: 20,
  },
  translationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 25,
    marginBottom: 10,
  },
  translationText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_500Medium',
    marginRight: 10,
    flex: 1,
  },
  translationDropdown: {
    marginHorizontal: 20,
    marginTop: 5,
    borderRadius: 15,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  translationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 10,
    marginVertical: 2,
  },
  translationOptionText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_500Medium',
    fontWeight: '500',
  },
  readingsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: normalize(18),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    marginBottom: 15,
  },
  readingButtonsScroll: {
    marginBottom: 10,
  },
  readingButtonsContainer: {
  paddingHorizontal: 5,
  gap: 8,
  },
  readingButton: {
  paddingHorizontal: 16,
  paddingVertical: 10,
  borderRadius: 20,
  minWidth: 110,
  alignItems: 'center',
  marginRight: 6,
  },
  readingButtonText: {
    fontSize: normalize(13),
    fontFamily: 'Montserrat_500Medium',
    fontWeight: '500',
    textAlign: 'center',
  },
  readingContentSection: {
    marginTop: 10,
  },
  referenceHeader: {
    padding: 15,
    borderRadius: 15,
    marginBottom: 15,
  },
  referenceText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    textAlign: 'center',
  },
  versesTextContainer: {
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
  },
  versesText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    lineHeight: normalize(24),
    flex: 1,
  },
  verseNumber: {
    fontSize: normalize(12),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    marginRight: 8,
    marginTop: 2,
    minWidth: 25,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
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
  noVersesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  noVersesText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default TageslesungenScreen;
