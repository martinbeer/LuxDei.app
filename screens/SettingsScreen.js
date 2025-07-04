import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');
const scale = width / 320; // Base width for scaling

const normalize = (size) => {
  const newSize = size * scale;
  return Math.round(newSize);
};

const SettingsScreen = ({ navigation }) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      
      {/* Header with extended background */}
      <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color={colors.white} />
            </TouchableOpacity>
            
            <View style={styles.headerContent}>
              <Text style={[styles.headerTitle, { color: colors.white }]}>Einstellungen</Text>
              <Text style={[styles.headerSubtitle, { color: colors.white }]}>Personalisierung</Text>
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.settingsSection}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Einstellungen</Text>
          
          <View style={[styles.settingItem, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.settingItemContent}>
              <Text style={[styles.settingItemTitle, { color: colors.text }]}>Über die App</Text>
              <Text style={[styles.settingItemDescription, { color: colors.textSecondary }]}>
                LuxDei - Ihre katholische Begleiter-App
              </Text>
            </View>
          </View>
        </View>
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
    fontFamily: 'Montserrat_700Bold',
  },
  headerSubtitle: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    marginTop: 4,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    top: normalize(15),
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: normalize(25),
  },
  settingsSection: {
    marginBottom: normalize(30),
  },
  sectionTitle: {
    fontSize: normalize(20),
    fontWeight: '600',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: normalize(20),
  },
  settingItem: {
    padding: normalize(20),
    borderRadius: 15,
    marginBottom: normalize(15),
  },
  settingItemContent: {
    flex: 1,
  },
  settingItemTitle: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: normalize(4),
  },
  settingItemDescription: {
    fontSize: normalize(13),
    fontFamily: 'Montserrat_400Regular',
    opacity: 0.8,
  },
});

export default SettingsScreen;
