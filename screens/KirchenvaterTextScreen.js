import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

const { width } = Dimensions.get("window");
const scale = width / 320;
const normalize = (size) => Math.round(size * scale);

const renderTextWithFootnotes = (textValue, footnoteNumberMap) => {
  if (!textValue) {
    return null;
  }

  const parts = [];
  const normalisePlaceholder = (value) => (value || '').replace(/^{?FN/i, '').replace(/}?$/, '').trim();
  const regex = /\{FN([^}]+)\}/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(textValue)) !== null) {
    if (match.index > lastIndex) {
      parts.push(textValue.slice(lastIndex, match.index));
    }
    const key = (match[1] || '').trim() || '?';
    parts.push(
      <Text key={`fn-${key}-${match.index}`} style={styles.footnoteSup}>
        {key}
      </Text>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < textValue.length) {
    parts.push(textValue.slice(lastIndex));
  }

  return parts;
};

const KirchenvaterTextScreen = ({ route, navigation }) => {
  const { colors } = useTheme();
  const { kirchenvater, workId, workTitle } = route.params;

  const [sections, setSections] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sectionCache, setSectionCache] = useState(new Map());
  const [maxSection, setMaxSection] = useState(1);
  
  // Swipe state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [previewSection, setPreviewSection] = useState(0);
  const [scrubX, setScrubX] = useState(0);
  const [sectionInfoWidth, setSectionInfoWidth] = useState(0);
  const latestRef = useRef({ maxSection: 1, width: 0, currentIndex: 0 });
  const suppressNextPressRef = useRef(false);
  const skipNextEffectRef = useRef(false);
  const lastPreviewRef = useRef(0);

  const scrollViewRef = useRef(null);

  useEffect(() => {
    loadSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId]);

  const loadSections = async () => {
    try {
      setLoading(true);
      setSectionCache(new Map());
      setBlocks([]);

      const { data, error } = await supabase
        .from("sections")
        .select("id, title, label, order_index")
        .eq("work_id", workId)
        .order("order_index", { ascending: true });

      if (error) {
        throw error;
      }

      const sectionIds = (data || []).map((section) => section.id);
      let sectionsWithContent = new Set();

      if (sectionIds.length) {
        const { data: sectionPassages, error: passagesError } = await supabase
          .from("passages")
          .select("section_id")
          .in("section_id", sectionIds)
          .limit(10000);

        if (passagesError) {
          throw passagesError;
        }

        sectionsWithContent = new Set((sectionPassages || []).map((entry) => entry.section_id));
      }

      const normalized = (data || []).map((section, index) => ({
        ...section,
        displayTitle: section.title || section.label || `Abschnitt ${index + 1}`,
        hasContent: sectionsWithContent.has(section.id),
      }));

      const sectionsToUse = normalized.filter((section) => section.hasContent);
      const finalSections = sectionsToUse.length ? sectionsToUse : normalized;

      setSections(finalSections);
      setMaxSection(finalSections.length);

      if (finalSections.length > 0) {
        setCurrentIndex(0);
        await loadSectionContent(finalSections[0], 0, { reset: true });
      } else {
        setBlocks([
          {
            key: "empty",
            text: "F�r dieses Werk wurden noch keine Texte gespeichert.",
            indentLevel: 0,
            isHeading: false,
          },
        ]);
        setLoading(false);
      }
    } catch (err) {
      console.error("Fehler beim Laden der Abschnitte:", err);
      setBlocks([
        {
          key: "error",
          text: "Die Abschnitte konnten nicht geladen werden.",
          indentLevel: 0,
          isHeading: false,
        },
      ]);
      setLoading(false);
    }
  };

  const loadSectionContent = async (section, index, { reset = false } = {}) => {
    try {
      if (!reset) {
        setLoading(true);
      }

      const cacheKey = section.id;
      if (sectionCache.has(cacheKey)) {
        setBlocks(sectionCache.get(cacheKey));
        setLoading(false);
        return;
      }

      const { data: passagesData, error: passagesError } = await supabase
        .from("passages")
        .select("id, order_index, plain_text, verses(line_no, text, indent_level, is_heading)")
        .eq("section_id", section.id)
        .order("order_index", { ascending: true });

      if (passagesError) {
        throw passagesError;
      }

      const passages = (passagesData || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      const passageIds = passages.map((p) => p.id).filter(Boolean);

      let noteLinks = [];
      if (passageIds.length) {
        const { data: linksData, error: linksError } = await supabase
          .from("note_links")
          .select("note_id, origin_passage_id, origin_html_anchor")
          .in("origin_passage_id", passageIds)
          .order("origin_passage_id", { ascending: true });

        if (linksError) {
          throw linksError;
        }

        noteLinks = linksData || [];
      }

      const noteIds = Array.from(new Set(noteLinks.map((link) => link.note_id)));
      let notesById = new Map();

      if (noteIds.length) {
        const { data: notesData, error: notesError } = await supabase
          .from("notes")
          .select("id, note_key, plain_text")
          .in("id", noteIds);

        if (notesError) {
          throw notesError;
        }

        notesById = new Map((notesData || []).map((note) => [note.id, note]));
      }

      const lines = [];
      // Section title is already displayed in header - no need for duplicate heading

      passages.forEach((passage, pIndex) => {
        const verseLines = (passage.verses || []).sort((a, b) => (a.line_no || 0) - (b.line_no || 0));

        if (verseLines.length) {
          verseLines.forEach((line) => {
            const textValue = (line.text || '').trim();
            if (!textValue) {
              return;
            }
            lines.push({
              key: `${passage.id}-verse-${line.line_no}`,
              text: textValue,
              indentLevel: line.indent_level || 0,
              isHeading: !!line.is_heading,
            });
          });
        } else if (passage.plain_text) {
          const textValue = passage.plain_text.trim();
          if (textValue) {
            lines.push({
              key: `${passage.id}-plain`,
              text: textValue,
              indentLevel: 0,
              isHeading: false,
            });
          }
        }

        if (pIndex < passages.length - 1) {
          lines.push({ key: `${passage.id}-spacer`, isSpacer: true });
        }
      });

      const orderedFootnotes = [];
      const seenNotes = new Set();
      noteLinks.forEach((link) => {
        const note = notesById.get(link.note_id);
        if (!note || seenNotes.has(note.id)) {
          return;
        }
        seenNotes.add(note.id);
        orderedFootnotes.push({
          anchor: (link.origin_html_anchor || '').replace(/^{?FN/i, '').replace(/}?$/, '').trim(),
          key: note.note_key,
          text: note.plain_text,
        });
      });

      if (orderedFootnotes.length) {
        lines.push({
          key: `notes-divider-${section.id}`,
          isDivider: true,
        });
        orderedFootnotes.forEach((note, idx) => {
          const normalizedAnchor = (note.anchor || '').replace(/^{?FN/i, '').replace(/}?$/, '').trim();
          const fallbackKey = note.key ? note.key.split(':').pop() : '';
          const anchorLabel = normalizedAnchor ? `${normalizedAnchor}.` : fallbackKey ? `${fallbackKey}.` : '';
          const textValue = note.text ? note.text.trim() : '';
          const content = [anchorLabel, textValue].filter(Boolean).join(' ');
          if (content) {
            lines.push({
              key: `note-${section.id}-${idx}`,
              text: content,
              indentLevel: 0,
              isHeading: false,
              isFootnote: true,
            });
          }
        });
      }

      const hasRenderableContent = lines.some((line) => {
        if (!line || line.isSpacer || line.isHeading || line.isDivider) {
          return false;
        }
        return typeof line.text === "string" && line.text.trim().length > 0;
      });

      if (!hasRenderableContent) {
        const updatedSections = sections.filter((item) => item.id !== section.id);
        setSections(updatedSections);
        setMaxSection(updatedSections.length);
        setSectionCache((prev) => new Map(prev).set(cacheKey, []));
        if (updatedSections.length === 0) {
          setBlocks([
            {
              key: "empty",
              text: "F�r dieses Werk wurden noch keine Texte gespeichert.",
              indentLevel: 0,
              isHeading: false,
            },
          ]);
          setCurrentIndex(0);
          setLoading(false);
        } else {
          const nextIndex = Math.min(index, updatedSections.length - 1);
          setCurrentIndex(nextIndex);
          await loadSectionContent(updatedSections[nextIndex], nextIndex, { reset: true });
        }
        return;
      }

      setSectionCache((prev) => new Map(prev).set(cacheKey, lines));
      setBlocks(lines);
    } catch (err) {
      console.error("Fehler beim Laden des Abschnitts:", err);
      setBlocks([
        {
          key: "section-error",
          text: "Der Abschnitt konnte nicht geladen werden.",
          indentLevel: 0,
          isHeading: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSection = async (index) => {
    if (index < 0 || index >= sections.length) {
      return;
    }
    setCurrentIndex(index);
    await loadSectionContent(sections[index], index);
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: false });
    }
  };

  // Section navigation with swipe support
  const commitSectionChange = (targetIndex) => {
    if (targetIndex >= 0 && targetIndex < sections.length && targetIndex !== currentIndex) {
      skipNextEffectRef.current = true;
      handleSelectSection(targetIndex);
    }
  };

  // Update latest ref when values change
  useEffect(() => {
    latestRef.current = { maxSection: sections.length, width: sectionInfoWidth, currentIndex };
  }, [sections.length, sectionInfoWidth, currentIndex]);

  // PanResponder for swipe navigation
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt, gestureState) => {
      return Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
    },
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
    },
    onPanResponderGrant: (evt, gestureState) => {
      setIsScrubbing(true);
      suppressNextPressRef.current = true;
      const touchX = evt.nativeEvent.locationX;
      setScrubX(touchX);
      setPreviewSection(latestRef.current.currentIndex);
      lastPreviewRef.current = latestRef.current.currentIndex;
    },
    onPanResponderMove: (evt, gestureState) => {
      const touchX = Math.max(0, Math.min(latestRef.current.width, evt.nativeEvent.locationX));
      setScrubX(touchX);
      
      if (latestRef.current.width > 0 && latestRef.current.maxSection > 1) {
        const progress = touchX / latestRef.current.width;
        const targetIndex = Math.round(progress * (latestRef.current.maxSection - 1));
        const clampedIndex = Math.max(0, Math.min(latestRef.current.maxSection - 1, targetIndex));
        
        if (clampedIndex !== lastPreviewRef.current) {
          setPreviewSection(clampedIndex);
          lastPreviewRef.current = clampedIndex;
        }
      }
    },
    onPanResponderRelease: (evt, gestureState) => {
      setIsScrubbing(false);
      
      if (latestRef.current.width > 0 && latestRef.current.maxSection > 1) {
        const touchX = Math.max(0, Math.min(latestRef.current.width, evt.nativeEvent.locationX));
        const progress = touchX / latestRef.current.width;
        const targetIndex = Math.round(progress * (latestRef.current.maxSection - 1));
        const clampedIndex = Math.max(0, Math.min(latestRef.current.maxSection - 1, targetIndex));
        
        commitSectionChange(clampedIndex);
      }
      
      setTimeout(() => {
        suppressNextPressRef.current = false;
      }, 100);
    }
  });

  const handlePrevious = () => {
    if (suppressNextPressRef.current) return;
    if (currentIndex > 0) {
      handleSelectSection(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (suppressNextPressRef.current) return;
    if (currentIndex < sections.length - 1) {
      handleSelectSection(currentIndex + 1);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header background wrapper with rounded bottom corners */}
      <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.backButton, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
            >
              <Ionicons name="arrow-back" size={22} color={colors.white} />
            </TouchableOpacity>
            <View style={styles.headerTexts}>
              <Text style={[styles.headerAuthor, { color: colors.white }]} numberOfLines={1}>
                {kirchenvater}
              </Text>
              <Text style={[styles.headerTitle, { color: colors.white }]} numberOfLines={1}>
                {workTitle}
              </Text>
            </View>
            <View style={styles.headerRight} />
          </View>
        </SafeAreaView>
      </View>

      {sections.length > 0 && (
        <View style={[styles.chapterNav, { backgroundColor: colors.cardBackground }]}>
          <TouchableOpacity
            onPress={handlePrevious}
            disabled={currentIndex === 0}
            style={[styles.navButton, { backgroundColor: currentIndex === 0 ? colors.background : colors.primary }]}
          >
            <Ionicons name="chevron-back" size={20} color={currentIndex === 0 ? colors.textSecondary : colors.white} />
          </TouchableOpacity>

          <View style={styles.chapterInfo} collapsable={false} onLayout={(e) => setSectionInfoWidth(e.nativeEvent.layout.width)} {...panResponder.panHandlers}>
            <Text style={[styles.chapterNavText, { color: colors.primary }]}>Abschnitt {isScrubbing ? (previewSection + 1) : (currentIndex + 1)} von {sections.length}</Text>
            {isScrubbing && sectionInfoWidth > 0 && (
              <View
                pointerEvents="none"
                style={[
                  styles.scrubBubble,
                  { backgroundColor: colors.primary, left: Math.max(10, Math.min(scrubX - 20, sectionInfoWidth - 40)) },
                ]}
              >
                <Text style={[styles.scrubBubbleText, { color: colors.white }]}>{previewSection + 1}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={handleNext}
            disabled={currentIndex >= sections.length - 1}
            style={[styles.navButton, { backgroundColor: currentIndex >= sections.length - 1 ? colors.background : colors.primary }]}
          >
            <Ionicons name="chevron-forward" size={20} color={currentIndex >= sections.length - 1 ? colors.textSecondary : colors.white} />
          </TouchableOpacity>
        </View>
      )}

      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeAreaContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Text wird geladen...</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {blocks.length > 0 ? (
              blocks.map((block) =>
                block.isSpacer ? (
                  <View key={block.key} style={styles.spacer} />
                ) : block.isDivider ? (
                  <View key={block.key} style={[styles.divider, { backgroundColor: colors.textSecondary }]} />
                ) : (
                  <View key={block.key} style={styles.textBlock}>
                    <Text
                      style={[
                        styles.blockText,
                        { color: colors.text },
                        block.isHeading && styles.headingText,
                        block.isFootnote && styles.footnoteText,
                        block.indentLevel ? { marginLeft: block.indentLevel * 12 } : null,
                      ]}
                    >
                      {renderTextWithFootnotes(block.text, block.footnoteMap)}
                    </Text>
                  </View>
                )
              )
            ) : (
              <View style={styles.noDataContainer}>
                <Ionicons name="book-outline" size={60} color={colors.cardBackground} />
                <Text style={[styles.noDataText, { color: colors.textSecondary }]}>Kein Text f�r diesen Abschnitt gefunden</Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeAreaContent: { flex: 1 },
  headerBackground: {
    backgroundColor: '#000', // overridden by dynamic color
    paddingTop: 0,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerSafeArea: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerAuthor: {
    fontSize: normalize(18),
    fontFamily: 'Montserrat_600SemiBold',
  },
  headerTitle: {
    fontSize: normalize(14),
    fontFamily: 'Montserrat_400Regular',
    opacity: 0.9,
  },
  headerRight: { width: 40 },
  chapterNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    marginHorizontal: 20,
    marginTop: 15,
    borderRadius: 15,
  },
  navButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chapterInfo: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  chapterNavText: { fontSize: normalize(16), fontFamily: 'Montserrat_500Medium', fontWeight: '500' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 25, paddingVertical: 20, paddingBottom: 100 },
  textBlock: { marginBottom: 18 },
  blockText: {
    fontSize: normalize(16),
    lineHeight: normalize(26),
    fontFamily: 'Montserrat_400Regular',
  },
  headingText: {
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: normalize(19),
    lineHeight: normalize(26),
    marginBottom: 8,
    marginTop: 8,
  },
  footnoteSup: {
    fontSize: normalize(12),
    lineHeight: normalize(12),
    marginLeft: 2,
    transform: [{ translateY: -8 }],
    fontFamily: 'Montserrat_700Bold',
  },
  footnoteText: {
    fontStyle: 'italic',
    opacity: 0.85,
    fontSize: normalize(14),
    lineHeight: normalize(20),
  },
  spacer: { height: 20 },
  divider: {
    height: 1,
    borderRadius: 2,
    marginVertical: 20,
    opacity: 0.3,
    alignSelf: 'stretch',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    marginTop: 20,
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  noDataText: {
    fontSize: normalize(16),
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    marginTop: 20,
  },
  scrubBubble: {
    position: 'absolute',
    bottom: 44,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  scrubBubbleText: { fontSize: normalize(12), fontFamily: 'Montserrat_700Bold', fontWeight: '700' },
});

export default KirchenvaterTextScreen;
