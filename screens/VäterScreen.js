import React, { useMemo, useRef, useState, useEffect } from 'react';
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
  Image,
  TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import supabaseImageManager from '../utils/supabaseImageManager';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const scale = width / 320; // Base width for scaling

const normalize = (size) => {
  const newSize = size * scale;
  return Math.round(newSize);
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

const VäterScreen = ({ navigation, showHeader = true }) => {
  const { colors } = useTheme();
  const [kirchenväterData, setKirchenväterData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loadingImages, setLoadingImages] = useState(true);
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

  // Lade alle Bilder einmalig beim Komponenten-Mount
  useEffect(() => {
    const loadSupabaseImages = async () => {
      try {
        setLoadingImages(true);
        console.log('🚀 Lade Kirchenväter-Bilder von Supabase...');
        
        const supabaseImages = await supabaseImageManager.loadAllImages();
        
        if (supabaseImages.length > 0) {
          // Erstelle Kirchenväter-Daten mit Supabase-URLs
          const supabaseKirchenväter = supabaseImages.map((img, index) => ({
            id: index + 1,
            name: img.name,
            image: { uri: img.url }, // Supabase URL
            description: img.description,
            supabaseId: img.id,
            isSupabaseImage: true
          }));
          
          const sortedData = sortData(supabaseKirchenväter, sortType);
          setKirchenväterData(supabaseKirchenväter);
          setFilteredData(sortedData);
          console.log(`✅ ${supabaseKirchenväter.length} Kirchenväter mit Supabase-Bildern geladen`);
        } else {
          // Falls keine Supabase-Bilder, verwende lokale als Fallback
          console.log('⚠️ Keine Supabase-Bilder gefunden, verwende lokale Bilder');
          const sortedLocalData = sortData(localKirchenväter, sortType);
          setKirchenväterData(localKirchenväter);
          setFilteredData(sortedLocalData);
        }
      } catch (error) {
        console.error('❌ Fehler beim Laden der Supabase-Bilder:', error);
        const sortedLocalData = sortData(localKirchenväter, sortType);
        setKirchenväterData(localKirchenväter);
        setFilteredData(sortedLocalData);
      } finally {
        setLoadingImages(false);
      }
    };

    loadSupabaseImages();
  }, []);

  // Sortierung anwenden wenn sortType sich ändert
  useEffect(() => {
    if (kirchenväterData.length > 0) {
      let dataToSort = searchText.trim() === '' ? kirchenväterData : 
        kirchenväterData.filter(vater => {
          const searchTerm = searchText.toLowerCase();
          const works = getWorksForName(vater.name).toLowerCase();
          
          return vater.name.toLowerCase().includes(searchTerm) ||
                 vater.description.toLowerCase().includes(searchTerm) ||
                 works.includes(searchTerm);
        });
      
      const sortedData = sortData(dataToSort, sortType);
      setFilteredData(sortedData);
    }
  }, [sortType, kirchenväterData]);

  // Hilfsfunktion für Beschreibungen (Fallback für lokale Bilder)
  const getDescriptionForName = (name) => {
    const descriptions = {
      'Athanasius von Alexandria': 'Verteidiger der Orthodoxie',
      'Basilius von Cäsarea': 'Großer Kappadozier',
      'Clemens von Rom': 'Früher Bischof von Rom',
      'Cyprian von Karthago': 'Märtyrer und Kirchenvater',
      'Augustinus von Hippo': 'Kirchenvater und Theologe',
      'Cyrill von Alexandria': 'Theologe und Kirchenlehrer',
      'Ephraem der Syrer': 'Syrischer Kirchenvater',
      'Eusebius von Caesarea': 'Kirchenhistoriker',
      'Fulgentius von Ruspe': 'Nordafrikanischer Theologe',
      'Hilarius von Poitiers': 'Athanasius des Westens',
      'Martin von Tours': 'Heiliger und Bischof',
      'Hieronymus': 'Bibelübersetzer',
      'Hippolyt von Rom': 'Früher Kirchenvater',
      'Ignatius von Antiochien': 'Apostolischer Vater',
      'Johannes Chrysostomus': 'Goldmund-Prediger',
      'Justin der Märtyrer': 'Frühchristlicher Apologet',
      'Maximus Confessor': 'Byzantinischer Theologe',
      'Origenes': 'Alexandrinischer Theologe',
      'Palladius': 'Mönchshistoriker',
      'Paulinus von Nola': 'Dichter und Bischof',
      'Rufinus von Aquileia': 'Übersetzer und Theologe',
      'Tertullian': 'Lateinischer Kirchenvater',
      'Theodoret von Cyrus': 'Theologe und Kirchenhistoriker'
    };
    return descriptions[name] || 'Kirchenvater';
  };

  // Hilfsfunktion für Lebensjahre (für Sortierung)
  const getYearForName = (name) => {
    const years = {
      'Athanasius von Alexandria': 373, // ca. 300-373
      'Basilius von Cäsarea': 379, // ca. 330-379
      'Clemens von Rom': 99, // ca. 50-99
      'Cyprian von Karthago': 258, // ca. 200-258
      'Augustinus von Hippo': 430, // 354-430
      'Cyrill von Alexandria': 444, // ca. 376-444
      'Ephraem der Syrer': 373, // ca. 306-373
      'Eusebius von Caesarea': 339, // ca. 260-339
      'Fulgentius von Ruspe': 533, // ca. 468-533
      'Hilarius von Poitiers': 367, // ca. 315-367
      'Martin von Tours': 397, // ca. 316-397
      'Hieronymus': 420, // ca. 347-420
      'Hippolyt von Rom': 235, // ca. 170-235
      'Ignatius von Antiochien': 110, // ca. 35-110
      'Johannes Chrysostomus': 407, // ca. 349-407
      'Justin der Märtyrer': 165, // ca. 100-165
      'Maximus Confessor': 662, // ca. 580-662
      'Origenes': 254, // ca. 185-254
      'Palladius': 430, // ca. 363-430
      'Paulinus von Nola': 431, // ca. 354-431
      'Rufinus von Aquileia': 411, // ca. 345-411
      'Tertullian': 220, // ca. 160-220
      'Theodoret von Cyrus': 457 // ca. 393-457
    };
    return years[name] || 999; // Default für unbekannte Jahre
  };

  // Hilfsfunktion für Hauptwerke/Textstellen (für erweiterte Suche)
  const getWorksForName = (name) => {
    const works = {
      'Athanasius von Alexandria': 'Vita Antonii Leben des Antonius Gegen die Arianer Briefe an Serapion Osterfestbriefe',
      'Basilius von Cäsarea': 'Hexaemeron Über den Heiligen Geist Mönchsregeln Briefe Liturgie des Basilius',
      'Clemens von Rom': 'Erster Clemensbrief Zweiter Clemensbrief Apostolische Konstitutionen',
      'Cyprian von Karthago': 'Über die Einheit der Kirche Briefe De lapsis An Donatus',
      'Augustinus von Hippo': 'Confessiones Bekenntnisse De civitate Dei Gottesstaat De trinitate Über die Dreieinigkeit Retractationes',
      'Cyrill von Alexandria': 'Thesaurus Gegen Julian Osterfestbriefe Johanneskommentar',
      'Ephraem der Syrer': 'Carmina Nisibena Hymnen Kommentare zur Heiligen Schrift Sermones',
      'Eusebius von Caesarea': 'Kirchengeschichte Historia ecclesiastica Praeparatio evangelica Chronikon',
      'Fulgentius von Ruspe': 'Contra Fabianum De fide ad Petrum Briefe',
      'Hilarius von Poitiers': 'De trinitate Über die Dreieinigkeit Psalmenkommentare Gegen Auxentius',
      'Martin von Tours': 'Vita Martini von Sulpicius Severus Briefe Dialoge',
      'Hieronymus': 'Vulgata Bibelübersetzung De viris illustribus Briefe Chronik Contra Jovinianum',
      'Hippolyt von Rom': 'Apostolische Tradition Refutatio omnium haeresium Gegen alle Häresien',
      'Ignatius von Antiochien': 'Sieben Briefe an Gemeinden Märtyrerakte',
      'Johannes Chrysostomus': 'Homilien Predigten De sacerdotio Über das Priestertum Gegen die Juden',
      'Justin der Märtyrer': 'Erste Apologie Zweite Apologie Dialog mit Tryphon',
      'Maximus Confessor': 'Mystagogica Ambigua Quaestiones ad Thalassium',
      'Origenes': 'Hexapla De principiis Gegen Celsus Homilien Kommentare',
      'Palladius': 'Historia Lausiaca Mönchsgeschichte Dialog über Johannes Chrysostomus',
      'Paulinus von Nola': 'Carmina Gedichte Briefe Vita Felicis',
      'Rufinus von Aquileia': 'Übersetzungen des Origenes Kirchengeschichte Symbolum',
      'Tertullian': 'Apologeticum De baptismo Gegen Marcion De praescriptione haereticorum',
      'Theodoret von Cyrus': 'Kirchengeschichte Häretikergeschichte Bibelkommentare'
    };
    return works[name] || '';
  };

  // Lokale Kirchenväter-Daten als Fallback
  const localKirchenväter = useMemo(() => [
    {
      id: 1,
      name: 'Athanasius von Alexandria',
      image: require('../assets/Ikone_Athanasius_von_Alexandria.jpg'),
      description: 'Verteidiger der Orthodoxie'
    },
    {
      id: 2,
      name: 'Basilius von Cäsarea',
      image: require('../assets/Basil_of_Caesarea.jpg'),
      description: 'Großer Kappadozier'
    },
    {
      id: 3,
      name: 'Clemens von Rom',
      image: require('../assets/500px-Clemens_I.jpg'),
      description: 'Früher Bischof von Rom'
    },
    {
      id: 4,
      name: 'Cyprian von Karthago',
      image: require('../assets/Cyprian_von_Karthago2.jpg'),
      description: 'Märtyrer und Kirchenvater'
    },
    {
      id: 5,
      name: 'Augustinus von Hippo',
      image: require('../assets/augustinus-alexandria.jpg'),
      description: 'Kirchenvater und Theologe'
    },
    {
      id: 6,
      name: 'Cyrill von Alexandria',
      image: require('../assets/Cyril_of_Alexandria.jpg'),
      description: 'Theologe und Kirchenlehrer'
    },
    {
      id: 7,
      name: 'Ephraem der Syrer',
      image: require('../assets/ephraem-der-syrer3778906.jpg'),
      description: 'Syrischer Kirchenvater'
    },
    {
      id: 8,
      name: 'Eusebius von Caesarea',
      image: require('../assets/Eusebius_von_Caesarea.jpg'),
      description: 'Kirchenhistoriker'
    },
    {
      id: 9,
      name: 'Fulgentius von Ruspe',
      image: require('../assets/250px-Fulgentius_von_Ruspe_17Jh.jpg'),
      description: 'Nordafrikanischer Theologe'
    },
    {
      id: 10,
      name: 'Hilarius von Poitiers',
      image: require('../assets/300px-Hl._Hilarius_von_Poitiers.png'),
      description: 'Athanasius des Westens'
    },
    {
      id: 11,
      name: 'Martin von Tours',
      image: require('../assets/300px-Hl._Martin_von_Tours.jpg'),
      description: 'Heiliger und Bischof'
    },
    {
      id: 12,
      name: 'Hieronymus',
      image: require('../assets/hiernoymus.jpg'),
      description: 'Bibelübersetzer'
    },
    {
      id: 13,
      name: 'Hippolyt von Rom',
      image: require('../assets/hippolyt.jpg'),
      description: 'Früher Kirchenvater'
    },
    {
      id: 14,
      name: 'Ignatius von Antiochien',
      image: require('../assets/ignatius_von_antiochien.jpg'),
      description: 'Apostolischer Vater'
    },
    {
      id: 15,
      name: 'Johannes Chrysostomus',
      image: require('../assets/johannes chysostomus.jpg'),
      description: 'Goldmund-Prediger'
    },
    {
      id: 16,
      name: 'Justin der Märtyrer',
      image: require('../assets/justin.jpg'),
      description: 'Frühchristlicher Apologet'
    },
    {
      id: 17,
      name: 'Maximus Confessor',
      image: require('../assets/maximus.jpg'),
      description: 'Byzantinischer Theologe'
    },
    {
      id: 18,
      name: 'Origenes',
      image: require('../assets/origenes.jpg'),
      description: 'Alexandrinischer Theologe'
    },
    {
      id: 19,
      name: 'Palladius',
      image: require('../assets/heilige-palladius-van-helenopolis-62b05f-200.jpg'),
      description: 'Mönchshistoriker'
    },
    {
      id: 20,
      name: 'Paulinus von Nola',
      image: require('../assets/paulinus von nola.jpg'),
      description: 'Dichter und Bischof'
    },
    {
      id: 21,
      name: 'Rufinus von Aquileia',
      image: require('../assets/rufinus.jpg'),
      description: 'Übersetzer und Theologe'
    },
    {
      id: 22,
      name: 'Tertullian',
      image: require('../assets/tertullian_3.jpg'),
      description: 'Lateinischer Kirchenvater'
    },
    {
      id: 23,
      name: 'Theodoret von Cyrus',
      image: require('../assets/Theodoret_von_Kyrrhos.jpg'),
      description: 'Theologe und Kirchenhistoriker'
    }
  ], []);

  // Sortierfunktion
  const sortData = (data, type) => {
    const sorted = [...data];
    switch (type) {
      case 'alphabet':
        return sorted.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      case 'year-asc':
        return sorted.sort((a, b) => getYearForName(a.name) - getYearForName(b.name));
      case 'year-desc':
        return sorted.sort((a, b) => getYearForName(b.name) - getYearForName(a.name));
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
        const works = getWorksForName(vater.name).toLowerCase();
        
        return vater.name.toLowerCase().includes(searchTerm) ||
               vater.description.toLowerCase().includes(searchTerm) ||
               works.includes(searchTerm);
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
        const works = getWorksForName(vater.name).toLowerCase();
        
        return vater.name.toLowerCase().includes(searchTerm) ||
               vater.description.toLowerCase().includes(searchTerm) ||
               works.includes(searchTerm);
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

  const renderVater = React.useCallback(({ item }) => (
    <TouchableOpacity 
      style={styles.vaterItemContainer}
      onPress={() => navigation?.navigate('KirchenvaterDetail', { kirchenvater: item })}
      activeOpacity={0.7}
    >
      <View style={styles.imageContainer}>
        <Image 
          source={item.image} 
          style={styles.vaterImage}
          resizeMode="cover"
        />
      </View>
      <View style={[styles.nameContainer, { backgroundColor: safeColors.cardBackground }]}>
        <ScrollingText
          text={item.name}
          style={[styles.vaterName, { color: safeColors.primary }]}
          maxWidth={width * 0.6}
        />
      </View>
    </TouchableOpacity>
  ), [safeColors, navigation]);

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
      {loadingImages ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={safeColors.primary} />
          <Text style={[styles.loadingText, { color: safeColors.textSecondary }]}>
            🌐 Lade Bilder von Supabase...
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
    marginBottom: 16,
    marginHorizontal: 8,
    paddingLeft: 8,
  },
  imageContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    marginRight: -35,
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  vaterImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  nameContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 12,
    paddingLeft: 50,
    borderRadius: 28,
    justifyContent: 'center',
    minHeight: 56,
    zIndex: 1,
  },
  vaterName: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'left',
    fontFamily: 'Montserrat_600SemiBold',
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
  // Sort Dropdown Styles - EXAKT wie BibelScreen translationDropdown, aber Höhe angepasst
  sortDropdown: {
    marginHorizontal: 20,
    marginTop: 5,
    borderRadius: 15,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    maxHeight: 50, // Gleiche Höhe wie searchButton
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6, // Reduziert von 12 auf 6
    paddingHorizontal: 10, // Reduziert von 15 auf 10
    borderRadius: 8, // Reduziert von 10 auf 8
    marginVertical: 1, // Reduziert von 2 auf 1
  },
  sortOptionText: {
    fontSize: normalize(14), // Reduziert von 16 auf 14
    fontFamily: 'Montserrat_500Medium',
    fontWeight: '500',
  },
});

export default VäterScreen;
