import { useEffect, useRef, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import Constants from 'expo-constants';
import {
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { STT_ENDPOINT } from '../config/stt';

export function useSpeechRecognition({ onResult, onEnd, lang = 'de-DE' } = {}) {
  const recRef = useRef(null);
  const nativeVoiceRef = useRef(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  // Expo Go recorder via expo-audio
  const expoGoRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const w = globalThis?.window || {};
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      setSupported(!!SR);
    } else {
      // On Expo Go, do NOT try to import the native module (it will crash)
      const isExpoGo = Constants?.appOwnership === 'expo';
      if (isExpoGo) {
        // Expo Go fallback: we can record audio; optional STT via server or share file
        setSupported(true);
        return;
      }
      // Try to dynamically import native module (works in Dev Client / standalone)
      let cancelled = false;
      (async () => {
        try {
          const mod = await import('@react-native-voice/voice');
          if (cancelled) return;
          nativeVoiceRef.current = mod?.default || mod;
          if (nativeVoiceRef.current) {
            setSupported(true);
            nativeVoiceRef.current.onSpeechResults = (e) => {
              const text = (e?.value?.[0] || '').toString();
              onResult && onResult(text);
            };
            nativeVoiceRef.current.onSpeechEnd = () => {
              setListening(false);
              onEnd && onEnd();
            };
            nativeVoiceRef.current.onSpeechError = () => setListening(false);
          } else {
            setSupported(false);
          }
        } catch {
          // Not available in Expo Go
          setSupported(false);
        }
      })();
      return () => {
        cancelled = true;
        const Voice = nativeVoiceRef.current;
        if (Voice) {
          try {
            Voice.destroy?.().then?.(() => Voice.removeAllListeners?.());
          } catch {}
        }
      };
    }
  }, []);

  const start = async () => {
    if (!supported) return;
    if (Platform.OS === 'web') {
      try {
        const w = globalThis?.window || {};
        const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
        if (!SR) return;
        const rec = new SR();
        rec.lang = lang;
        rec.interimResults = true;
        rec.continuous = true;
        rec.onresult = (e) => {
          const text = Array.from(e.results).map((r) => r[0]?.transcript || '').join(' ');
          onResult && onResult(text);
        };
        rec.onend = () => {
          setListening(false);
          onEnd && onEnd();
        };
        recRef.current = rec;
        rec.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    } else {
      const isExpoGo = Constants?.appOwnership === 'expo';
      if (isExpoGo) {
        try {
          const status = await AudioModule.requestRecordingPermissionsAsync();
          if (!status?.granted) throw new Error('mic-permission-denied');
          await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
          await expoGoRecorder.prepareToRecordAsync();
          expoGoRecorder.record();
          setListening(true);
        } catch {
          setListening(false);
        }
      } else {
        try {
          const Voice = nativeVoiceRef.current;
          if (!Voice) throw new Error('no-native-voice');
          // Android runtime permission
          if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
            );
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
              throw new Error('mic-permission-denied');
            }
          }
          await Voice.start(lang);
          setListening(true);
        } catch {
          setListening(false);
        }
      }
    }
  };

  const stop = async () => {
    if (Platform.OS === 'web') {
      try { recRef.current && recRef.current.stop(); } catch {}
      setListening(false);
    } else {
      const isExpoGo = Constants?.appOwnership === 'expo';
      if (isExpoGo) {
        try {
          await expoGoRecorder.stop();
          const uri = expoGoRecorder?.uri || null;
          if (uri) {
            if (STT_ENDPOINT) {
              try {
                const response = await FileSystem.uploadAsync(STT_ENDPOINT, uri, {
                  httpMethod: 'POST',
                  uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                  fieldName: 'file',
                });
                const body = response?.body ?? '';
                const data = (() => { try { return JSON.parse(body); } catch { return {}; } })();
                const text = data?.text || '';
                onResult && onResult(text);
              } catch {}
            } else {
              try {
                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                  await Sharing.shareAsync(uri, { dialogTitle: 'Audio teilen' });
                }
              } catch {}
            }
          }
        } catch {}
        setListening(false);
      } else {
        try {
          const Voice = nativeVoiceRef.current;
          await Voice?.stop?.();
        } catch {}
        setListening(false);
      }
    }
  };

  return { supported, listening, start, stop };
}
