import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { prayers as RosaryPrayers, rosarySets, setOrder } from '../data/rosary';
import { useLiveTranscription } from '../lib/useLiveTranscription';
import { useDeviceTranscription } from '../lib/useDeviceTranscription';
import Constants from 'expo-constants';
import { tokenizeWords, alignBatch } from '../lib/textAlignment';

// Typography scaling similar to other screens
const { width: windowWidth } = Dimensions.get('window');
const scale = windowWidth / 320;
const normalize = (size) => Math.round(size * scale);

// Build full flow (intro + 5 decades each with 10 beads split into 2 substeps)
function buildFlow(setKey) {
  const set = rosarySets[setKey] || rosarySets.freudenreich;
  const flow = [];
  flow.push({ type: 'static', key: 'sign', label: 'Kreuzzeichen', text: RosaryPrayers.signOfCross });
  flow.push({ type: 'static', key: 'creed', label: 'Glaubensbekenntnis', text: RosaryPrayers.creed });
  // Drei Ave Maria am Anfang (ohne Klausel)
  for (let i = 1; i <= 3; i++) {
    flow.push({ type: 'bead', key: `intro-ave-${i}-1`, label: `Einleitung – ${i}. Ave (Teil 1)`, bead: i, decade: 0, sub: 1, text: RosaryPrayers.hailMaryPart1NoClause });
    flow.push({ type: 'bead', key: `intro-ave-${i}-2`, label: `Einleitung – ${i}. Ave (Teil 2)`, bead: i, decade: 0, sub: 2, text: RosaryPrayers.hailMaryPart2 });
  }
  // Danach starten die Gesätzchen
  for (let d = 0; d < 5; d++) {
    const clause = set.clauses[d];
    const decadeLabel = `${d + 1}. Geheimnis`;
    // Erst Vaterunser, dann Perlen mit Klausel im Ave (Teil 1)
    flow.push({ type: 'static', key: `decade-${d}-pater`, label: `${decadeLabel} – Vaterunser`, text: RosaryPrayers.ourFather });
    for (let b = 0; b < 10; b++) {
      const bead = b + 1;
      const base1 = RosaryPrayers.hailMaryPart1Base + clause + '.';
      const base2 = RosaryPrayers.hailMaryPart2;
      flow.push({ type: 'bead', key: `d${d}-b${bead}-1`, label: `${decadeLabel} – ${bead}. Perle (Teil 1)`, bead: bead, decade: d + 1, sub: 1, text: base1 });
      flow.push({ type: 'bead', key: `d${d}-b${bead}-2`, label: `${decadeLabel} – ${bead}. Perle (Teil 2)`, bead: bead, decade: d + 1, sub: 2, text: base2 });
    }
    flow.push({ type: 'static', key: `decade-${d}-gloria`, label: 'Ehre sei dem Vater', text: RosaryPrayers.gloria });
    flow.push({ type: 'static', key: `decade-${d}-fatima`, label: 'Fatima-Gebet', text: RosaryPrayers.fatima });
  }
  return flow;
}

// replaced web-only speech hook with cross-platform hook

