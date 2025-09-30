import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const scale = 1;
const normalize = (s) => Math.round(s * scale);

export default function HourDetailScreen({ route, navigation }) {
  const { colors } = useTheme();
  const { hour, source } = route.params;

  const styles = StyleSheet.create({
    container: { 
      flex: 1, 
      backgroundColor: colors.background 
    },
    headerBackground: { 
      backgroundColor: colors.primary, 
      borderBottomLeftRadius: 20, 
      borderBottomRightRadius: 20 
    },
    headerSafeArea: { 
      backgroundColor: 'transparent' 
    },
    header: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      paddingHorizontal: 15, 
      paddingVertical: 12 
    },
    headerTitle: { 
      flex: 1, 
      fontSize: normalize(20), 
      fontFamily: 'Montserrat_700Bold', 
      fontWeight: '700', 
      color: colors.white, 
      textAlign: 'center',
      marginHorizontal: 10
    },
    backButton: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.2)'
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 20
    },
    sourceInfo: {
      backgroundColor: colors.cardBackground,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary
    },
    sourceText: {
      fontSize: normalize(12),
      color: colors.textSecondary,
      fontFamily: 'Montserrat_500Medium'
    },
    sectionTitle: {
      fontSize: normalize(18),
      fontFamily: 'Montserrat_600SemiBold',
      color: colors.primary,
      marginBottom: 12,
      marginTop: 20
    },
    psalmCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: 10,
      padding: 14,
      marginBottom: 10
    },
    psalmTitle: {
      fontSize: normalize(16),
      fontFamily: 'Montserrat_600SemiBold',
      color: colors.text,
      marginBottom: 6
    },
    antiphonText: {
      fontSize: normalize(14),
      fontFamily: 'Montserrat_400Regular',
      color: colors.textSecondary,
      fontStyle: 'italic'
    },
    prayerCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: 10,
      padding: 14,
      marginBottom: 10
    },
    prayerType: {
      fontSize: normalize(14),
      fontFamily: 'Montserrat_600SemiBold',
      color: colors.primary,
      marginBottom: 6
    },
    prayerText: {
      fontSize: normalize(14),
      fontFamily: 'Montserrat_400Regular',
      color: colors.text,
      lineHeight: 20
    },
    liturgicalText: {
      fontSize: normalize(15),
      fontFamily: 'Montserrat_500Medium',
      color: colors.text,
      lineHeight: 22,
      marginBottom: 8
    },
    englishText: {
      fontSize: normalize(13),
      fontFamily: 'Montserrat_400Regular',
      color: colors.textSecondary,
      fontStyle: 'italic',
      marginBottom: 12
    },
    antiphonContainer: {
      backgroundColor: colors.primary + '10',
      borderRadius: 8,
      padding: 12,
      marginVertical: 6,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary
    },
    antiphonLabel: {
      fontSize: normalize(14),
      fontFamily: 'Montserrat_600SemiBold',
      color: colors.primary,
      marginBottom: 4
    },
    psalmVerses: {
      marginVertical: 8,
      paddingLeft: 8
    },
    verseText: {
      fontSize: normalize(14),
      fontFamily: 'Montserrat_400Regular',
      color: colors.text,
      lineHeight: 20,
      marginBottom: 6
    },
    verseNumber: {
      fontSize: normalize(12),
      fontFamily: 'Montserrat_600SemiBold',
      color: colors.primary
    },
    moreText: {
      fontSize: normalize(12),
      fontFamily: 'Montserrat_400Regular',
      color: colors.textSecondary,
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: 8
    },
    placeholderText: {
      fontSize: normalize(13),
      fontFamily: 'Montserrat_400Regular',
      color: colors.textSecondary,
      fontStyle: 'italic',
      textAlign: 'center',
      padding: 16
    },
    versicleCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: 10,
      padding: 14,
      marginBottom: 10
    },
    versicleRow: {
      marginBottom: 4
    },
    versicleLabel: {
      fontSize: normalize(14),
      fontFamily: 'Montserrat_600SemiBold',
      color: colors.primary
    },
    versicleTextContent: {
      fontSize: normalize(14),
      fontFamily: 'Montserrat_400Regular',
      color: colors.text
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40
    },
    emptyText: {
      fontSize: normalize(16),
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 10
    }
  });

  const renderOpening = () => {
    if (!hour.content?.opening || hour.content.opening.length === 0) return null;

    return (
      <View>
        <Text style={styles.sectionTitle}>Eröffnung</Text>
        {hour.content.opening.map((item, index) => (
          <View key={index} style={styles.prayerCard}>
            {item.type === 'versicle' ? (
              <View>
                <Text style={styles.versicleLabel}>℣.</Text>
                <Text style={styles.liturgicalText}>{item.latin}</Text>
                <Text style={styles.versicleLabel}>℟.</Text>
                <Text style={styles.liturgicalText}>{item.response}</Text>
                <Text style={styles.englishText}>{item.english}</Text>
              </View>
            ) : (
              <View>
                <Text style={styles.liturgicalText}>{item.latin}</Text>
                <Text style={styles.englishText}>{item.english}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  const renderPsalms = () => {
    if (!hour.content?.psalms || hour.content.psalms.length === 0) return null;

    return (
      <View>
        <Text style={styles.sectionTitle}>Psalmodie</Text>
        {hour.content.psalms.map((psalm, index) => (
          <View key={index} style={styles.psalmCard}>
            {psalm.antiphon?.latin && (
              <View style={styles.antiphonContainer}>
                <Text style={styles.antiphonLabel}>Ant.</Text>
                <Text style={styles.liturgicalText}>{psalm.antiphon.latin}</Text>
              </View>
            )}
            
            <Text style={styles.psalmTitle}>{psalm.title}</Text>
            
            {psalm.verses && psalm.verses.length > 0 ? (
              <View style={styles.psalmVerses}>
                {psalm.verses.slice(0, 5).map((verse, vIndex) => (
                  <Text key={vIndex} style={styles.verseText}>
                    <Text style={styles.verseNumber}>{verse.chapter}:{verse.verse}</Text> {verse.text}
                  </Text>
                ))}
                {psalm.verses.length > 5 && (
                  <Text style={styles.moreText}>... ({psalm.verses.length - 5} weitere Verse)</Text>
                )}
              </View>
            ) : (
              <Text style={styles.placeholderText}>
                Psalm {psalm.number} - Volltext verfügbar in DivinumOfficium
              </Text>
            )}

            {psalm.antiphon?.latin && (
              <View style={[styles.antiphonContainer, { marginTop: 12 }]}>
                <Text style={styles.antiphonLabel}>Ant.</Text>
                <Text style={styles.liturgicalText}>{psalm.antiphon.latin}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  };

  const renderCanticle = () => {
    if (!hour.content?.canticle) return null;

    return (
      <View>
        <Text style={styles.sectionTitle}>{hour.content.canticle.title}</Text>
        <View style={styles.prayerCard}>
          {hour.content.canticle.antiphon && (
            <View style={styles.antiphonContainer}>
              <Text style={styles.antiphonLabel}>Ant.</Text>
              <Text style={styles.liturgicalText}>{hour.content.canticle.antiphon}</Text>
            </View>
          )}
          <Text style={styles.liturgicalText}>{hour.content.canticle.text}</Text>
        </View>
      </View>
    );
  };

  const renderPrayers = () => {
    if (!hour.content?.prayers || hour.content.prayers.length === 0) return null;

    return (
      <View>
        <Text style={styles.sectionTitle}>Gebete</Text>
        {hour.content.prayers.map((prayer, index) => (
          <View key={index} style={styles.prayerCard}>
            <Text style={styles.prayerType}>{prayer.type}</Text>
            <Text style={styles.prayerText}>{prayer.text}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderClosing = () => {
    if (!hour.content?.closing || hour.content.closing.length === 0) return null;

    return (
      <View>
        <Text style={styles.sectionTitle}>Abschluss</Text>
        {hour.content.closing.map((item, index) => (
          <View key={index} style={styles.prayerCard}>
            <Text style={styles.liturgicalText}>{item.latin}</Text>
            <Text style={styles.englishText}>{item.english}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderSections = () => {
    if (!hour.content?.sections || hour.content.sections.length === 0) return null;

    return (
      <View>
        <Text style={styles.sectionTitle}>Versikel & Antworten</Text>
        {hour.content.sections.map((section, index) => (
          <View key={index} style={styles.versicleCard}>
            {section.type === 'versicle' && (
              <>
                <View style={styles.versicleRow}>
                  <Text style={styles.versicleLabel}>℣. </Text>
                  <Text style={styles.versicleTextContent}>{section.versicle}</Text>
                </View>
                <View style={styles.versicleRow}>
                  <Text style={styles.versicleLabel}>℟. </Text>
                  <Text style={styles.versicleTextContent}>{section.response}</Text>
                </View>
              </>
            )}
          </View>
        ))}
      </View>
    );
  };

  const renderAntiphons = () => {
    if (!hour.content?.antiphons || hour.content.antiphons.length === 0) return null;

    // Filter out duplicate antiphons and show a selection
    const uniqueAntiphons = hour.content.antiphons
      .filter((ant, index, arr) => 
        index === arr.findIndex(a => a.text === ant.text)
      )
      .slice(0, 5); // Show first 5 unique antiphons

    if (uniqueAntiphons.length === 0) return null;

    return (
      <View>
        <Text style={styles.sectionTitle}>Antiphonen</Text>
        {uniqueAntiphons.map((antiphon, index) => (
          <View key={index} style={styles.prayerCard}>
            <Text style={styles.antiphonText}>{antiphon.text}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBackground}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color={colors.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {hour.displayName || hour.hour}
            </Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sourceInfo}>
          <Text style={styles.sourceText}>
            Quelle: {source} • {hour.language} • {hour.date}
          </Text>
        </View>

        {hour.content?.title && (
          <Text style={styles.sectionTitle}>{hour.content.title}</Text>
        )}

        {renderOpening()}
        {renderPsalms()}
        {renderCanticle()}
        {renderPrayers()}
        {renderClosing()}

        {/* Show empty state if no content */}
        {(!hour.content?.opening?.length && 
          !hour.content?.psalms?.length && 
          !hour.content?.canticle && 
          !hour.content?.prayers?.length && 
          !hour.content?.closing?.length) && (
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={64} color={colors.cardBackground} />
            <Text style={styles.emptyText}>
              Diese Stunde wird geladen...{'\n'}
              Bitte besuchen Sie DivinumOfficium.com für vollständige Inhalte.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
