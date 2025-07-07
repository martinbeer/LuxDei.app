import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  TouchableOpacity, 
  Dimensions,
  ActivityIndicator,
  Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const scale = width / 320;

const normalize = (size) => {
  return Math.round(size * scale);
};

const KirchenvaterTextScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const { kirchenvater, work, section: initialSection, text: initialText } = route.params;
  
  const [currentSection, setCurrentSection] = useState(initialSection || 1);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [maxSection, setMaxSection] = useState(1);
  const [highlightedSection, setHighlightedSection] = useState(initialSection || null);
  
  // Cache für Abschnitte
  const [sectionCache, setSectionCache] = useState(new Map());
  const [prefetchingSections, setPrefetchingSections] = useState(new Set());
  
  // Ref für ScrollView
  const scrollViewRef = useRef(null);
  const sectionRefs = useRef(new Map());

  useEffect(() => {
    fetchSectionData();
  }, [kirchenvater, work, currentSection]);

  // Name-Mapping für Datenbank-Konsistenz
  const getDatabaseAuthorName = (displayName) => {
    const nameMapping = {
      'Augustinus von Alexandria': 'Augustinus von Hippo',
      // Weitere Mappings können hier hinzugefügt werden
    };
    return nameMapping[displayName] || displayName;
  };

  // Cache-Schlüssel generieren
  const getCacheKey = (author, workTitle, section) => `${author}_${workTitle}_${section}`;

  // Einzelnen Abschnitt laden
  const fetchSingleSection = async (author, workTitle, section) => {
    const cacheKey = getCacheKey(author, workTitle, section);
    
    if (sectionCache.has(cacheKey)) {
      return sectionCache.get(cacheKey);
    }

    if (prefetchingSections.has(cacheKey)) {
      return null;
    }

    try {
      setPrefetchingSections(prev => new Set(prev).add(cacheKey));
      
      const { data, error } = await supabase
        .from('kirchenvater')
        .select('*')
        .eq('author', author)
        .eq('work_title', workTitle)
        .eq('section', section)
        .single();

      if (error) {
        console.error(`Error fetching section ${section}:`, error);
        return null;
      }

      setSectionCache(prev => new Map(prev).set(cacheKey, data));
      return data;
    } catch (error) {
      console.error(`Error fetching section ${section}:`, error);
      return null;
    } finally {
      setPrefetchingSections(prev => {
        const newSet = new Set(prev);
        newSet.delete(cacheKey);
        return newSet;
      });
    }
  };

  // Angrenzende Abschnitte vorab laden
  const prefetchAdjacentSections = async (author, workTitle, section, maxSec) => {
    const prefetchPromises = [];
    
    // Vorherigen Abschnitt laden
    if (section > 1) {
      const prevSection = section - 1;
      const prevKey = getCacheKey(author, workTitle, prevSection);
      if (!sectionCache.has(prevKey) && !prefetchingSections.has(prevKey)) {
        prefetchPromises.push(fetchSingleSection(author, workTitle, prevSection));
      }
    }
    
    // Nächsten Abschnitt laden
    if (section < maxSec) {
      const nextSection = section + 1;
      const nextKey = getCacheKey(author, workTitle, nextSection);
      if (!sectionCache.has(nextKey) && !prefetchingSections.has(nextKey)) {
        prefetchPromises.push(fetchSingleSection(author, workTitle, nextSection));
      }
    }
    
    if (prefetchPromises.length > 0) {
      await Promise.all(prefetchPromises);
    }
  };

  const fetchSectionData = async () => {
    try {
      setLoading(true);
      
      const authorName = getDatabaseAuthorName(kirchenvater);
      const cacheKey = getCacheKey(authorName, work, currentSection);
      
      let currentSectionData = null;
      let maxSectionData = null;
      
      if (sectionCache.has(cacheKey)) {
        currentSectionData = sectionCache.get(cacheKey);
        setSections([currentSectionData]);
        setLoading(false);
      }

      // Max Section nur einmal laden
      if (maxSection === 1) {
        const { data, error: maxSectionError } = await supabase
          .from('kirchenvater')
          .select('section')
          .eq('author', authorName)
          .eq('work_title', work)
          .order('section', { ascending: false })
          .limit(1);

        if (maxSectionError) {
          console.error('Error fetching max section:', maxSectionError);
        } else if (data && data.length > 0) {
          maxSectionData = data;
          setMaxSection(data[0].section);
        }
      }

      // Aktuellen Abschnitt laden falls nicht im Cache
      if (!currentSectionData) {
        currentSectionData = await fetchSingleSection(authorName, work, currentSection);
        if (currentSectionData) {
          setSections([currentSectionData]);
        }
        setLoading(false);
      }

      // Angrenzende Abschnitte vorab laden
      const maxSec = maxSection > 1 ? maxSection : (maxSectionData?.[0]?.section || 1);
      setTimeout(() => {
        prefetchAdjacentSections(authorName, work, currentSection, maxSec);
      }, 100);

    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Fehler', `Daten konnten nicht geladen werden: ${error.message}`);
      setLoading(false);
    }
  };

  const handlePreviousSection = () => {
    if (currentSection > 1) {
      const newSection = currentSection - 1;
      setCurrentSection(newSection);
      setHighlightedSection(null);
    }
  };

  const handleNextSection = () => {
    if (currentSection < maxSection) {
      const newSection = currentSection + 1;
      setCurrentSection(newSection);
      setHighlightedSection(null);
    }
  };

  const renderSection = (sectionData) => {
    if (!sectionData) return null;
    
    const isHighlighted = highlightedSection && parseInt(sectionData.section) === parseInt(highlightedSection);
    
    return (
      <View 
        key={sectionData.section} 
        style={[
          styles.sectionContainer,
          { backgroundColor: colors.cardBackground },
          isHighlighted && { backgroundColor: colors.primary + '20', borderRadius: 8, padding: 8 }
        ]}
      >
        <Text style={[styles.sectionText, { color: colors.text }]}>
          {sectionData.text}
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
            <Text style={[styles.authorTitle, { color: colors.white }]}>
              {kirchenvater}
            </Text>
            <Text style={[styles.workTitle, { color: colors.white }]}>
              {work} - Abschnitt {currentSection}
            </Text>
          </View>
          
          <View style={styles.headerRight} />
        </View>

        {/* Section Navigation */}
        <View style={[styles.sectionNav, { backgroundColor: colors.cardBackground }]}>
          <TouchableOpacity
            onPress={handlePreviousSection}
            disabled={currentSection === 1}
            style={[
              styles.navButton,
              { backgroundColor: currentSection === 1 ? colors.background : colors.primary }
            ]}
          >
            <Ionicons 
              name="chevron-back" 
              size={20} 
              color={currentSection === 1 ? colors.textSecondary : colors.white} 
            />
          </TouchableOpacity>

          <View style={styles.sectionInfo}>
            <Text style={[styles.sectionNavText, { color: colors.primary }]}>
              Abschnitt {currentSection} von {maxSection}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleNextSection}
            disabled={currentSection === maxSection}
            style={[
              styles.navButton,
              { backgroundColor: currentSection === maxSection ? colors.background : colors.primary }
            ]}
          >
            <Ionicons 
              name="chevron-forward" 
              size={20} 
              color={currentSection === maxSection ? colors.textSecondary : colors.white} 
            />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Abschnitt wird geladen...
            </Text>
          </View>
        ) : (
          <ScrollView 
            ref={scrollViewRef}
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {sections.length > 0 ? (
              sections.map(renderSection)
            ) : (
              <View style={styles.noDataContainer}>
                <Ionicons name="document-text-outline" size={60} color={colors.cardBackground} />
                <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
                  Kein Text für diesen Abschnitt gefunden
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
  authorTitle: {
    fontSize: normalize(18),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    textAlign: 'center',
  },
  workTitle: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_400Regular',
    opacity: 0.9,
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  sectionNav: {
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
  sectionInfo: {
    flex: 1,
    alignItems: 'center',
  },
  sectionNavText: {
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
    paddingBottom: 100,
  },
  sectionContainer: {
    marginBottom: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    lineHeight: normalize(24),
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

export default KirchenvaterTextScreen;
