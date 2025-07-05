import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Animated, TextInput, FlatList, Keyboard } from 'react-native';
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

// Scrolling Text Component für lange Texte
const ScrollingText = ({ text, style, maxWidth = 120 }) => {
  const { colors } = useTheme();
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [textWidth, setTextWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(maxWidth);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    if (textWidth > containerWidth) {
      setShouldScroll(true);
      const scrollDistance = textWidth - containerWidth + 20; // Extra padding
      
      const scrollAnimation = Animated.loop(
        Animated.sequence([
          Animated.delay(1000),
          Animated.timing(animatedValue, {
            toValue: -scrollDistance,
            duration: scrollDistance * 30, // Adjust speed
            useNativeDriver: true,
          }),
          Animated.delay(1000),
          Animated.timing(animatedValue, {
            toValue: 0,
            duration: scrollDistance * 30,
            useNativeDriver: true,
          }),
        ])
      );
      
      scrollAnimation.start();
      
      return () => scrollAnimation.stop();
    } else {
      setShouldScroll(false);
      animatedValue.setValue(0);
    }
  }, [textWidth, containerWidth]);

  return (
    <View 
      style={[{ width: containerWidth, overflow: 'hidden' }]}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
    >
      <Animated.Text
        style={[
          style,
          shouldScroll && {
            transform: [{ translateX: animatedValue }],
          }
        ]}
        onLayout={(event) => setTextWidth(event.nativeEvent.layout.width)}
        numberOfLines={1}
      >
        {text}
      </Animated.Text>
    </View>
  );
};

