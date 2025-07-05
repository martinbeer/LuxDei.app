import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert } from 'react-native';
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

  const translations = [
    { name: 'Allioli-Arndt', table: 'bibelverse' },
    { name: 'Schöningh', table: 'bibelverse_schoenigh' },
    { name: 'Einheitsübersetzung', table: 'bibelverse_einheit' }
  ];

  // Fetch liturgical data from API
  const fetchLiturgicalData = async () => {
    try {
      const response = await fetch(`https://www.eucharistiefeier.de/lk/api.php?format=json&tag=0&info=wtbem&mg=0`);
      const data = await response.json();
      
      console.log('API Response for readings:', data);
      
      if (data.Zelebrationen && Object.keys(data.Zelebrationen).length > 0) {
        const celebrations = Object.values(data.Zelebrationen);
        const lastCelebration = celebrations[celebrations.length - 1];
        
        setLiturgicalData(lastCelebration);
        parseReadings(lastCelebration);
      }
    } catch (error) {
      console.error('Error fetching liturgical data:', error);
      Alert.alert('Fehler', 'Konnte liturgische Daten nicht laden');
    } finally {
      setLoading(false);
    }
  };

  // Parse readings from liturgical data
  const parseReadings = (data) => {
    const readingTypes = [];
    
    if (data.L1) {
      readingTypes.push({
        id: 'L1',
        title: 'Erste Lesung',
        reference: data.L1,
        type: 'reading'
      });
    }
    
    if (data.AP) {
      readingTypes.push({
        id: 'AP',
        title: 'Antwortpsalm',
        reference: data.AP,
        type: 'psalm'
      });
    }
    
    if (data.L2) {
      readingTypes.push({
        id: 'L2',
        title: 'Zweite Lesung',
        reference: data.L2,
        type: 'reading'
      });
    }
    
    if (data.EV) {
      readingTypes.push({
        id: 'EV',
        title: 'Evangelium',
        reference: data.EV,
        type: 'gospel'
      });
    }
    
    setReadings(readingTypes);
  };

  // Parse bible reference (e.g. "Mt 5,1-12" -> book: "Matthäus", chapter: 5, verses: "1-12")
  const parseBibleReference = (reference) => {
    if (!reference) return null;
    
    // Remove common prefixes and clean up
    const cleaned = reference.replace(/^(Lesung aus|Evangelium nach|Psalm)\s+/i, '').trim();
    
    // Try to match book chapter,verse pattern
    const match = cleaned.match(/^(.+?)\s+(\d+)[,:]\s*(.+)$/);
    if (!match) return null;
    
    const [, bookAbbr, chapter, verses] = match;
    
    // Map common abbreviations to full book names
    const bookMappings = {
      'Mt': 'Matthäus',
      'Mk': 'Markus', 
      'Lk': 'Lukas',
      'Joh': 'Johannes',
      'Apg': 'Apostelgeschichte',
      'Röm': 'Römer',
      '1 Kor': '1. Korinther',
      '2 Kor': '2. Korinther',
      'Gal': 'Galater',
      'Eph': 'Epheser',
      'Phil': 'Philipper',
      'Kol': 'Kolosser',
      '1 Thess': '1. Thessalonicher',
      '2 Thess': '2. Thessalonicher',
      '1 Tim': '1. Timotheus',
      '2 Tim': '2. Timotheus',
      'Tit': 'Titus',
      'Phlm': 'Philemon',
      'Hebr': 'Hebräer',
      'Jak': 'Jakobus',
      '1 Petr': '1. Petrus',
      '2 Petr': '2. Petrus',
      '1 Joh': '1. Johannes',
      '2 Joh': '2. Johannes',
      '3 Joh': '3. Johannes',
      'Jud': 'Judas',
      'Offb': 'Offenbarung',
      'Gen': 'Genesis',
      'Ex': 'Exodus',
      'Lev': 'Levitikus',
      'Num': 'Numeri',
      'Dtn': 'Deuteronomium',
      'Jos': 'Josua',
      'Ri': 'Richter',
      'Rut': 'Rut',
      '1 Sam': '1. Samuel',
      '2 Sam': '2. Samuel',
      '1 Kön': '1. Könige',
      '2 Kön': '2. Könige',
      '1 Chr': '1. Chronik',
      '2 Chr': '2. Chronik',
      'Esra': 'Esra',
      'Neh': 'Nehemia',
      'Tob': 'Tobit',
      'Jdt': 'Judit',
      'Est': 'Ester',
      '1 Makk': '1. Makkabäer',
      '2 Makk': '2. Makkabäer',
      'Ijob': 'Ijob',
      'Ps': 'Psalmen',
      'Spr': 'Sprichwörter',
      'Koh': 'Kohelet',
      'Hld': 'Hoheslied',
      'Weish': 'Weisheit',
      'Sir': 'Jesus Sirach',
      'Jes': 'Jesaja',
      'Jer': 'Jeremia',
      'Klgl': 'Klagelieder',
      'Bar': 'Baruch',
      'Ez': 'Ezechiel',
      'Dan': 'Daniel',
      'Hos': 'Hosea',
      'Joel': 'Joel',
      'Am': 'Amos',
      'Obd': 'Obadja',
      'Jona': 'Jona',
      'Mi': 'Micha',
      'Nah': 'Nahum',
      'Hab': 'Habakuk',
      'Zef': 'Zefanja',
      'Hag': 'Haggai',
      'Sach': 'Sacharja',
      'Mal': 'Maleachi'
    };
    
    const fullBookName = bookMappings[bookAbbr] || bookAbbr;
    
    return {
      book: fullBookName,
      chapter: parseInt(chapter),
      verses: verses
    };
  };

  // Handle reading selection
  const handleReadingPress = async (reading) => {
    const parsed = parseBibleReference(reading.reference);
    if (!parsed) {
      Alert.alert('Fehler', 'Konnte Bibelstelle nicht analysieren');
      return;
    }

    const currentTranslation = translations.find(t => t.name === selectedTranslation);
    const databaseBookName = getDatabaseBookName(parsed.book, currentTranslation?.table || 'bibelverse');
    
    // Extract verse numbers for highlighting
    let highlightVerse = null;
    const verseMatch = parsed.verses.match(/^(\d+)/);
    if (verseMatch) {
      highlightVerse = parseInt(verseMatch[1]);
    }

    navigation.navigate('BibelContent', {
      bookName: databaseBookName,
      displayName: parsed.book,
      translationTable: currentTranslation?.table || 'bibelverse',
      initialChapter: parsed.chapter,
      highlightVerse: highlightVerse
    });
  };

  // Handle translation selection
  const handleTranslationSelect = (translation) => {
    setSelectedTranslation(translation.name);
    setShowTranslationDropdown(false);
  };

  useEffect(() => {
    fetchLiturgicalData();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <SafeAreaView style={styles.safeArea}>
          <View style={[styles.header, { backgroundColor: colors.primary }]}>
            <TouchableOpacity 
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color={colors.white} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.white }]}>Tageslesungen</Text>
            <View style={styles.headerRight} />
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Lade Tageslesungen...
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

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
          <Text style={[styles.headerTitle, { color: colors.white }]}>Tageslesungen</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Translation Dropdown */}
        <View style={[styles.translationContainer, { backgroundColor: colors.cardBackground }]}>
          <TouchableOpacity
            style={[styles.translationSelector, { backgroundColor: colors.cardBackground }]}
            onPress={() => setShowTranslationDropdown(!showTranslationDropdown)}
          >
            <Text style={[styles.translationText, { color: colors.primary }]}>{selectedTranslation}</Text>
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
                    selectedTranslation === translation.name && { backgroundColor: colors.primary + '20' }
                  ]}
                  onPress={() => handleTranslationSelect(translation)}
                >
                  <Text style={[
                    styles.translationOptionText,
                    { color: colors.primary },
                    selectedTranslation === translation.name && { fontWeight: '600' }
                  ]}>
                    {translation.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Content */}
        <ScrollView 
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
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

          {readings.length > 0 ? (
            <View style={styles.readingsContainer}>
              {readings.map((reading, index) => (
                <TouchableOpacity
                  key={reading.id}
                  style={[styles.readingItem, { backgroundColor: colors.cardBackground }]}
                  onPress={() => handleReadingPress(reading)}
                >
                  <View style={styles.readingHeader}>
                    <Text style={[styles.readingTitle, { color: colors.primary }]}>
                      {reading.title}
                    </Text>
                    <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                  </View>
                  <Text style={[styles.readingReference, { color: colors.textSecondary }]}>
                    {reading.reference}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.noDataContainer}>
              <Ionicons name="book-outline" size={60} color={colors.cardBackground} />
              <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
                Keine Lesungen für heute verfügbar
              </Text>
            </View>
          )}
        </ScrollView>
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
    fontSize: normalize(18),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  translationContainer: {
    marginHorizontal: 20,
    marginTop: 15,
    borderRadius: 15,
    overflow: 'hidden',
  },
  translationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  translationText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_500Medium',
    fontWeight: '500',
  },
  translationDropdown: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  translationOption: {
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  translationOptionText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
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
  readingsContainer: {
    marginTop: 10,
  },
  readingItem: {
    padding: 18,
    borderRadius: 15,
    marginBottom: 15,
  },
  readingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  readingTitle: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
  },
  readingReference: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_400Regular',
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

export default TageslesungenScreen;