export default function RosenkranzTutorialScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();

  // Modals
  const [modeModal, setModeModal] = useState(false); // interactive mode removed
  const [setChoiceModal, setSetChoiceModal] = useState(true); // choose freudenreich/schmerzhaft/glorreich/lichtreich

  // Config
  const [mode, setMode] = useState('normal'); // only 'normal'
  const [mysterySetKey, setMysterySetKey] = useState('freudenreich'); // default
  const [mysterySetTitle, setMysterySetTitle] = useState(rosarySets['freudenreich'].title);

  // Steps
  const [currentStep, setCurrentStep] = useState(0);
  const steps = useMemo(() => buildFlow(mysterySetKey), [mysterySetKey]);

  // current flow built from selected set

  // Interactive speech mode removed for now

  const onPickMode = (m) => {
    setMode(m);
    setModeModal(false);
    setSetChoiceModal(true);
  };
  const onPickSet = (key) => {
    setMysterySetKey(key);
    setMysterySetTitle(rosarySets[key].title);
    setSetChoiceModal(false);
  };

  const resetAlignment = () => {
    setTranscript('');
    setLastConsumedLen(0);
    setMatched(new Set());
    setPointer(0);
  };
  const onNext = () => {
    resetAlignment();
    setCurrentStep((s) => Math.min(s + 1, steps.length - 1));
  };
  const onPrev = () => {
    resetAlignment();
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  const atLast = currentStep === steps.length - 1;
  const step = steps[currentStep];
  const formatted = step?.text || '';
  const { tokens, words } = useMemo(() => tokenizeWords(formatted), [formatted]);
  const [pointer, setPointer] = useState(0); // index within words array
  const [matched, setMatched] = useState(new Set());
  const isExpoGo = Constants?.appOwnership === 'expo';
  const device = useDeviceTranscription({ locale: 'de-DE' });
  const cloud = useLiveTranscription({ locale: 'de-DE', chunkMs: 900 });
  const isRecording = isExpoGo ? cloud.isRecording : device.isRecording;
  const transcript = isExpoGo ? cloud.transcript : device.transcript;
  const start = isExpoGo ? cloud.start : device.start;
  const stop = isExpoGo ? cloud.stop : device.stop;
  const setTranscript = isExpoGo ? cloud.setTranscript : device.setTranscript;

  // Fast prefix-based matching: compare normalized transcript to normalized expected prefix
  const [lastConsumedLen, setLastConsumedLen] = useState(0);
  useEffect(() => {
    const t = String(transcript || '');
    if (!t) return;
    setLastConsumedLen(t.length);
    const tn = t
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9äöüß\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!tn) return;
    // Build progressive normalized prefix and count how many leading words match
    let k = 0;
    let prefix = '';
    for (let i = 0; i < words.length; i++) {
      const w = (words[i]?.norm || '').trim();
      if (!w) continue;
      prefix = prefix ? `${prefix} ${w}` : w;
      if (tn.includes(prefix)) {
        k = i + 1;
      } else {
        break;
      }
    }
    if (k > 0) {
      setPointer(k);
      const setK = new Set();
      for (let i = 0; i < k; i++) setK.add(i);
      setMatched(setK);
    }
  }, [transcript, words]);

  // Advance automatically when all words for this step have been matched
  useEffect(() => {
    if (!words.length) return;
    // all word indices for this step are 0..words.length-1
    let allMatched = true;
    for (let i = 0; i < words.length; i++) {
      if (!matched.has(i)) { allMatched = false; break; }
    }
    if (allMatched && words.length > 0) {
      // brief pause then advance
      const id = setTimeout(() => {
        setTranscript('');
        setLastConsumedLen(0);
        setMatched(new Set());
        setPointer(0);
        onNext();
      }, 400);
      return () => clearTimeout(id);
    }
  }, [matched, words.length]);
  const activeDecade = step?.type === 'bead' ? step.decade : (step?.key?.startsWith('decade-') ? parseInt(step.key.split('-')[1], 10) + 1 : 0);
  const activeBead = step?.type === 'bead' ? step.bead : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerBackground, { backgroundColor: colors.primary }]}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.white} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.white }]} numberOfLines={1}>Rosenkranz Tutorial</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
      </View>

      <View style={{ flex: 1, padding: 20 }}>
        {/* Title and counters */}
        <Text style={[styles.mysteryTitle, { color: colors.primary }]}>
          {mysterySetTitle}
        </Text>
        <View style={styles.countersRow}>
          <View style={[styles.counterPill, { backgroundColor: colors.cardBackground, borderColor: colors.primary + '33' }]}>
            <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>Gesätzchen</Text>
            <Text style={[styles.counterValue, { color: colors.primary }]}>{activeDecade || 0}/5</Text>
          </View>
          <View style={[styles.counterPill, { backgroundColor: colors.cardBackground, borderColor: colors.primary + '33' }]}>
            <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>Perle</Text>
            <Text style={[styles.counterValue, { color: colors.primary }]}>{activeBead || 0}/10</Text>
          </View>
        </View>

        {/* Current step */}
  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={[styles.stepBlock, { backgroundColor: colors.cardBackground, borderColor: colors.primary + '40' }]}>
            <Text style={[styles.stepHeader, { color: colors.primary }]}>
              {currentStep + 1}. {step?.label}
            </Text>
            <Text style={[styles.bodyText, { color: colors.text, flexWrap: 'wrap' }]}>
              {tokens.map((tk, idx) => {
                if (!tk.isWord) {
                  return <Text key={idx} style={{ color: colors.text }}>{tk.text}</Text>;
                }
                const isHit = matched.has(tk.wordIndex);
                return (
                  <Text key={idx} style={{ color: isHit ? colors.primary : colors.text, fontWeight: isHit ? '700' : '400' }}>
                    {tk.text}
                  </Text>
                );
              })}
            </Text>
          </View>
        </ScrollView>
        
  {typeof error !== 'undefined' && error && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
            <Text style={{ color: 'crimson', fontSize: normalize(12) }} numberOfLines={3}>
              Mic/Transkriptionsfehler: {String(error)}
            </Text>
          </View>
        )}

      </View>

      {/* Footer controls above the tab bar */}
      <SafeAreaView edges={["bottom"]} style={{ paddingHorizontal: 20, paddingBottom: 12, marginBottom: 95 }}>
        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={onPrev} disabled={currentStep === 0} style={[styles.ctrlBtn, { backgroundColor: currentStep === 0 ? colors.cardBackground : colors.primary }]}>
            <Ionicons name="chevron-back" size={18} color={currentStep === 0 ? colors.textSecondary : colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => (isRecording ? stop() : start())}
            style={[styles.micPill, { backgroundColor: isRecording ? colors.primary : colors.cardBackground }]}
          >
            <Ionicons name="mic" size={18} color={isRecording ? colors.white : colors.primary} />
            <Text style={{ marginLeft: 8, color: isRecording ? colors.white : colors.primary, fontFamily: 'Montserrat_600SemiBold' }}>
              {isRecording ? 'Hört zu…' : 'Mikrofon'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onNext} disabled={atLast} style={[styles.nextBtn, { backgroundColor: atLast ? colors.cardBackground : colors.primary }]}>
            <Text style={{ color: atLast ? colors.textSecondary : colors.white, fontFamily: 'Montserrat_600SemiBold' }}>Weiter</Text>
          </TouchableOpacity>
        </View>
        {/* Speech hint removed */}
      </SafeAreaView>

      {/* Mode choice modal */}
      {/* Mode choice modal removed (only normal mode) */}

      {/* Set choice modal */}
      <Modal visible={setChoiceModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}> 
            <Text style={[styles.modalTitle, { color: colors.primary }]}>Rosenkranzgeheimnis wählen</Text>
            {setOrder.map((k) => (
              <TouchableOpacity key={k} style={[styles.modalBtn, { backgroundColor: colors.primary }]} onPress={() => onPickSet(k)}>
                <Text style={styles.modalBtnText}>{rosarySets[k].title}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setSetChoiceModal(false)}>
              <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatText(text) {
  try {
    let t = String(text || '').replace(/\r\n/g, '\n');
    t = t.replace(/\.\.\./g, '…');
    t = t.replace(/([.!?]+)\s+/g, '$1\n');
    t = t.replace(/\n{2,}/g, '\n');
    return t.trim();
  } catch {
    return String(text || '');
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBackground: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerSafeArea: { backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: normalize(20), fontFamily: 'Montserrat_700Bold', fontWeight: '700', textAlign: 'center' },

  mysteryTitle: { fontSize: normalize(16), fontFamily: 'Montserrat_600SemiBold', marginBottom: 12 },
  stepBlock: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 12 },
  stepHeader: { fontSize: normalize(13), fontFamily: 'Montserrat_600SemiBold', marginBottom: 6 },
  bodyText: { fontSize: normalize(18), lineHeight: normalize(28), fontFamily: 'Montserrat_400Regular' },
  countersRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  counterPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, minWidth: 140 },
  counterLabel: { fontSize: normalize(12), fontFamily: 'Montserrat_500Medium' },
  counterValue: { fontSize: normalize(14), fontFamily: 'Montserrat_700Bold' },

  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 10, minHeight: 52 },
  ctrlBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  nextBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  micPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  bottomControls: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50, elevation: 50 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', borderRadius: 16, padding: 18 },
  modalTitle: { fontSize: normalize(18), fontFamily: 'Montserrat_700Bold', textAlign: 'center', marginBottom: 12 },
  modalBtn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, marginTop: 10, alignItems: 'center' },
  modalBtnText: { color: '#fff', fontFamily: 'Montserrat_600SemiBold' },
  modalCancel: { alignItems: 'center', marginTop: 6 },
  modalCancelText: { fontFamily: 'Montserrat_500Medium' },
});
