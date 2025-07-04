import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Dimensions, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');
const scale = width / 320; // Base width for scaling

const normalize = (size) => {
  const newSize = size * scale;
  return Math.round(newSize);
};

// Function to get current date in German format
const getCurrentDateString = () => {
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  
  const now = new Date();
  const dayName = days[now.getDay()];
  const day = now.getDate();
  const month = months[now.getMonth()];
  
  return `${dayName}, ${day}. ${month}`;
};

// Function to get time-based greeting
const getTimeBasedGreeting = () => {
  const now = new Date();
  const hour = now.getHours();
  
  if (hour >= 5 && hour < 12) {
    return 'Guten Morgen';
  } else if (hour >= 12 && hour < 17) {
    return 'Guten Tag';
  } else if (hour >= 17 && hour < 22) {
    return 'Guten Abend';
  } else {
    return 'Gute Nacht';
  }
};

// Function to fetch liturgical data from API
const fetchLiturgicalData = async () => {
  try {
    // Use tag=0 to get today's data (API uses 0 for current day)
    const response = await fetch(`https://www.eucharistiefeier.de/lk/api.php?format=json&tag=0&info=wtbem&mg=0`);
    const data = await response.json();
    
    console.log('API Response:', data); // Debug log
    
    if (data.Zelebrationen && Object.keys(data.Zelebrationen).length > 0) {
      // Get all celebrations and take the LAST one (most important)
      const celebrations = Object.values(data.Zelebrationen);
      const lastCelebration = celebrations[celebrations.length - 1];
      
      console.log('All celebrations:', celebrations); // Debug log
      console.log('Selected (last) celebration:', lastCelebration); // Debug log
      
      if (lastCelebration) {
        return {
          title: lastCelebration.Tl || 'Liturgischer Kalender',
          subtitle: lastCelebration.Bem || '',
          allCelebrations: celebrations
        };
      }
    }
    
    // Fallback: try to get data with different parameters
    const fallbackResponse = await fetch(`https://www.eucharistiefeier.de/lk/api.php?format=json&tag=0&info=wdt`);
    const fallbackData = await fallbackResponse.json();
    
    console.log('Fallback API Response:', fallbackData); // Debug log
    
    if (fallbackData.Zelebrationen && Object.keys(fallbackData.Zelebrationen).length > 0) {
      const celebrations = Object.values(fallbackData.Zelebrationen);
      const lastCelebration = celebrations[celebrations.length - 1];
      
      return {
        title: lastCelebration?.Tl || 'Liturgischer Kalender',
        subtitle: lastCelebration?.Bem || '',
        allCelebrations: celebrations
      };
    }
    
    return { title: 'Liturgischer Kalender', subtitle: '', allCelebrations: [] };
  } catch (error) {
    console.error('Error fetching liturgical data:', error);
    return { title: 'Liturgischer Kalender', subtitle: '', allCelebrations: [] };
  }
};

