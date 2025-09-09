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
  const { kirchenvater, authorId, workId, workTitle, chapter: initialChapter = 1 } = route.params;

  const [currentChapter, setCurrentChapter] = useState(initialChapter || 1);
  const [verses, setVerses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [maxChapter, setMaxChapter] = useState(1);
  
  // Ref für ScrollView
  const scrollViewRef = useRef(null);
  const sectionRefs = useRef(new Map());

  useEffect(() => {
    fetchChapterData();
  }, [authorId, workId, currentChapter]);

  const fetchChapterData = async () => {
    try {
      setLoading(true);

      // 1) Max Chapter ermitteln
      if (maxChapter === 1) {
        const { data: maxChapRow, error: maxErr } = await supabase
          .from('chapters')
          .select('chapter_number')
          .eq('work_id', workId)
          .order('chapter_number', { ascending: false })
          .limit(1);
        if (maxErr) {
          console.error('Error fetching max chapter:', maxErr);
        } else if (maxChapRow && maxChapRow.length > 0) {
          setMaxChapter(maxChapRow[0].chapter_number);
        }
      }

      // 2) Kapitel-ID anhand Nummer holen
      const { data: chapterRow, error: chapErr } = await supabase
        .from('chapters')
        .select('id')
        .eq('work_id', workId)
        .eq('chapter_number', currentChapter)
        .single();

      if (chapErr) {
        console.error('Error fetching chapter id:', chapErr);
        setVerses([]);
        setLoading(false);
        return;
      }

      // 3) Verse dieses Kapitels laden
      const { data: versesData, error: versesErr } = await supabase
        .from('verses')
        .select('verse_number, text')
        .eq('chapter_id', chapterRow.id)
        .order('position', { ascending: true });

      if (versesErr) {
        console.error('Error fetching verses:', versesErr);
        setVerses([]);
      } else {
        setVerses(versesData || []);
      }
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Fehler', `Daten konnten nicht geladen werden: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePreviousChapter = () => {
    if (currentChapter > 1) {
      setCurrentChapter((c) => c - 1);
    }
  };

  const handleNextChapter = () => {
    if (currentChapter < maxChapter) {
      setCurrentChapter((c) => c + 1);
    }
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
        {workTitle} - Kapitel {currentChapter}
            </Text>
          </View>
          
          <View style={styles.headerRight} />
        </View>

        {/* Section Navigation */}
        <View style={[styles.sectionNav, { backgroundColor: colors.cardBackground }]}>
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

          <View style={styles.sectionInfo}>
            <Text style={[styles.sectionNavText, { color: colors.primary }]}>
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
            {verses.length > 0 ? (
              verses.map((v) => (
                <View key={`v-${v.verse_number}`} style={[styles.sectionContainer, { backgroundColor: colors.cardBackground }]}>
                  <Text style={[styles.sectionText, { color: colors.text }]}>[{v.verse_number}] {v.text}</Text>
                </View>
              ))
            ) : (
              <View style={styles.noDataContainer}>
                <Ionicons name="document-text-outline" size={60} color={colors.cardBackground} />
                <Text style={[styles.noDataText, { color: colors.textSecondary }]}>
                  Kein Text für dieses Kapitel gefunden
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
