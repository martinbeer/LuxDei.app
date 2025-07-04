import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, StatusBar, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');
const scale = width / 320; // Base width for scaling

const normalize = (size) => {
  const newSize = size * scale;
  return Math.round(newSize);
};

const SettingsScreen = ({ navigation, onClose, hideHeader }) => {
  const { colors, isDarkMode, selectedColor, toggleTheme, changeColor, ColorPalette } = useTheme();

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (navigation) {
      navigation.goBack();
    }
  };

  // Color selection component
  const ColorSelector = () => (
    <View style={[styles.settingItem, { backgroundColor: colors.cardBackground, flexDirection: 'column', alignItems: 'flex-start' }]}>
      <View style={styles.settingItemLeft}>
        <Ionicons name="color-palette" size={20} color={colors.primary} />
        <Text style={[styles.settingItemText, { color: colors.primary }]}>Farbschema</Text>
      </View>
      <View style={styles.colorGrid}>
        {Object.entries(ColorPalette).map(([key, theme]) => (
          <TouchableOpacity 
            key={key}
            style={[
              styles.colorOption,
              { backgroundColor: theme.light.primary },
              selectedColor === key && { borderWidth: 3, borderColor: colors.white }
            ]}
            onPress={() => changeColor(key)}
          >
            <View style={[styles.colorInner, { backgroundColor: theme.light.primary }]} />
            {selectedColor === key && (
              <Ionicons name="checkmark" size={16} color={colors.white} style={styles.checkmark} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!hideHeader && (
        <>
          <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
          
          {/* Header with extended background */}
          <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
            <SafeAreaView style={styles.headerSafeArea}>
              <View style={styles.header}>
                <TouchableOpacity 
                  style={styles.backButton}
                  onPress={handleClose}
                >
                  <Ionicons name="arrow-back" size={24} color={colors.white} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.white }]}>Einstellungen</Text>
                <View style={styles.placeholder} />
              </View>
            </SafeAreaView>
          </View>
        </>
      )}

      {/* Content */}
      <View style={[styles.content, hideHeader && { flex: 1, paddingTop: 10 }]}>
        <View style={styles.settingsGroup}>
          <Text style={[styles.groupTitle, { color: colors.primary }]}>Personalisierung</Text>
          
          <View style={[styles.settingItem, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.settingItemLeft}>
              <Ionicons name="moon" size={20} color={colors.primary} />
              <Text style={[styles.settingItemText, { color: colors.primary }]}>Dark Mode</Text>
            </View>
            <Switch 
              value={isDarkMode} 
              onValueChange={toggleTheme}
              trackColor={{ false: '#767577', true: colors.primary }}
              thumbColor={isDarkMode ? colors.white : '#f4f3f4'}
            />
          </View>

          <ColorSelector />
        </View>

        {/* More Settings */}
        <View style={styles.settingsGroup}>
          <Text style={[styles.groupTitle, { color: colors.primary }]}>Allgemein</Text>
          
          <TouchableOpacity style={[styles.settingItem, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.settingItemLeft}>
              <Ionicons name="notifications" size={20} color={colors.primary} />
              <Text style={[styles.settingItemText, { color: colors.primary }]}>Benachrichtigungen</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingItem, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.settingItemLeft}>
              <Ionicons name="language" size={20} color={colors.primary} />
              <Text style={[styles.settingItemText, { color: colors.primary }]}>Sprache</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.settingItem, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.settingItemLeft}>
              <Ionicons name="help-circle" size={20} color={colors.primary} />
              <Text style={[styles.settingItemText, { color: colors.primary }]}>Hilfe & Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
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
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  headerSafeArea: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: normalize(10),
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: normalize(20),
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  settingsGroup: {
    marginBottom: 30,
  },
  groupTitle: {
    fontSize: normalize(18),
    fontWeight: '600',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 15,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: normalize(20),
    borderRadius: 18,
    marginBottom: 10,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingItemText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_500Medium',
    marginLeft: 12,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    marginTop: 15,
    paddingHorizontal: 5,
    justifyContent: 'space-between',
  },
  colorOption: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    marginHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  colorInner: {
    width: 27,
    height: 27,
    borderRadius: 13.5,
  },
  checkmark: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -8,
    marginLeft: -8,
  },
});

export default SettingsScreen;