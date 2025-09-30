import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, LayoutAnimation, UIManager, Platform, Share, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useNavigation } from '@react-navigation/native';
import { loadCategoriesAndPrayers, loadPrayerDetail } from '../lib/prayersApi';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: windowWidth } = Dimensions.get('window');
const scale = windowWidth / 320;
const normalize = (size) => Math.round(size * scale);

const GebetScreen = () => {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [categories, setCategories] = useState([]);
  const [allPrayers, setAllPrayers] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [favorites, setFavorites] = useState(new Set());

  // Staggered animation for cards
  const animValuesRef = useRef({});
  const getAnimFor = (id) => {
    if (!animValuesRef.current[id]) {
      animValuesRef.current[id] = new Animated.Value(0);
    }
    return animValuesRef.current[id];
  };

  const hasFavorites = favorites.size > 0;
  const effectiveCategories = useMemo(() => {
    const baseCore = [
      { id: 'all', name: 'Alle' },
      { id: 'hours', name: 'Stundengebet' },
      { id: 'rosary', name: 'Rosenkranz' },
    ];
    const dyn = categories || [];
    const base = hasFavorites
      ? [{ id: 'favorites', name: 'Favoriten' }, ...baseCore, ...dyn]
      : [...baseCore, ...dyn];
    return base;
  }, [hasFavorites, categories]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = allPrayers;
    if (category === 'favorites') {
      list = list.filter((p) => favorites.has(p.id));
    } else if (category !== 'all') {
      list = list.filter((p) => p.category === category);
    }
    if (!q) return list;
    return list.filter((p) => p.title?.toLowerCase().includes(q) || p.text?.toLowerCase().includes(q));
  }, [query, category, favorites, allPrayers]);

  const toggleExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFavorite = (id) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    // Animate visible results on change
    results.forEach((p, idx) => {
      const v = getAnimFor(p.id);
      Animated.timing(v, {
        toValue: 1,
        duration: 280,
        delay: idx * 40,
        useNativeDriver: true,
      }).start();
    });
  }, [results]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { categories, prayers } = await loadCategoriesAndPrayers();
      if (!mounted) return;
      setCategories(categories);
      setAllPrayers(prayers);
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with rounded background */}
      <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <View style={{ width: 40 }} />
            <Text style={[styles.headerTitle, { color: colors.white }]} numberOfLines={1}>Gebete</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </View>

      {/* Filters */}
    <View style={styles.filtersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsRow}>
      {effectiveCategories.map((c) => {
            const active = category === c.id;
            const onPress = () => {
              if (c.id === 'rosary') {
                navigation.navigate('Rosenkranz');
              } else if (c.id === 'hours') {
                navigation.navigate('Stundengebet');
              } else {
                setCategory(c.id);
              }
            };
            return (
              <TouchableOpacity key={c.id} onPress={onPress} style={[styles.pill, { backgroundColor: active ? colors.primary : colors.cardBackground }]}>
                <Text style={[styles.pillText, { color: active ? colors.white : colors.primary }]}>{c.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Search */}
      <View style={[styles.searchBox, { backgroundColor: colors.cardBackground }]}>
        <Ionicons name="search" size={18} color={colors.primary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Suche Gebete"
          placeholderTextColor={colors.textSecondary}
          style={[styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {results.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.cardBackground} />
            <Text style={{ marginTop: 10, color: colors.textSecondary }}>Keine Gebete gefunden</Text>
          </View>
        ) : (
          results.map((p, idx) => {
            const isOpen = !!expanded[p.id];
            const anim = getAnimFor(p.id);
            return (
              <Animated.View
                key={p.id}
                style={{
                  opacity: anim,
                  transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
                }}
              >
                <View style={[styles.card, { backgroundColor: colors.cardBackground }]}> 

                  <TouchableOpacity onPress={() => toggleExpand(p.id)} style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: colors.primary }]}>{p.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
                    </View>
                  </TouchableOpacity>
                  {isOpen && (
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.primary + '40', paddingHorizontal: 10, paddingVertical: 10 }]}
                        onPress={() => toggleFavorite(p.id)}
                      >
                        <Ionicons name={favorites.has(p.id) ? 'bookmark' : 'bookmark-outline'} size={18} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.cardBackground, borderWidth: 1, borderColor: colors.primary + '40', paddingHorizontal: 10, paddingVertical: 10 }]}
                        onPress={async () => {
                          let message = `${p.title}\n\n${p.text || ''}`.trim();
                          if (!p.text) {
                            const d = await loadPrayerDetail({ slug: p.slug, id: p.id });
                            const full = d?.text || '';
                            message = `${p.title}\n\n${full}`.trim();
                          }
                          Share.share({ message });
                        }}
                      >
                        <Ionicons name="share-social" size={18} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                        onPress={() => navigation.navigate('GebetDetail', { prayer: p, autoStart: true })}
                      >
                        <Ionicons name="play" size={16} color={colors.white} />
                        <Text style={[styles.actionText, { color: colors.white }]}>Starten</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBackground: {
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerSafeArea: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  headerTitle: {
    flex: 1,
  fontSize: normalize(22),
  fontFamily: 'Montserrat_700Bold',
  fontWeight: '700',
    textAlign: 'center',
  },
  filtersRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  pillsRow: {
    gap: 8,
    paddingBottom: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  pillText: {
  fontSize: normalize(14),
    fontFamily: 'Montserrat_500Medium',
    fontWeight: '500',
  },
  searchBox: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
  },
  card: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  decorShape: {
  // removed decorative circle
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
  },
  cardText: {
    marginTop: 10,
    fontSize: normalize(16),
    lineHeight: normalize(24),
    fontFamily: 'Montserrat_400Regular',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingHorizontal: 8,
  paddingVertical: 6,
    borderRadius: 10,
  },
  actionText: {
  fontSize: normalize(12),
    fontFamily: 'Montserrat_500Medium',
  },
});

export default GebetScreen;
