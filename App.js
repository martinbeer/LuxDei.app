import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import HomeScreen from './screens/HomeScreen';
import SchriftenScreen from './screens/SchriftenScreen';
import GebetScreen from './screens/GebetScreen';
import ChatScreen from './screens/ChatScreen';
import KircheScreen from './screens/KircheScreen';
import { Colors } from './constants/colors';

const Tab = createBottomTabNavigator();

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
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
              }

              return <Ionicons name="home" size={iconSize} color={color} />;
            },
            tabBarActiveTintColor: Colors.primary,
            tabBarInactiveTintColor: Colors.cardBackground,
            tabBarStyle: {
              backgroundColor: Colors.white,
              paddingBottom: 15,
              paddingTop: 15,
              height: 85,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderTopWidth: 3,
              borderLeftWidth: 3,
              borderRightWidth: 3,
              borderColor: Colors.cardBackground,
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
          <Tab.Screen name="Home" component={HomeScreen} />
          <Tab.Screen name="Schriften" component={SchriftenScreen} />
          <Tab.Screen name="Gebet" component={GebetScreen} />
          <Tab.Screen name="Chat" component={ChatScreen} />
          <Tab.Screen name="Kirche" component={KircheScreen} />
        </Tab.Navigator>
      </View>
    </NavigationContainer>
  );
}