const HomeScreen = ({ slideAnim }) => {
  const { colors } = useTheme(); // Use dynamic colors
  const [liturgicalData, setLiturgicalData] = useState({
    title: 'Liturgischer Kalender',
    subtitle: '',
    allCelebrations: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const loadLiturgicalData = async () => {
      setIsLoading(true);
      const data = await fetchLiturgicalData();
      setLiturgicalData(data);
      setIsLoading(false);
    };

    loadLiturgicalData();
  }, []);

  // Create dynamic styles using the colors from theme context
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerBackground: {
      backgroundColor: colors.primary,
      paddingTop: 0,
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
    },
    headerSafeArea: {
      backgroundColor: 'transparent',
    },
    header: {
      paddingHorizontal: 20,
      paddingVertical: normalize(10),
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    headerContent: {
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: normalize(30),
      fontWeight: 'bold',
      color: colors.white,
      fontFamily: 'Montserrat_700Bold',
    },
    headerSubtitle: {
      fontSize: normalize(16),
      fontFamily: 'Montserrat_400Regular',
      marginTop: 4,
      color: colors.white,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
    scrollContent: {
      paddingBottom: 100,
    },
    dateCard: {
      backgroundColor: colors.cardBackground,
      padding: normalize(16),
      borderRadius: 15,
      marginTop: normalize(20),
      marginBottom: normalize(25),
      alignItems: 'center',
    },
    dateText: {
      fontSize: normalize(20),
      fontWeight: '600',
      color: colors.primary,
      fontFamily: 'Montserrat_600SemiBold',
      marginBottom: normalize(6),
      textAlign: 'center',
    },
    eventText: {
      fontSize: normalize(14),
      color: colors.primary,
      fontFamily: 'Montserrat_400Regular',
      lineHeight: normalize(16),
      textAlign: 'center',
    },
    expandButton: {
      marginTop: normalize(6),
      padding: normalize(4),
      alignItems: 'center',
      justifyContent: 'center',
    },
    additionalCelebrations: {
      marginTop: normalize(15),
      paddingTop: normalize(15),
      borderTopWidth: 1,
      borderTopColor: colors.primary,
      opacity: 0.7,
      width: '100%',
    },
    additionalCelebration: {
      marginBottom: normalize(12),
    },
    additionalCelebrationText: {
      fontSize: normalize(12),
      color: colors.primary,
      fontFamily: 'Montserrat_400Regular',
      lineHeight: normalize(16),
      textAlign: 'center',
      opacity: 0.8,
    },
    section: {
      marginBottom: normalize(35),
    },
    sectionTitle: {
      fontSize: normalize(20),
      fontWeight: '600',
      color: colors.primary,
      fontFamily: 'Montserrat_600SemiBold',
      marginBottom: normalize(20),
    },
    menuItem: {
      backgroundColor: colors.cardBackground,
      padding: normalize(22),
      borderRadius: 12,
      marginBottom: normalize(15),
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    menuItemText: {
      fontSize: normalize(16),
      color: colors.primary,
      fontFamily: 'Montserrat_500Medium',
    },
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      
      {/* Header with extended background */}
      <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              {/* Morphing Header Text */}
              <Animated.Text 
                style={[
                  styles.headerTitle,
                  { color: colors.white },
                  {
                    opacity: slideAnim ? slideAnim.interpolate({
                      inputRange: [0, 0.3, 1],
                      outputRange: [1, 0, 0],
                    }) : 1
                  }
                ]}
              >
                Home
              </Animated.Text>
              
              <Animated.Text 
                style={[
                  styles.headerSubtitle,
                  { color: colors.white },
                  {
                    opacity: slideAnim ? slideAnim.interpolate({
                      inputRange: [0, 0.3, 1],
                      outputRange: [1, 0, 0],
                    }) : 1
                  }
                ]}
              >
                {getTimeBasedGreeting()}
              </Animated.Text>
              
              {/* Settings Header Text */}
              {slideAnim && (
                <Animated.Text 
                  style={[
                    styles.headerTitle,
                    { color: colors.white },
                    {
                      position: 'absolute',
                      opacity: slideAnim.interpolate({
                        inputRange: [0, 0.3, 1],
                        outputRange: [0, 0, 1],
                      }),
                    }
                  ]}
                >
                  Einstellungen
                </Animated.Text>
              )}
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* Content */}
      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={isExpanded}
      >
        {/* Date Card */}
        <View style={[styles.dateCard, { backgroundColor: colors.cardBackground }]}>
          <Text style={[styles.dateText, { color: colors.primary }]}>{getCurrentDateString()}</Text>
          {isLoading ? (
            <Text style={[styles.eventText, { color: colors.primary }]}>Lade liturgische Daten...</Text>
          ) : (
            <>
              <Text style={[styles.eventText, { color: colors.primary }]}>
                {liturgicalData.title}
                {liturgicalData.subtitle && `\n${liturgicalData.subtitle}`}
              </Text>
              
              {/* Expand button - only show if there are multiple celebrations */}
              {liturgicalData.allCelebrations.length > 1 && (
                <TouchableOpacity 
                  style={styles.expandButton}
                  onPress={() => setIsExpanded(!isExpanded)}
                >
                  <Ionicons 
                    name={isExpanded ? "chevron-up" : "chevron-down"} 
                    size={20} 
                    color={colors.primary} 
                  />
                </TouchableOpacity>
              )}
              
              {/* Additional celebrations - show when expanded */}
              {isExpanded && liturgicalData.allCelebrations.length > 1 && (
                <View style={[styles.additionalCelebrations, { borderTopColor: colors.primary }]}>
                  {liturgicalData.allCelebrations.slice(0, -1).map((celebration, index) => (
                    <View key={index} style={styles.additionalCelebration}>
                      <Text style={[styles.additionalCelebrationText, { color: colors.primary }]}>
                        {celebration.Tl}
                        {celebration.Bem && `\n${celebration.Bem}`}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* Daily Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Täglich</Text>
          
          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.menuItemText, { color: colors.primary }]}>Stundengebet</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.menuItemText, { color: colors.primary }]}>Tagesevangelium</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, { backgroundColor: colors.cardBackground }]}>
            <Text style={[styles.menuItemText, { color: colors.primary }]}>Täglicher Rosenkranz</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

export default HomeScreen;
