import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

const KonzilsdokumentScreen = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { documentId, title, councilTitle } = route.params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [document, setDocument] = useState(null);
  const [sections, setSections] = useState([]);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    loadDocument();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const loadDocument = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: docError } = await supabase
        .from('council_document')
        .select('id, title, content_text, content_html, doc_type, promulgation_date, source_url, metadata')
        .eq('id', documentId)
        .maybeSingle();

      if (docError) {
        throw docError;
      }

      if (!data) {
        setError('Dokument wurde nicht gefunden.');
        setLoading(false);
        return;
      }

      setDocument(data);

      const { data: sectionData, error: sectionError } = await supabase
        .from('council_document_section')
        .select('id, section_slug, heading, order_index, content_text')
        .eq('document_id', documentId)
        .order('order_index', { ascending: true });

      if (sectionError) {
        throw sectionError;
      }

      setSections(sectionData || []);
    } catch (err) {
      console.error('Fehler beim Laden des Konzilsdokuments:', err);
      setError('Das Dokument konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  const renderParagraphs = (textValue) => {
    const paragraphs = splitParagraphs(textValue);
    if (!paragraphs.length) {
      return null;
    }

    const elements = [];

    paragraphs.forEach((paragraph, paragraphIndex) => {
      const normalised = paragraph.replace(/\r?\n/g, '\n');
      const roughLines = normalised.split('\n');
      const lines = [];

      roughLines.forEach((rawLine) => {
        const trimmedLine = rawLine.trim();
        if (!trimmedLine) {
          return;
        }

        const fragments = trimmedLine
          .split(/(?=(?:^|\s)(\d+\)))/)
          .map((fragment) => fragment.trim())
          .filter(Boolean);

        lines.push(...fragments);
      });

      let lineIndex = 0;
      while (lineIndex < lines.length) {
        const line = lines[lineIndex];
        const soleNumberMatch = line.match(/^(\d+)$/);
        if (soleNumberMatch) {
          const label = soleNumberMatch[1];
          const textParts = [];
          lineIndex += 1;
          while (lineIndex < lines.length && !/^\d+$/.test(lines[lineIndex])) {
            textParts.push(lines[lineIndex]);
            lineIndex += 1;
          }
          const textContent = textParts.join(' ').trim();
          elements.push(
            <Text
              key={`paragraph-${paragraphIndex}-footnote-${label}`}
              style={[styles.paragraph, styles.footnoteLine]}
            >
              <Text style={styles.numberLabel}>{`${label}.`}</Text>
              {textContent ? ` ${textContent}` : ''}
            </Text>,
          );
          continue;
        }

        const match = line.match(/^(\d+\))\s*(.*)$/);
        if (match) {
          const [, label, rest] = match;
          elements.push(
            <Text
              key={`paragraph-${paragraphIndex}-line-${lineIndex}`}
              style={styles.paragraph}
            >
              <Text style={styles.numberLabel}>{label}</Text>
              {rest ? ` ${rest}` : ''}
            </Text>,
          );
          lineIndex += 1;
          continue;
        }

        elements.push(
          <Text
            key={`paragraph-${paragraphIndex}-line-${lineIndex}`}
            style={styles.paragraph}
          >
            {line}
          </Text>,
        );
        lineIndex += 1;
      }
    });

    return elements;
  };

  const renderContent = () => {
    if (!document) {
      return null;
    }

    const formatHeading = (headingValue, index) => {
      const clean = (headingValue || '').trim();
      if (!clean) {
        return `Abschnitt ${index + 1}`;
      }
      return /^\d/.test(clean) ? clean : `${index + 1}. ${clean}`;
    };

    if (sections.length) {
      return sections.map((section, index) => (
        <View
          key={section.id || section.section_slug || `section-${index}`}
          style={styles.sectionContainer}
        >
          <Text style={[styles.sectionHeading, { color: colors.primary }]}>
            {formatHeading(section.heading, index)}
          </Text>
          {renderParagraphs(section.content_text || '')}
        </View>
      ));
    }

    return renderParagraphs(document.content_text || '');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={[styles.headerSafeArea, { backgroundColor: colors.primary }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.headerTextContainer}>
            <Text style={[styles.headerPreTitle, { color: colors.white }]}>{councilTitle}</Text>
            <Text style={[styles.headerTitle, { color: colors.white }]} numberOfLines={2}>
              {title}
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Lade Dokument...</Text>
        </View>
      ) : error ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="warning" size={48} color={colors.primary} style={{ marginBottom: 12 }} />
          <Text style={[styles.loadingText, { color: colors.textSecondary, textAlign: 'center' }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={loadDocument}>
            <Text style={[styles.retryText, { color: colors.white }]}>Erneut versuchen</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.metaContainer}>
            {document.doc_type ? (
              <View style={[styles.metaPill, { backgroundColor: colors.cardBackground }]}>
                <Text style={[styles.metaPillText, { color: colors.primary }]}>{document.doc_type}</Text>
              </View>
            ) : null}
            {document.promulgation_date ? (
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                Verkuendet am {formatGermanDate(document.promulgation_date)}
              </Text>
            ) : null}
          </View>

          {renderContent()}
        </ScrollView>
      )}
    </View>
  );
};

const splitParagraphs = (text) => {
  if (!text) return [];
  const normalised = text.replace(/\r\n/g, '\n');
  const primary = normalised
    .split(/\n\s*\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (primary.length > 1) {
    return primary;
  }
  return [normalised.trim()].filter(Boolean);
};

const formatGermanDate = (isoDate) => {
  if (!isoDate) return '';
  try {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
      return isoDate;
    }
    return date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch (err) {
    return isoDate;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSafeArea: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
    paddingHorizontal: 8,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  headerPreTitle: {
    fontSize: 12,
    opacity: 0.9,
    fontFamily: 'Montserrat_500Medium',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Montserrat_700Bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
    fontFamily: 'Montserrat_500Medium',
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingBottom: 120,
  },
  metaContainer: {
    marginBottom: 20,
  },
  metaPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  metaPillText: {
    fontSize: 13,
    fontFamily: 'Montserrat_600SemiBold',
  },
  metaText: {
    fontSize: 14,
    fontFamily: 'Montserrat_500Medium',
  },
  sectionContainer: {
    marginBottom: 28,
  },
  sectionHeading: {
    fontSize: 20,
    fontFamily: 'Montserrat_700Bold',
    marginTop: 16,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 18,
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'left',
  },
  numberLabel: {
    fontFamily: 'Montserrat_700Bold',
    marginRight: 6,
  },
  footnoteLine: {
    fontStyle: 'italic',
    opacity: 0.9,
  },
});

export default KonzilsdokumentScreen;





