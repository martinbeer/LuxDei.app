import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { DivinumOfficiumAPI } from '../lib/divinumOfficiumAPI';
import { Audio } from 'expo-audio';

const scale = 1; // simple text scaling already handled globally in other screens
const normalize = (s) => Math.round(s * scale);

export default function StundengebetScreen({ navigation }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState([]);
  const [language, setLanguage] = useState('English'); // 'English' | 'Latin'
  const [playingKey, setPlayingKey] = useState(null);
  const [soundObj, setSoundObj] = useState(null);
  const [divinumAPI] = useState(() => new DivinumOfficiumAPI());

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const availableHours = await divinumAPI.getAvailableHours();
        if (!mounted) return;
        
        // Add German display names and map to our expected format
        const hoursWithGermanNames = availableHours.map(hour => ({
          ...hour,
          germanName: getGermanHourName(hour.id),
          latinName: hour.divinumName,
          key: hour.id,
          currentLanguage: language
        }));
        
        setHours(hoursWithGermanNames);
      } catch (e) {
        console.warn('Error loading hours:', e);
        // Fallback to empty array instead of crashing
        setHours([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Helper function to get German hour names
  const getGermanHourName = (hourId) => {
    const germanNames = {
      'matins': 'Vigil',
      'lauds': 'Laudes', 
      'prime': 'Prim',
      'terce': 'Terz',
      'sext': 'Sext', 
      'none': 'Non',
      'vespers': 'Vesper',
      'compline': 'Komplet'
    };
    return germanNames[hourId] || hourId;
  };

  // Navigate to hour detail with DivinumOfficium data
  const openHourDetail = async (hour) => {
    try {
      const officeContent = await divinumAPI.fetchHour(hour.id, language);
      
      // Navigate to a new screen or show modal with the content
      navigation.navigate('HourDetail', {
        hour: officeContent,
        source: 'DivinumOfficium'
      });
    } catch (error) {
      console.warn('Error loading hour detail:', error);
      Alert.alert(
        'Fehler',
        'Die Stunde konnte nicht geladen werden. Bitte versuchen Sie es später erneut.'
      );
    }
  };

  const stopAudio = async () => {
    if (soundObj) {
      try {
        await soundObj.stopAsync();
      } catch {}
      try {
        await soundObj.unloadAsync();
      } catch {}
      setSoundObj(null);
    }
    setPlayingKey(null);
  };

  const playAudio = async (hour) => {
    if (playingKey === hour.key) {
      await stopAudio();
      return;
    }
    await stopAudio();
    if (!hour.item.audio) return;
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: hour.item.audio }, { shouldPlay: true });
      setSoundObj(sound);
      setPlayingKey(hour.key);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          stopAudio();
        }
      });
    } catch (e) {
      console.warn('Audio error', e);
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerBackground: { backgroundColor: colors.primary, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
    headerSafeArea: { backgroundColor: 'transparent' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 12 },
  headerTitle: { flex: 1, fontSize: normalize(24), fontFamily: 'Montserrat_700Bold', fontWeight: '700', color: colors.white, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 14 },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  toggleText: { fontSize: normalize(14), fontFamily: 'Montserrat_500Medium' },
    list: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16 },
    card: { backgroundColor: colors.cardBackground, borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: normalize(18), fontFamily: 'Montserrat_600SemiBold', color: colors.primary },
    actionText: { fontSize: normalize(12), fontFamily: 'Montserrat_500Medium', color: colors.primary },
    empty: { alignItems: 'center', paddingTop: 40 },
    emptyText: { marginTop: 10, color: colors.textSecondary }
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerBackground}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <View style={{ width: 40 }} />
            <Text style={styles.headerTitle}>Stundengebet</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity onPress={() => setLanguage('English')} style={[styles.toggleBtn, { backgroundColor: language === 'English' ? colors.primary : colors.cardBackground }]}>
          <Text style={[styles.toggleText, { color: language === 'English' ? colors.white : colors.primary }]}>English</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setLanguage('Latin')} style={[styles.toggleBtn, { backgroundColor: language === 'Latin' ? colors.primary : colors.cardBackground }]}>
          <Text style={[styles.toggleText, { color: language === 'Latin' ? colors.white : colors.primary }]}>Latein</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.emptyText}>Lade heutige Stunden...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {hours.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="alert-circle-outline" size={40} color={colors.cardBackground} />
              <Text style={styles.emptyText}>Keine Daten gefunden</Text>
            </View>
          ) : (
            hours.map((hour) => (
              <TouchableOpacity 
                key={hour.key} 
                style={styles.card}
                onPress={() => openHourDetail(hour)}
                activeOpacity={0.7}
              >
                <Text style={styles.cardTitle}>
                  {language === 'Latin' ? hour.latinName : hour.germanName}
                </Text>
                <Text style={[styles.actionText, { marginTop: 8, opacity: 0.7 }]}>
                  {hour.name} • {language}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
