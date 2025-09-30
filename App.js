import React, { useRef, useState, useEffect } from 'react';
import { View, TouchableOpacity, Dimensions, Text } from 'react-native';
import { NavigationContainer, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import * as SplashScreen from 'expo-splash-screen';

import HomeScreen from './screens/HomeScreen';
import SchriftenScreen from './screens/SchriftenScreen';
import GebetScreen from './screens/GebetScreen';
import GebetDetailScreen from './screens/GebetDetailScreen';
import RosenkranzScreen from './screens/RosenkranzScreen';
import RosenkranzTutorialScreen from './screens/RosenkranzTutorialScreen';
import ChatScreen from './screens/ChatScreen';
import KircheScreen from './screens/KircheScreen';
import SettingsScreen from './screens/SettingsScreen';
import BibelContentScreen from './screens/BibelContentScreen';
import TageslesungenScreen from './screens/TageslesungenScreen';
import StundengebetScreen from './screens/StundengebetScreen';
import HourDetailScreen from './screens/HourDetailScreen';
import VäterScreen from './screens/VäterScreen';
import KirchenvaterDetailScreen from './screens/KirchenvaterDetailScreen';
import KirchenvaterTextScreen from './screens/KirchenvaterTextScreen';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import supabaseImageManager from './utils/supabaseImageManager';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const { height } = Dimensions.get('window');

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Home Stack Navigator
function HomeStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Tageslesungen" component={TageslesungenScreen} />
  <Stack.Screen name="Stundengebet" component={StundengebetScreen} />
      <Stack.Screen name="HourDetail" component={HourDetailScreen} />
      <Stack.Screen name="BibelContent" component={BibelContentScreen} />
    </Stack.Navigator>
  );
}

// Schriften Stack Navigator
function SchriftenStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SchriftenMain" component={SchriftenScreen} />
      <Stack.Screen name="BibelContent" component={BibelContentScreen} />
      <Stack.Screen name="Väter" component={VäterScreen} />
      <Stack.Screen name="KirchenvaterDetail" component={KirchenvaterDetailScreen} />
      <Stack.Screen name="KirchenvaterText" component={KirchenvaterTextScreen} />
    </Stack.Navigator>
  );
}

// Gebet Stack Navigator
function GebetStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GebetMain" component={GebetScreen} />
      <Stack.Screen name="GebetDetail" component={GebetDetailScreen} />
  <Stack.Screen name="Rosenkranz" component={RosenkranzScreen} />
  <Stack.Screen name="RosenkranzTutorial" component={RosenkranzTutorialScreen} />
  <Stack.Screen name="Stundengebet" component={StundengebetScreen} />
      <Stack.Screen name="HourDetail" component={HourDetailScreen} />
    </Stack.Navigator>
  );
}

// Main Tab Navigator  
function MainTabNavigator() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            const iconSize = 24;

            if (route.name === 'Home') {
              return <Ionicons name="home" size={iconSize} color={color} />;
            } else if (route.name === 'Schriften') {
              return <Ionicons name="book" size={iconSize} color={color} />;
            } else if (route.name === 'Gebet') {
              return <FontAwesome5 name="praying-hands" size={iconSize} color={color} solid />;
            } else if (route.name === 'Chat') {
              return <Ionicons name="chatbubble" size={iconSize} color={color} />;
            } else if (route.name === 'Kirche') {
              return <FontAwesome5 name="church" size={iconSize} color={color} solid />;
            } else if (route.name === 'Settings') {
              return <Ionicons name="settings" size={iconSize} color={color} />;
            }

            return <Ionicons name="home" size={iconSize} color={color} />;
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.cardBackground,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            paddingBottom: 15,
            paddingTop: 15,
            height: 85,
            borderTopLeftRadius: 25,
            borderTopRightRadius: 25,
            borderTopWidth: 3,
            borderLeftWidth: 3,
            borderRightWidth: 3,
            borderColor: colors.cardBackground,
            borderBottomWidth: 0,
            shadowOpacity: 0,
            elevation: 0,
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
          },
          tabBarShowLabel: false,
          headerShown: false,
        })}
      >
        <Tab.Screen name="Home" component={HomeStackNavigator} />
        <Tab.Screen name="Schriften" component={SchriftenStackNavigator} />
        <Tab.Screen
          name="Gebet"
          component={GebetStackNavigator}
          options={({ route }) => {
            const routeName = getFocusedRouteNameFromRoute(route) ?? 'GebetMain';
            const baseStyle = {
              backgroundColor: colors.tabBar,
              paddingBottom: 15,
              paddingTop: 15,
              height: 85,
              borderTopLeftRadius: 25,
              borderTopRightRadius: 25,
              borderTopWidth: 3,
              borderLeftWidth: 3,
              borderRightWidth: 3,
              borderColor: colors.cardBackground,
              borderBottomWidth: 0,
              shadowOpacity: 0,
              elevation: 0,
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
            };
            return {
              tabBarStyle: [
                baseStyle,
                routeName === 'GebetDetail' && { display: 'none' },
              ],
            };
          }}
        />
        <Tab.Screen name="Chat" component={ChatScreen} />
        <Tab.Screen name="Kirche" component={KircheScreen} />
        <Tab.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={{
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name="settings" size={24} color={color} />
            ),
          }}
        />
      </Tab.Navigator>

    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  useEffect(() => {
    const initializeApp = async () => {
      if (fontsLoaded) {
        // Starte Supabase Image Loading im Hintergrund
        console.log('🚀 App gestartet - Lade Bilder von Supabase...');
        
        setTimeout(async () => {
          try {
            await supabaseImageManager.loadAllImages();
            const stats = supabaseImageManager.getStats();
            console.log(`📊 Supabase Images: ${stats.totalImages} Bilder geladen`);
          } catch (error) {
            console.error('❌ Fehler beim Laden der Supabase-Bilder:', error);
          }
        }, 500); // Kurze Verzögerung für bessere Performance
        
        SplashScreen.hideAsync();
      }
    };

    initializeApp();
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <MainTabNavigator />
      </NavigationContainer>
    </ThemeProvider>
  );
}
