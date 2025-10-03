
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const scale = width / 320;
const normalize = (size) => Math.round(size * scale);

const ScrollingText = ({ text, style, maxWidth = width * 0.7 }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [textWidth, setTextWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(maxWidth);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    if (textWidth > containerWidth) {
      setShouldScroll(true);
      const distance = textWidth - containerWidth + 20;
      const animation = Animated.loop(
        Animated.sequence([
          Animated.delay(800),
          Animated.timing(animatedValue, {
            toValue: -distance,
            duration: distance * 25,
            useNativeDriver: true,
          }),
          Animated.delay(600),
          Animated.timing(animatedValue, {
            toValue: 0,
            duration: distance * 25,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
    setShouldScroll(false);
    animatedValue.setValue(0);
  }, [textWidth, containerWidth, animatedValue]);

  return (
    <View
      style={{ width: containerWidth, overflow: 'hidden' }}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      <Animated.Text
        style={[style, shouldScroll && { transform: [{ translateX: animatedValue }] }]}
        numberOfLines={1}
        onLayout={(event) => setTextWidth(event.nativeEvent.layout.width)}
      >
        {text}
      </Animated.Text>
    </View>
  );
};

const KirchenvaterDetailScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const { kirchenvater } = route.params;
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorks();
  }, []);

  const loadWorks = async () => {
    try {
      setLoading(true);
      let authorId = kirchenvater?.id || null;

      if (!authorId) {
        const { data, error } = await supabase
          .from('authors')
          .select('id')
          .eq('name', kirchenvater.name)
          .maybeSingle();

        if (error) {
          console.error('Fehler beim Laden des Autors:', error);
          setWorks([]);
          return;
        }

        authorId = data?.id || null;
      }

      if (!authorId) {
        setWorks([]);
        return;
      }

      const { data: worksData, error: worksError } = await supabase
        .from('works')
        .select('id, title, title_original, work_slug')
        .eq('author_id', authorId)
        .order('title', { ascending: true });

      if (worksError) {
        console.error('Fehler beim Laden der Werke:', worksError);
        setWorks([]);
        return;
      }

      const mapped = (worksData || []).map((work) => ({
        id: work.id,
        title: work.title || work.title_original || 'Unbenanntes Werk',
        subtitle:
          work.title_original && work.title_original !== work.title
            ? work.title_original
            : null,
        work_slug: work.work_slug || null,
      }));

      setWorks(mapped);
    } catch (error) {
      console.error('Unbekannter Fehler beim Laden der Werke:', error);
      setWorks([]);
    } finally {
      setLoading(false);
    }
  };

  const handleWorkPress = (work) => {
    navigation.navigate('KirchenvaterText', {
      kirchenvater: kirchenvater.name,
      workId: work.id,
      workTitle: work.title,
      workSlug: work.work_slug,
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.header, { borderBottomColor: colors.cardBackground }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.primary} />
          </TouchableOpacity>
          <ScrollingText
            text={kirchenvater.name}
            style={[styles.headerTitle, { color: colors.text }]}
            maxWidth={width * 0.7}
          />
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Lade Werke ...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {works.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Keine Werke gefunden.</Text>
            ) : (
              works.map((work) => (
                <TouchableOpacity
                  key={work.id}
                  style={[styles.workCard, { backgroundColor: colors.cardBackground }]}
                  onPress={() => handleWorkPress(work)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.workTitle, { color: colors.primary }]} numberOfLines={1}>
                    {work.title}
                  </Text>
                  {work.subtitle ? (
                    <Text style={[styles.workSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                      {work.subtitle}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 6,
  },
  headerTitle: {
    flex: 1,
    fontSize: normalize(18),
    fontFamily: 'Montserrat_600SemiBold',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 14,
  },
  workCard: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  workTitle: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 6,
  },
  workSubtitle: {
    fontSize: normalize(13),
    fontFamily: 'Montserrat_400Regular',
  },
  emptyText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    marginTop: 60,
  },
});

export default KirchenvaterDetailScreen;
