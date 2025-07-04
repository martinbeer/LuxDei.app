import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

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
  const [selectedTranslation, setSelectedTranslation] = useState('Einheitsübersetzung');

  const translations = [
    'Einheitsübersetzung',
    'Luther 2017',
    'Elberfelder',
    'Schlachter 2000',
    'Neue Genfer',
    'Hoffnung für alle'
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

  const renderBookGrid = (books, title) => (
    <View style={styles.testamentSection}>
      <Text style={[styles.testamentTitle, { color: colors.primary }]}>{title}</Text>
      <View style={styles.booksGrid}>
        {books.map((book, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.bookButton, { backgroundColor: colors.cardBackground }]}
            onPress={() => console.log(`Selected: ${book.name}`)}
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
      {/* Translation Selector and Search as separate elements */}
      <View style={styles.controlsRow}>
        <TouchableOpacity style={[styles.translationSelector, { backgroundColor: colors.cardBackground }]}>
          <Text style={[styles.translationText, { color: colors.primary }]}>
            {selectedTranslation}
          </Text>
          <Ionicons name="chevron-down" size={20} color={colors.primary} />
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.searchButton, { backgroundColor: colors.cardBackground }]}>
          <Ionicons name="search" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Books List */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {renderBookGrid(oldTestamentBooks, 'Altes Testament')}
        {renderBookGrid(newTestamentBooks, 'Neues Testament')}
        <View style={{ height: 100 }} />
      </ScrollView>
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
});

export default BibelScreen;