const BibelScreen = () => {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [selectedTranslation, setSelectedTranslation] = useState('Allioli-Arndt');
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showTranslationDropdown, setShowTranslationDropdown] = useState(false);
  const searchInputRef = useRef(null);

  const translations = [
    { name: 'Allioli-Arndt', table: 'bibelverse' },
    { name: 'Schöningh', table: 'bibelverse_schoenigh' },
    { name: 'Einheitsübersetzung', table: 'bibelverse_einheit' }
  ];

  const oldTestamentBooks = [
    // Geschichtsbücher
    { name: 'Genesis', category: 'Geschichtsbücher' },
    { name: 'Exodus', category: 'Geschichtsbücher' },
    { name: 'Levitikus', category: 'Geschichtsbücher' },
    { name: 'Numeri', category: 'Geschichtsbücher' },
    { name: 'Deuteronomium', category: 'Geschichtsbücher' },
    { name: 'Josua', category: 'Geschichtsbücher' },
    { name: 'Richter', category: 'Geschichtsbücher' },
    { name: 'Rut', category: 'Geschichtsbücher' },
    { name: '1. Samuel', category: 'Geschichtsbücher' },
    { name: '2. Samuel', category: 'Geschichtsbücher' },
    { name: '1. Könige', category: 'Geschichtsbücher' },
    { name: '2. Könige', category: 'Geschichtsbücher' },
    { name: '1. Chronik', category: 'Geschichtsbücher' },
    { name: '2. Chronik', category: 'Geschichtsbücher' },
    { name: 'Esra', category: 'Geschichtsbücher' },
    { name: 'Nehemia', category: 'Geschichtsbücher' },
    { name: 'Tobit', category: 'Geschichtsbücher' },
    { name: 'Judit', category: 'Geschichtsbücher' },
    { name: 'Ester', category: 'Geschichtsbücher' },
    { name: '1. Makkabäer', category: 'Geschichtsbücher' },
    { name: '2. Makkabäer', category: 'Geschichtsbücher' },
    
    // Lehrbücher
    { name: 'Ijob', category: 'Lehrbücher' },
    { name: 'Psalmen', category: 'Lehrbücher' },
    { name: 'Sprichwörter', category: 'Lehrbücher' },
    { name: 'Kohelet', category: 'Lehrbücher' },
    { name: 'Hoheslied', category: 'Lehrbücher' },
    { name: 'Weisheit', category: 'Lehrbücher' },
    { name: 'Jesus Sirach', category: 'Lehrbücher' },
    
    // Prophetenbücher
    { name: 'Jesaja', category: 'Prophetenbücher' },
    { name: 'Jeremia', category: 'Prophetenbücher' },
    { name: 'Klagelieder', category: 'Prophetenbücher' },
    { name: 'Baruch', category: 'Prophetenbücher' },
    { name: 'Ezechiel', category: 'Prophetenbücher' },
    { name: 'Daniel', category: 'Prophetenbücher' },
    { name: 'Hosea', category: 'Prophetenbücher' },
    { name: 'Joel', category: 'Prophetenbücher' },
    { name: 'Amos', category: 'Prophetenbücher' },
    { name: 'Obadja', category: 'Prophetenbücher' },
    { name: 'Jona', category: 'Prophetenbücher' },
    { name: 'Micha', category: 'Prophetenbücher' },
    { name: 'Nahum', category: 'Prophetenbücher' },
    { name: 'Habakuk', category: 'Prophetenbücher' },
    { name: 'Zefanja', category: 'Prophetenbücher' },
    { name: 'Haggai', category: 'Prophetenbücher' },
    { name: 'Sacharja', category: 'Prophetenbücher' },
    { name: 'Maleachi', category: 'Prophetenbücher' },
  ];

  const newTestamentBooks = [
    // Evangelien
    { name: 'Matthäus', category: 'Evangelien' },
    { name: 'Markus', category: 'Evangelien' },
    { name: 'Lukas', category: 'Evangelien' },
    { name: 'Johannes', category: 'Evangelien' },
    
    // Apostelgeschichte
    { name: 'Apostelgeschichte', category: 'Geschichtsbuch' },
    
    // Paulusbriefe
    { name: 'Römer', category: 'Paulusbriefe' },
    { name: '1. Korinther', category: 'Paulusbriefe' },
    { name: '2. Korinther', category: 'Paulusbriefe' },
    { name: 'Galater', category: 'Paulusbriefe' },
    { name: 'Epheser', category: 'Paulusbriefe' },
    { name: 'Philipper', category: 'Paulusbriefe' },
    { name: 'Kolosser', category: 'Paulusbriefe' },
    { name: '1. Thessalonicher', category: 'Paulusbriefe' },
    { name: '2. Thessalonicher', category: 'Paulusbriefe' },
    { name: '1. Timotheus', category: 'Paulusbriefe' },
    { name: '2. Timotheus', category: 'Paulusbriefe' },
    { name: 'Titus', category: 'Paulusbriefe' },
    { name: 'Philemon', category: 'Paulusbriefe' },
    { name: 'Hebräer', category: 'Paulusbriefe' },
    
    // Katholische Briefe
    { name: 'Jakobus', category: 'Katholische Briefe' },
    { name: '1. Petrus', category: 'Katholische Briefe' },
    { name: '2. Petrus', category: 'Katholische Briefe' },
    { name: '1. Johannes', category: 'Katholische Briefe' },
    { name: '2. Johannes', category: 'Katholische Briefe' },
    { name: '3. Johannes', category: 'Katholische Briefe' },
    { name: 'Judas', category: 'Katholische Briefe' },
    
    // Offenbarung
    { name: 'Offenbarung', category: 'Prophetie' },
  ];

  const handleBookPress = (bookName) => {
    // Schließe die Suche, wenn ein Buch angeklickt wird
    if (isSearchVisible) {
      setIsSearchVisible(false);
      setSearchQuery('');
      setSearchResults([]);
      Keyboard.dismiss();
    }
    
    // Schließe Translation Dropdown
    setShowTranslationDropdown(false);
    
    const currentTranslation = translations.find(t => t.name === selectedTranslation);
    const databaseBookName = getDatabaseBookName(bookName, currentTranslation?.table || 'bibelverse');
    console.log(`Book clicked: "${bookName}" -> Database name: "${databaseBookName}"`);
    navigation.navigate('BibelContent', { 
      bookName: databaseBookName,
      displayName: bookName,
      translationTable: currentTranslation?.table || 'bibelverse'
    });
  };

  const handleSearchPress = () => {
    setIsSearchVisible(!isSearchVisible);
    if (!isSearchVisible) {
      // Wenn Suche geöffnet wird, fokussiere das Eingabefeld
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      // Wenn Suche geschlossen wird, leere die Suche und schließe Keyboard
      setSearchQuery('');
      setSearchResults([]);
      Keyboard.dismiss();
    }
  };

  const performSearch = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = [];
      
      // 1. Suche in Büchern (lokale Suche)
      const allBooks = [...oldTestamentBooks, ...newTestamentBooks];
      const bookMatches = allBooks.filter(book => 
        book.name.toLowerCase().includes(query.toLowerCase())
      );
      
      bookMatches.forEach(book => {
        results.push({
          type: 'book',
          title: book.name,
          subtitle: `Buch aus ${book.category}`,
          bookName: book.name,
          icon: 'book-outline'
        });
      });

      // 2. Suche in Versen (Datenbank-Suche) - verwende die aktuelle Übersetzung
      const currentTranslation = translations.find(t => t.name === selectedTranslation);
      const tableName = currentTranslation?.table || 'bibelverse';
      
      const { data: verseResults, error } = await supabase
        .from(tableName)
        .select('buch, kapitel, vers, text')
        .ilike('text', `%${query}%`)
        .limit(10);

      if (!error && verseResults) {
        verseResults.forEach(verse => {
          // Finde den Display-Namen für das Buch
          const displayBook = allBooks.find(book => 
            getDatabaseBookName(book.name, tableName) === verse.buch
          );
          
          results.push({
            type: 'verse',
            title: `${displayBook?.name || verse.buch} ${verse.kapitel}:${verse.vers}`,
            subtitle: verse.text.length > 80 ? verse.text.substring(0, 80) + '...' : verse.text,
            bookName: displayBook?.name || verse.buch,
            chapter: verse.kapitel,
            verse: verse.vers,
            icon: 'document-text-outline'
          });
        });
      }

      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchResultPress = (result) => {
    const currentTranslation = translations.find(t => t.name === selectedTranslation);
    const databaseBookName = getDatabaseBookName(result.bookName, currentTranslation?.table || 'bibelverse');
    
    if (result.type === 'book') {
      // Navigiere zum Buch (Kapitel 1)
      navigation.navigate('BibelContent', { 
        bookName: databaseBookName,
        displayName: result.bookName,
        translationTable: currentTranslation?.table || 'bibelverse'
      });
    } else if (result.type === 'verse') {
      // Navigiere zum spezifischen Kapitel und Vers
      navigation.navigate('BibelContent', { 
        bookName: databaseBookName,
        displayName: result.bookName,
        initialChapter: result.chapter,
        highlightVerse: result.verse,
        translationTable: currentTranslation?.table || 'bibelverse'
      });
    }
    
    // Suche schließen
    setIsSearchVisible(false);
    setSearchQuery('');
    setSearchResults([]);
    Keyboard.dismiss();
  };

  const handleTranslationPress = () => {
    if (!isSearchVisible) {
      setShowTranslationDropdown(!showTranslationDropdown);
    }
  };

  const handleTranslationSelect = (translation) => {
    setSelectedTranslation(translation.name);
    setShowTranslationDropdown(false);
    // Suche zurücksetzen, wenn eine neue Übersetzung ausgewählt wird
    if (searchQuery) {
      performSearch(searchQuery);
    }
  };

  const renderSearchResult = ({ item }) => (
    <TouchableOpacity
      style={[styles.searchResultItem, { backgroundColor: colors.cardBackground }]}
      onPress={() => handleSearchResultPress(item)}
    >
      <Ionicons 
        name={item.icon} 
        size={20} 
        color={colors.primary} 
        style={styles.searchResultIcon}
      />
      <View style={styles.searchResultText}>
        <Text style={[styles.searchResultTitle, { color: colors.text }]}>
          {item.title}
        </Text>
        <Text style={[styles.searchResultSubtitle, { color: colors.textSecondary }]}>
          {item.subtitle}
        </Text>
      </View>
      <Ionicons 
        name="chevron-forward" 
        size={16} 
        color={colors.textSecondary}
      />
    </TouchableOpacity>
  );

  // Debounced search
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchQuery) {
        performSearch(searchQuery);
      }
    }, 500);

    return () => clearTimeout(delayedSearch);
  }, [searchQuery]);

  const renderBookGrid = (books, title) => (
    <View style={styles.testamentSection}>
      <Text style={[styles.testamentTitle, { color: colors.primary }]}>{title}</Text>
      <View style={styles.booksGrid}>
        {books.map((book, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.bookButton, { backgroundColor: colors.cardBackground }]}
            onPress={() => handleBookPress(book.name)}
          >
            <ScrollingText
              text={book.name}
              style={[styles.bookText, { color: colors.primary }]}
              maxWidth={width * 0.4}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Translation Selector OR Search Input */}
      <View style={styles.controlsRow}>
        {isSearchVisible ? (
          <View style={[styles.searchInputContainer, { backgroundColor: colors.cardBackground }]}>
            <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Suche in Büchern und Texten..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity 
            style={[styles.translationSelector, { backgroundColor: colors.cardBackground }]}
            onPress={handleTranslationPress}
          >
            <Text style={[styles.translationText, { color: colors.primary }]}>
              {selectedTranslation}
            </Text>
            <Ionicons name="chevron-down" size={20} color={colors.primary} />
          </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          style={[styles.searchButton, { backgroundColor: colors.cardBackground }]}
          onPress={handleSearchPress}
        >
          <Ionicons 
            name={isSearchVisible ? "close" : "search"} 
            size={20} 
            color={colors.primary} 
          />
        </TouchableOpacity>
      </View>

      {/* Translation Dropdown */}
      {showTranslationDropdown && !isSearchVisible && (
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
              <Text 
                style={[
                  styles.translationOptionText, 
                  { color: selectedTranslation === translation.name ? colors.primary : colors.text }
                ]}
              >
                {translation.name}
              </Text>
              {selectedTranslation === translation.name && (
                <Ionicons name="checkmark" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Search Results - Full Screen Overlay */}
      {isSearchVisible && (
        <View style={[styles.searchResultsOverlay, { backgroundColor: colors.background }]}>
          {isSearching ? (
            <View style={styles.searchLoadingContainer}>
              <Text style={[styles.searchLoadingText, { color: colors.textSecondary }]}>
                Suche läuft...
              </Text>
            </View>
          ) : searchResults.length > 0 ? (
            <FlatList
              data={searchResults}
              renderItem={renderSearchResult}
              keyExtractor={(item, index) => `${item.type}-${index}`}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.searchResultsContent}
            />
          ) : searchQuery.length > 0 ? (
            <View style={styles.searchLoadingContainer}>
              <Text style={[styles.searchLoadingText, { color: colors.textSecondary }]}>
                Keine Ergebnisse gefunden
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Books List - Hidden when search is visible */}
      {!isSearchVisible && (
        <TouchableOpacity 
          style={styles.scrollView} 
          activeOpacity={1}
          onPress={() => setShowTranslationDropdown(false)}
        >
          <ScrollView 
            showsVerticalScrollIndicator={false}
            onScrollBeginDrag={() => setShowTranslationDropdown(false)}
          >
            {renderBookGrid(oldTestamentBooks, 'Altes Testament')}
            {renderBookGrid(newTestamentBooks, 'Neues Testament')}
            <View style={{ height: 100 }} />
          </ScrollView>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 20,
    gap: 15,
  },
  translationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 25,
  },
  translationText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_500Medium',
    marginRight: 10,
    flex: 1,
  },
  searchButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  testamentSection: {
    marginBottom: 30,
  },
  testamentTitle: {
    fontSize: normalize(20),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    marginBottom: 15,
  },
  booksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  bookButton: {
    width: '48%',
    padding: normalize(12),
    borderRadius: 50,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  bookText: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_500Medium',
    textAlign: 'center',
    fontWeight: '500',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 25,
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
  searchResultsOverlay: {
    flex: 1,
    paddingHorizontal: 20,
  },
  searchResultsContent: {
    paddingTop: 10,
    paddingBottom: 100,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    marginVertical: 2,
    borderRadius: 10,
  },
  searchResultIcon: {
    marginRight: 12,
  },
  searchResultText: {
    flex: 1,
  },
  searchResultTitle: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_500Medium',
    fontWeight: '500',
    marginBottom: 2,
  },
  searchResultSubtitle: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_400Regular',
    lineHeight: 18,
  },
  searchLoadingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchLoadingText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
  },
  translationDropdown: {
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
});

export default BibelScreen;
