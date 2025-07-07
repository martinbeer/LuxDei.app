import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightColors, DarkColors, ColorPalette } from '../constants/colors';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [selectedColor, setSelectedColor] = useState('blue');
  const [isLoading, setIsLoading] = useState(true);

  // Load theme preference from storage
  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('isDarkMode');
      const savedColor = await AsyncStorage.getItem('selectedColor');
      
      if (savedTheme !== null) {
        setIsDarkMode(JSON.parse(savedTheme));
      }
      if (savedColor !== null) {
        setSelectedColor(savedColor);
      }
    } catch (error) {
      console.error('Error loading theme preference:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTheme = async () => {
    try {
      const newTheme = !isDarkMode;
      setIsDarkMode(newTheme);
      await AsyncStorage.setItem('isDarkMode', JSON.stringify(newTheme));
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const changeColor = async (colorKey) => {
    try {
      setSelectedColor(colorKey);
      await AsyncStorage.setItem('selectedColor', colorKey);
    } catch (error) {
      console.error('Error saving color preference:', error);
    }
  };

  // Dynamically select colors based on theme and color selection
  const getColors = () => {
    try {
      const colorTheme = ColorPalette[selectedColor];
      if (colorTheme) {
        return isDarkMode ? colorTheme.dark : colorTheme.light;
      }
      // Fallback to default blue theme
      return isDarkMode ? DarkColors : LightColors;
    } catch (error) {
      console.error('Error in getColors:', error);
      // Safe fallback
      return LightColors;
    }
  };

  const colors = getColors();

  const value = {
    isDarkMode,
    selectedColor,
    colors,
    toggleTheme,
    changeColor,
    isLoading,
    ColorPalette,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};