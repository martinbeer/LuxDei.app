import React, { useRef, useState, useEffect } from 'react';
import { View, TouchableOpacity, Dimensions, PanResponder, Animated, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import * as SplashScreen from 'expo-splash-screen';

import HomeScreen from './screens/HomeScreen';
import SchriftenScreen from './screens/SchriftenScreen';
import GebetScreen from './screens/GebetScreen';
import ChatScreen from './screens/ChatScreen';
import KircheScreen from './screens/KircheScreen';
import SettingsScreen from './screens/SettingsScreen';
import BibelContentScreen from './screens/BibelContentScreen';
import { ThemeProvider, useTheme } from './context/ThemeContext';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const { height } = Dimensions.get('window');

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Home Stack Navigator
function HomeStackNavigator({ slideAnim }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain">
        {(props) => <HomeScreen {...props} slideAnim={slideAnim} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

// Schriften Stack Navigator
function SchriftenStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SchriftenMain" component={SchriftenScreen} />
      <Stack.Screen name="BibelContent" component={BibelContentScreen} />
    </Stack.Navigator>
  );
}

// Main Tab Navigator
function MainTabNavigator() {
  const { colors } = useTheme(); // Use dynamic colors
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const lastGestureY = useRef(0);

  // Create PanResponder for interactive drag
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Respond to any significant movement
      return Math.abs(gestureState.dy) > 5;
    },
    onPanResponderGrant: (evt, gestureState) => {
      // User started dragging
      if (!isSettingsVisible) {
        setIsSettingsVisible(true);
      }
      // Stop any ongoing animation and store starting position
      slideAnim.stopAnimation();
      lastGestureY.current = 0;
    },
    onPanResponderMove: (evt, gestureState) => {
      // Follow the finger movement smoothly in both directions
      const maxDrag = height - 180; // Leave space for header
      
      // Calculate movement delta since last frame
      const movementDelta = gestureState.dy - lastGestureY.current;
      lastGestureY.current = gestureState.dy;
      
      // Get current animation value and convert to position
      const currentValue = slideAnim._value;
      const currentPosition = currentValue * maxDrag;
      
      // Calculate new position (negative movement = up, positive = down)
      const newPosition = Math.max(0, Math.min(maxDrag, currentPosition - movementDelta));
      const progress = newPosition / maxDrag;
      
      // Update animation value to follow finger smoothly
      slideAnim.setValue(progress);
    },
    onPanResponderRelease: (evt, gestureState) => {
      const velocity = gestureState.vy;
      const currentValue = slideAnim._value;
      const threshold = 0.4; // 40% of available height
      
      // Decide whether to snap up or down based on position and velocity
      const shouldOpenSettings = currentValue > threshold || velocity < -0.5;
      
      if (shouldOpenSettings) {
        // Snap to open position
        Animated.spring(slideAnim, {
          toValue: 1,
          velocity: -velocity, // Invert velocity for spring
          tension: 300,
          friction: 30,
          useNativeDriver: true,
        }).start();
      } else {
        // Snap to closed position
        Animated.spring(slideAnim, {
          toValue: 0,
          velocity: -velocity, // Invert velocity for spring
          tension: 300,
          friction: 30,
          useNativeDriver: true,
        }).start(() => {
          setIsSettingsVisible(false);
        });
      }
    },
  });

  const showSettings = () => {
    setIsSettingsVisible(true);
    Animated.spring(slideAnim, {
      toValue: 1,
      tension: 300,
      friction: 30,
      useNativeDriver: true,
    }).start();
  };

  const hideSettings = () => {
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 300,
      friction: 30,
      useNativeDriver: true,
    }).start(() => {
      setIsSettingsVisible(false);
    });
  };

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
        <Tab.Screen name="Home">
          {(props) => <HomeStackNavigator {...props} slideAnim={slideAnim} />}
        </Tab.Screen>
        <Tab.Screen name="Schriften" component={SchriftenStackNavigator} />
        <Tab.Screen name="Gebet" component={GebetScreen} />
        <Tab.Screen name="Chat" component={ChatScreen} />
        <Tab.Screen name="Kirche" component={KircheScreen} />
      </Tab.Navigator>
      
      {/* Drag area for settings - only above navbar */}
      <View
        style={{
          position: 'absolute',
          bottom: 85, // Start above navbar (navbar height is 85)
          left: 0,
          right: 0,
          height: 60, // Smaller drag area
          backgroundColor: 'transparent',
          zIndex: isSettingsVisible ? 50 : 100, // Lower priority when settings visible
        }}
        {...panResponder.panHandlers}
      >
        {/* Visual hint - only show when not dragging */}
        {!isSettingsVisible && (
          <View style={{
            position: 'absolute',
            bottom: 5,
            left: '45%',
            right: '45%',
            height: 3,
            backgroundColor: colors.cardBackground,
            borderRadius: 3,
            opacity: 0.3,
          }} />
        )}
      </View>

      {/* Settings Overlay */}
      {isSettingsVisible && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          zIndex: 1000,
        }}>
          {/* Settings Panel - only up to header */}
          <Animated.View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: height - 180, // Stop before header (leave 180px for header)
              backgroundColor: colors.background,
              borderTopLeftRadius: 25,
              borderTopRightRadius: 25,
              transform: [
                {
                  translateY: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [height - 180, 0],
                  }),
                },
              ],
            }}
            {...panResponder.panHandlers}
          >
            {/* Close Button */}
            <View style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              padding: 15,
              borderBottomWidth: 1,
              borderBottomColor: colors.cardBackground,
              backgroundColor: colors.background,
            }}>
              <TouchableOpacity
                onPress={hideSettings}
                style={{
                  padding: 5,
                  borderRadius: 20,
                  backgroundColor: colors.cardBackground,
                }}
              >
                <Ionicons name="close" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Settings Content */}
            <View style={{ flex: 1 }}>
              <SettingsScreen onClose={hideSettings} hideHeader={true} />
            </View>
          </Animated.View>
        </View>
      )}
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
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
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
