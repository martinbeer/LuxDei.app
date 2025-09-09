import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  TouchableOpacity, 
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Animated 
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

// Scrolling Text Component für lange Titel (Marquee-Effekt)
const ScrollingText = ({ text, style, maxWidth }) => {
  const { colors } = useTheme();
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [textWidth, setTextWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(maxWidth || width * 0.8);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    if (measured && textWidth > 0 && containerWidth > 0) {
      if (textWidth > containerWidth) {
        setShouldScroll(true);
        
        // Marquee-Effekt: Text läuft von rechts nach links
        const totalDistance = textWidth + containerWidth; // Gesamter Scrollweg
        
        const scrollAnimation = Animated.loop(
          Animated.sequence([
            // Starte mit Text rechts außerhalb des Containers
            Animated.timing(animatedValue, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
            // Pause bevor Animation startet
            Animated.delay(1000),
            // Bewege Text von rechts nach links bis er komplett verschwunden ist
            Animated.timing(animatedValue, {
              toValue: -totalDistance,
              duration: totalDistance * 30, // Geschwindigkeit anpassen
              useNativeDriver: true,
            }),
            // Kurze Pause bevor von vorne begonnen wird
            Animated.delay(500),
          ])
        );
        
        // Setze Startposition: Text komplett rechts außerhalb
        animatedValue.setValue(containerWidth);
        scrollAnimation.start();
        
        return () => scrollAnimation.stop();
      } else {
        setShouldScroll(false);
        animatedValue.setValue(0);
      }
    }
  }, [textWidth, containerWidth, measured]);

  const handleTextLayout = (event) => {
    if (!measured) {
      setTextWidth(event.nativeEvent.layout.width);
      setMeasured(true);
    }
  };

  const handleContainerLayout = (event) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0) {
      setContainerWidth(width);
    }
  };

  // Wenn der Text in den Container passt, zeige ihn normal an
  if (!shouldScroll && measured) {
    return (
      <Text
        style={style}
        onLayout={handleTextLayout}
        numberOfLines={1}
      >
        {text}
      </Text>
    );
  }

  // Wenn der Text zu lang ist, verwende Marquee-Effekt
  return (
    <View 
      style={[{ width: containerWidth, overflow: 'hidden', height: style?.fontSize ? style.fontSize * 1.2 : 20 }]}
      onLayout={handleContainerLayout}
    >
      <Animated.Text
        style={[
          style,
          {
            position: 'absolute',
            left: 0,
            top: 0,
            transform: [{ translateX: animatedValue }],
            minWidth: textWidth,
          }
        ]}
        onLayout={handleTextLayout}
        numberOfLines={1}
      >
        {text}
      </Animated.Text>
    </View>
  );
};

const KirchenvaterDetailScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const { kirchenvater } = route.params; // { id?, name }
  const [werke, setWerke] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authorId, setAuthorId] = useState(null);

  useEffect(() => {
    loadWerke();
  }, []);

  const loadWerke = async () => {
    try {
      setLoading(true);

      // 1) Author-ID anhand des Namens holen
      const { data: authorRow, error: authorError } = await supabase
        .from('authors')
        .select('id, name')
        .eq('name', kirchenvater.name)
        .single();

      if (authorError) {
        console.error('Fehler beim Laden des Autors:', authorError);
        setWerke([]);
        return;
      }

      setAuthorId(authorRow.id);

      // 2) Werke dieses Autors laden
      const { data: worksData, error: worksError } = await supabase
        .from('works')
        .select('id, german_title, latin_title, translation_type')
        .eq('author_id', authorRow.id)
        .order('german_title', { ascending: true });

      if (worksError) {
        console.error('Fehler beim Laden der Werke:', worksError);
        setWerke([]);
        return;
      }

      const mapped = (worksData || []).map(w => ({
        id: w.id,
        title: w.german_title || w.latin_title || 'Unbenanntes Werk',
        translation_type: w.translation_type || null,
      }));

      // Falls deutsche Titel fehlen, zusätzlich alphabetisch nach fallback sortieren
      mapped.sort((a, b) => a.title.localeCompare(b.title, 'de'));
      setWerke(mapped);
    } catch (error) {
      console.error('Fehler beim Laden der Werke:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleWorkPress = (work) => {
    // Direkt zum ersten Kapitel navigieren
    navigation.navigate('KirchenvaterText', {
      kirchenvater: kirchenvater.name,
      authorId: authorId,
      workId: work.id,
      workTitle: work.title,
      chapter: 1,
    });
  };

  // Render Grid für Werke (ohne Titel)
  const renderWorksGrid = () => (
    <View style={styles.worksSection}>
      <View style={styles.worksList}>
        {werke.map((work) => (
          <TouchableOpacity
            key={work.id}
            style={[
              styles.workButton,
              { backgroundColor: colors.cardBackground }
            ]}
            onPress={() => handleWorkPress(work)}
          >
            <ScrollingText
              text={work.title}
              style={[
                styles.workText, 
                { color: colors.primary }
              ]}
              maxWidth={width * 0.8}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // Render Abschnitte Liste
  const renderSectionsSection = () => (
    selectedWork && (
      <View style={styles.sectionsSection}>
        <Text style={[styles.sectionTitle, { color: colors.primary }]}>
          Abschnitte: {selectedWork.title}
        </Text>
        {loadingSections ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Lade Abschnitte...
            </Text>
          </View>
        ) : (
          <View style={styles.sectionsList}>
            {sections.map((section) => (
              <TouchableOpacity
                key={`${section.section}`}
                style={[styles.sectionItem, { backgroundColor: colors.cardBackground }]}
                onPress={() => handleSectionPress(section)}
              >
                <View style={styles.sectionContent}>
                  <Text style={[styles.sectionNumber, { color: colors.primary }]}>
                    Abschnitt {section.section}
                  </Text>
                  <Text style={[styles.sectionPreview, { color: colors.textSecondary }]} numberOfLines={2}>
                    {section.text.substring(0, 100)}...
                  </Text>
                  <Text style={[styles.wordCount, { color: colors.textSecondary }]}>
                    {section.word_count} Wörter
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    )
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Lade Werke...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      
      {/* Header */}
      <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.white} />
            </TouchableOpacity>
            <ScrollingText
              text={kirchenvater.name}
              style={[styles.headerTitle, { color: colors.white }]}
              maxWidth={width * 0.6}
            />
            <View style={styles.placeholder} />
          </View>
        </SafeAreaView>
      </View>

      {/* Scrollable Content */}
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {renderWorksGrid()}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBackground: {
    paddingTop: 0,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  headerSafeArea: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: normalize(15),
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: normalize(20),
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  placeholder: {
    width: 34,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 100,
    paddingTop: 30,
  },
  worksSection: {
    marginBottom: 30,
  },
  sectionsSection: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: normalize(20),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    marginBottom: 15,
    marginTop: 20,
  },
  worksGrid: {
    flexDirection: 'column',
  },
  worksList: {
    flexDirection: 'column',
  },
  workButton: {
    width: '100%',
    padding: normalize(15),
    borderRadius: 50,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  workText: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_500Medium',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 18,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    marginTop: 10,
  },
  sectionsList: {
    marginTop: 10,
  },
  sectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  sectionContent: {
    flex: 1,
  },
  sectionNumber: {
    fontSize: normalize(16),
    fontWeight: '600',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 4,
  },
  sectionPreview: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_400Regular',
    lineHeight: 18,
    marginBottom: 4,
  },
  wordCount: {
    fontSize: normalize(12),
    fontFamily: 'Montserrat_400Regular',
    fontStyle: 'italic',
  },
});

export default KirchenvaterDetailScreen;
