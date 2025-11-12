import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Dimensions, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import BibelScreen from './BibelScreen';
import VaeterScreen from './VaeterScreen';
import KonzileScreen from './KonzileScreen';

const { width, height } = Dimensions.get('window');
const scale = width / 320; // Base width for scaling

const normalize = (size) => {
  const newSize = size * scale;
  return Math.round(newSize);
};

const SchriftenScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const scrollViewRef = useRef(null);

  const tabs = [
    { id: 0, name: 'Bibel', component: BibelScreen },
    { id: 1, name: 'Kirchenvaeter', component: VaeterScreen },
    { id: 2, name: 'Konzile', component: KonzileScreen },
    { id: 3, name: 'Lehrer' },
    { id: 4, name: 'Papst' },
    { id: 5, name: 'Katechismus' },
    { id: 6, name: 'Heilige' },
    { id: 7, name: 'Liturgie' },
    { id: 8, name: 'Theologie' },
    { id: 9, name: 'Recht' },
  ];

  const handleTabPress = (tabId) => {
    setActiveTab(tabId);
    // Scroll tab into view
    if (scrollViewRef.current) {
      const tabWidth = 100; // Approximate tab width
      const scrollPosition = tabId * tabWidth - width / 2 + tabWidth / 2;
      scrollViewRef.current.scrollTo({ x: Math.max(0, scrollPosition), animated: true });
    }
  };

  const renderTabContent = () => {
    const activeTabData = tabs.find(tab => tab.id === activeTab);
    
    if (activeTabData?.component) {
      const Component = activeTabData.component;
      // Pass showHeader=false to VaeterScreen to prevent double header
      const props = { navigation };
      if (Component === VaeterScreen) {
        props.showHeader = false;
      }
      return <Component {...props} />;
    }
    
    return (
      <View style={styles.comingSoonContainer}>
        <Ionicons name="book-outline" size={80} color={colors.cardBackground} />
        <Text style={[styles.comingSoonTitle, { color: colors.primary }]}>
          {activeTabData?.name}
        </Text>
        <Text style={[styles.comingSoonText, { color: colors.textSecondary }]}>
          Wird bald verfuegbar sein
        </Text>
      </View>
    );
  };

  // Get the current header title
  const getHeaderTitle = () => {
    const activeTabData = tabs.find(tab => tab.id === activeTab);
    return activeTabData?.name || 'Schriften';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      
      {/* Header with extended background */}
      <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.white }]}>{getHeaderTitle()}</Text>
          </View>
        </SafeAreaView>
      </View>

      {/* Tab Navigation */}
      <View style={[styles.tabContainer, { backgroundColor: colors.background }]}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollContainer}
        >
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tab,
                { backgroundColor: activeTab === tab.id ? colors.primary : colors.cardBackground }
              ]}
              onPress={() => handleTabPress(tab.id)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === tab.id ? colors.white : colors.primary }
                ]}
              >
                {tab.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {renderTabContent()}
      </View>
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
  tabContainer: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  tabScrollContainer: {
    paddingHorizontal: 20,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  tabText: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_500Medium',
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  comingSoonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  comingSoonTitle: {
    fontSize: normalize(24),
    fontFamily: 'Montserrat_600SemiBold',
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  comingSoonText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
  },
});

export default SchriftenScreen;



