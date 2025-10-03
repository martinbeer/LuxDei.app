import React, { useRef, useState, useEffect, useMemo } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  TouchableOpacity, 
  StatusBar,
  Dimensions,
  Animated,
  ActivityIndicator,
  TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const scale = width / 320; // Base width for scaling

const normalize = (size) => {
  const newSize = size * scale;
  return Math.round(newSize);
};

const parseYears = (lifespan) => {
  if (!lifespan) return { birth: null, death: null };
  const match = lifespan.match(/(?:(\d{1,4}))[\s–\-]+(\d{1,4})/);
  if (match) {
    const birth = parseInt(match[1], 10);
    const death = parseInt(match[2], 10);
    return {
      birth: Number.isNaN(birth) ? null : birth,
      death: Number.isNaN(death) ? null : death,
    };
  }
  return { birth: null, death: null };
};

// Scrolling Text Component für lange Namen (Marquee-Effekt)
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

const VaeterScreen = ({ navigation, showHeader = true }) => {
  const { colors } = useTheme();
  const [kirchenväterData, setKirchenväterData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [sortType, setSortType] = useState('alphabet'); // 'alphabet', 'year-asc', 'year-desc', 'default'
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Fallback colors if theme context is not ready
  const safeColors = colors || {
    primary: '#3D7BFF',
    white: '#FFFFFF',
    background: '#FFFFFF',
    cardBackground: 'rgba(61, 123, 255, 0.2)',
    text: '#333333',
    textSecondary: '#666666'
  };

  // Lade Autoren aus neuer Schema-Tabelle "authors"
  useEffect(() => {
    const loadAuthors = async () => {
      try {
        setLoading(true);
        console.log('[Supabase] Lade Autoren (Kirchenvaeter) aus Supabase...');

        const { data, error } = await supabase
          .from('authors')
          .select('id, name, name_original, lifespan, slug')
          .order('name', { ascending: true });

        if (error) throw error;

        const authors = (data || []).map((a) => {
          const years = parseYears(a.lifespan || '');
          const descriptionParts = [];
          if (a.name_original) descriptionParts.push(a.name_original);
          if (a.lifespan) descriptionParts.push(a.lifespan);
          return {
            id: a.id,
            name: a.name,
            description: descriptionParts.join(' · ') || 'Kirchenvater',
            birth_year: years.birth,
            death_year: years.death,
          };
        });

        const sortedData = sortData(authors, sortType);
        setKirchenväterData(authors);
        setFilteredData(sortedData);
        console.log(`[Supabase] ${authors.length} Autoren geladen`);
      } catch (error) {
        console.error('[Supabase] Fehler beim Laden der Autoren:', error);
        setKirchenväterData([]);
        setFilteredData([]);
      } finally {
        setLoading(false);
      }
    };

    loadAuthors();
  }, []);

  // Sortierung anwenden wenn sortType sich ändert
  useEffect(() => {
    if (kirchenväterData.length > 0) {
      let dataToSort = searchText.trim() === '' ? kirchenväterData : 
        kirchenväterData.filter(vater => {
          const searchTerm = searchText.toLowerCase();
          return (
            vater.name?.toLowerCase().includes(searchTerm) ||
            vater.description?.toLowerCase().includes(searchTerm)
          );
        });
      
      const sortedData = sortData(dataToSort, sortType);
      setFilteredData(sortedData);
    }
  }, [sortType, kirchenväterData]);

  // Sortierfunktion
  const sortData = (data, type) => {
    const sorted = [...data];
    switch (type) {
      case 'alphabet':
        return sorted.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      case 'year-asc':
        return sorted.sort((a, b) => (a.death_year ?? 99999) - (b.death_year ?? 99999));
      case 'year-desc':
        return sorted.sort((a, b) => (b.death_year ?? -99999) - (a.death_year ?? -99999));
      case 'default':
      default:
        return sorted; // Originale Reihenfolge beibehalten
    }
  };

  // Suchfunktion (erweitert um Sortierung und Textstellen)
  const handleSearch = (text) => {
    setSearchText(text);
    let filtered;
    if (text.trim() === '') {
      filtered = kirchenväterData;
    } else {
      filtered = kirchenväterData.filter(vater => {
        const searchTerm = text.toLowerCase();
        return (
          vater.name?.toLowerCase().includes(searchTerm) ||
          vater.description?.toLowerCase().includes(searchTerm)
        );
      });
    }
    // Sortierung anwenden
    const sortedFiltered = sortData(filtered, sortType);
    setFilteredData(sortedFiltered);
  };

  // Sortierung ändern
  const handleSortChange = (newSortType) => {
    setSortType(newSortType);
    setShowSortDropdown(false);
    
    // Aktuelle gefilterte Daten sortieren
    let dataToSort = searchText.trim() === '' ? kirchenväterData : 
      kirchenväterData.filter(vater => {
        const searchTerm = searchText.toLowerCase();
        return (
          vater.name?.toLowerCase().includes(searchTerm) ||
          vater.description?.toLowerCase().includes(searchTerm)
        );
      });
    
    const sortedData = sortData(dataToSort, newSortType);
    setFilteredData(sortedData);
  };

  const toggleSearch = () => {
    console.log('🔍 Toggle search clicked, current state:', isSearchVisible);
    setIsSearchVisible(!isSearchVisible);
    setShowSortDropdown(false); // Schließe Sort-Dropdown
    if (isSearchVisible) {
      setSearchText('');
      setFilteredData(kirchenväterData);
    }
  };

  const renderVater = React.useCallback(({ item, index }) => {
    return (
      <TouchableOpacity 
        style={styles.vaterItemContainer}
        onPress={() => navigation?.navigate('KirchenvaterDetail', { kirchenvater: item })}
        activeOpacity={0.7}
      >
        <View style={styles.imageContainer}>
          {/* Grauer Kreis als Platzhalter für Bilder */}
          <View style={styles.grayCircle} />
        </View>
        <View style={[styles.nameContainer, { backgroundColor: safeColors.cardBackground }]}>
          <ScrollingText
            text={item.name}
            style={[styles.vaterName, { color: safeColors.primary }]}
            maxWidth={width * 0.6}
          />
        </View>
      </TouchableOpacity>
    );
  }, [safeColors, navigation]);

  // Header-Komponente für die FlatList
  const renderListHeader = React.useCallback(() => (
    <View>
      {/* Search Controls Row */}
      <View style={styles.controlsRow}>
        {isSearchVisible ? (
          <View style={[styles.searchInputContainer, { backgroundColor: safeColors.cardBackground }]}>
            <Ionicons name="search" size={20} color={safeColors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: safeColors.text }]}
              placeholder="Suche in Kirchenvätern..."
              placeholderTextColor={safeColors.textSecondary}
              value={searchText}
              onChangeText={handleSearch}
              autoFocus
            />
            {searchText.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => handleSearch('')}
              >
                <Ionicons name="close" size={20} color={safeColors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={[styles.placeholderContainer, { backgroundColor: safeColors.cardBackground }]}>
            <TouchableOpacity 
              style={styles.sortButton}
              onPress={() => setShowSortDropdown(!showSortDropdown)}
            >
              <Text style={[styles.sortButtonText, { color: safeColors.primary }]}>
                {sortType === 'alphabet' && 'A-Z'}
                {sortType === 'year-asc' && 'Jahr ↑'}
                {sortType === 'year-desc' && 'Jahr ↓'}
                {sortType === 'default' && 'Standard'}
              </Text>
              <Ionicons 
                name="chevron-down" 
                size={16} 
                color={safeColors.primary} 
                style={styles.sortIcon}
              />
            </TouchableOpacity>
          </View>
        )}
        
        <TouchableOpacity 
          style={[styles.searchButton, { backgroundColor: safeColors.cardBackground }]}
          onPress={toggleSearch}
        >
          <Ionicons 
            name={isSearchVisible ? "close" : "search"} 
            size={20} 
            color={safeColors.primary} 
          />
        </TouchableOpacity>
      </View>

      {/* Sort Dropdown - EXAKT wie BibelScreen */}
      {showSortDropdown && !isSearchVisible && (
        <View style={[styles.sortDropdown, { backgroundColor: safeColors.cardBackground }]}>
          {[
            { key: 'alphabet', label: 'Alphabetisch (A-Z)' },
            { key: 'year-asc', label: 'Jahr aufsteigend' },
            { key: 'year-desc', label: 'Jahr absteigend' },
            { key: 'default', label: 'Standard' }
          ].map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.sortOption,
                sortType === option.key && { backgroundColor: safeColors.primary + '20' }
              ]}
              onPress={() => handleSortChange(option.key)}
            >
              <Text 
                style={[
                  styles.sortOptionText, 
                  { color: sortType === option.key ? safeColors.primary : safeColors.text }
                ]}
              >
                {option.label}
              </Text>
              {sortType === option.key && (
                <Ionicons name="checkmark" size={20} color={safeColors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  ), [isSearchVisible, searchText, showSortDropdown, sortType, safeColors, handleSearch, handleSortChange, toggleSearch]);

  return (
    <View style={[styles.container, { backgroundColor: safeColors.background }]}>
      {showHeader && (
        <>
          <StatusBar barStyle="light-content" backgroundColor={safeColors.primary} />
          
          {/* Header with extended background */}
          <View style={[styles.headerBackground, { backgroundColor: safeColors.primary }]}>
            <SafeAreaView style={styles.headerSafeArea}>
              <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: safeColors.white }]}>Kirchenväter</Text>
              </View>
            </SafeAreaView>
          </View>
        </>
      )}

      {/* Kirchenväter Liste */}
  {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={safeColors.primary} />
          <Text style={[styles.loadingText, { color: safeColors.textSecondary }]}>
    Lade Autoren...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          renderItem={renderVater}
          keyExtractor={(item) => item.id.toString()}
          ListHeaderComponent={renderListHeader}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={3}
          windowSize={3}
          removeClippedSubviews={false}
          updateCellsBatchingPeriod={100}
          disableVirtualization={false}
          onScrollBeginDrag={() => setShowSortDropdown(false)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    paddingHorizontal: 20,
    paddingVertical: normalize(10),
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: normalize(30),
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 25,
  },
  placeholderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 25,
  },
  placeholderText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_500Medium',
    marginRight: 10,
    flex: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 20,
    gap: 15,
  },
  searchButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
  },
  clearButton: {
    padding: 5,
    marginLeft: 10,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100, // Extra Platz für die untere Navigation
  },
  vaterItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    marginHorizontal: 8,
    paddingLeft: 8,
  },
  vaterItemContainerReverse: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginHorizontal: 8,
    paddingRight: 8,
  },
  imageContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: 'hidden',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  grayCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 35,
    backgroundColor: '#D1D5DB', // grauer Kreis
  },
  nameContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    justifyContent: 'center',
    minHeight: 52,
    marginLeft: -35,
    paddingLeft: 45,
  },
  nameContainerRight: {
    // Bild links, Name rechts
    marginLeft: -35,
    paddingLeft: 50,
    textAlign: 'left',
  },
  nameContainerLeft: {
    // Name links, Bild rechts
    marginRight: -35,
    paddingRight: 50,
  },
  vaterName: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'left',
    fontFamily: 'Montserrat_600SemiBold',
  },
  vaterNameRight: {
    textAlign: 'right',
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
    textAlign: 'center',
    marginTop: 20,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Montserrat_600SemiBold',
  },
  sortIcon: {
    marginLeft: 4,
  },
  // Sort Dropdown Styles - EXAKT wie BibelScreen translationDropdown
  sortDropdown: {
    marginHorizontal: 10,
    marginTop: 5,
    borderRadius: 15,
    padding: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginVertical: 1,
  },
  sortOptionText: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_500Medium',
    fontWeight: '500',
  },
});

export default VaeterScreen;
