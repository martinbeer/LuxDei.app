import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

const KonzileScreen = ({ navigation }) => {
  const { colors } = useTheme();
  const [councils, setCouncils] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCouncils();
  }, []);

  const loadCouncils = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('council_document')
        .select('id, title, doc_slug, doc_type, promulgation_date, council_slug, metadata, council:council_slug(slug, title, ordinal, start_year, end_year, location)')
        .order('promulgation_date', { ascending: true });

      if (fetchError) {
        throw fetchError;
      }

      const groupedMap = new Map();

      (data || []).forEach((entry) => {
        const councilInfo = entry.council || {};
        const slug = councilInfo.slug || entry.council_slug || 'unbekannt';
        if (!groupedMap.has(slug)) {
          groupedMap.set(slug, {
            slug,
            title: councilInfo.title || slug,
            ordinal: councilInfo.ordinal ?? 0,
            timeframe: buildTimeframe(councilInfo.start_year, councilInfo.end_year),
            location: councilInfo.location,
            documents: [],
          });
        }
        groupedMap.get(slug).documents.push({
          id: entry.id,
          title: entry.title,
          docSlug: entry.doc_slug,
          docType: entry.doc_type,
          promulgationDate: entry.promulgation_date,
          metadata: entry.metadata || {},
        });
      });

      const grouped = Array.from(groupedMap.values())
        .sort((a, b) => {
          if (a.ordinal && b.ordinal) {
            return a.ordinal - b.ordinal;
          }
          return a.title.localeCompare(b.title);
        })
        .map((council) => ({
          ...council,
          documents: council.documents.sort((a, b) => {
            if (a.promulgationDate && b.promulgationDate) {
              return a.promulgationDate.localeCompare(b.promulgationDate);
            }
            return a.title.localeCompare(b.title);
          }),
        }));

      setCouncils(grouped);
    } catch (err) {
      console.error('Fehler beim Laden der Konzilsakten:', err);
      setError('Die Konzilsakten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadCouncils();
  };

  const renderCouncilHeader = ({ item }) => {
    return (
      <View style={[styles.councilHeader, { backgroundColor: colors.cardBackground }]}>
        <View style={styles.councilHeaderText}>
          <Text style={[styles.councilTitle, { color: colors.primary }]}>
            {item.title}
          </Text>
          {item.timeframe ? (
            <Text style={[styles.councilSubline, { color: colors.textSecondary }]}>
              {item.timeframe}
            </Text>
          ) : null}
          {item.location ? (
            <Text style={[styles.councilLocation, { color: colors.textSecondary }]}>
              Ort: {item.location}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.councilCount, { color: colors.textSecondary }]}>
          {item.documents.length} Dokumente
        </Text>
      </View>
    );
  };

  const renderDocumentItem = ({ item, council }) => {
    return (
      <TouchableOpacity
        style={[styles.documentItem, { borderColor: colors.cardBackground }]}
        onPress={() => {
          navigation.navigate('Konzilsdokument', {
            documentId: item.id,
            title: item.title,
            councilTitle: council.title,
            docSlug: item.docSlug,
            promulgationDate: item.promulgationDate,
            docType: item.docType,
          });
        }}
      >
        <View style={styles.documentTextContainer}>
          <Text style={[styles.documentTitle, { color: colors.textPrimary }]}>
            {item.title}
          </Text>
          <View style={styles.documentMetaRow}>
            {item.docType ? (
              <Text style={[styles.documentMeta, { color: colors.primary }]}>
                {item.docType}
              </Text>
            ) : null}
            {item.promulgationDate ? (
              <Text style={[styles.documentMeta, { color: colors.textSecondary }]}>
                {formatGermanDate(item.promulgationDate)}
              </Text>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    );
  };

  const listData = useMemo(() => {
    const rows = [];
    councils.forEach((council) => {
      rows.push({ type: 'header', key: `header-${council.slug}`, council });
      council.documents.forEach((doc) => {
        rows.push({ type: 'document', key: doc.id, council, document: doc });
      });
    });
    return rows;
  }, [councils]);

  if (loading && !refreshing && councils.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Lade Konzilsakten...</Text>
      </View>
    );
  }

  if (error && councils.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="warning" size={48} color={colors.primary} style={{ marginBottom: 12 }} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{error}</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={loadCouncils}>
          <Text style={[styles.retryText, { color: colors.white }]}>Erneut versuchen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={listData}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />}
      renderItem={({ item }) => {
        if (item.type === 'header') {
          return renderCouncilHeader({ item: item.council });
        }
        return renderDocumentItem({ item: item.document, council: item.council });
      }}
      ListEmptyComponent={
        !loading && (
          <View style={styles.loadingContainer}>
            <Ionicons name="document-text-outline" size={64} color={colors.cardBackground} style={{ marginBottom: 16 }} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Noch keine Konzilsakten verfuegbar.</Text>
          </View>
        )
      }
    />
  );
};

const buildTimeframe = (startYear, endYear) => {
  if (!startYear && !endYear) return null;
  if (startYear && endYear) {
    return `${startYear} - ${endYear}`;
  }
  return startYear ? `${startYear}` : `${endYear}`;
};

const formatGermanDate = (isoDate) => {
  if (!isoDate) return null;
  try {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return isoDate;
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
  listContent: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 120,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Montserrat_500Medium',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
  },
  councilHeader: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  councilHeaderText: {
    marginBottom: 8,
  },
  councilTitle: {
    fontSize: 18,
    fontFamily: 'Montserrat_700Bold',
  },
  councilSubline: {
    fontSize: 14,
    marginTop: 2,
    fontFamily: 'Montserrat_500Medium',
  },
  councilLocation: {
    fontSize: 13,
    marginTop: 2,
    fontFamily: 'Montserrat_400Regular',
  },
  councilCount: {
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  documentTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  documentTitle: {
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 6,
  },
  documentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  documentMeta: {
    fontSize: 13,
    marginRight: 12,
    fontFamily: 'Montserrat_500Medium',
  },
});

export default KonzileScreen;
