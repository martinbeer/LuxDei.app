import { useEffect, useRef, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import Constants from 'expo-constants';

// Uses @react-native-voice/voice (device-native STT). Works in Dev Client / standalone, NOT in Expo Go.
export function useDeviceTranscription({ locale = 'de-DE' } = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const VoiceRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const isExpoGo = Constants?.appOwnership === 'expo';
    if (isExpoGo) return; // not available
    (async () => {
      try {
        const mod = await import('@react-native-voice/voice');
        if (!mounted) return;
        VoiceRef.current = mod?.default || mod;
        const Voice = VoiceRef.current;
        Voice.onSpeechResults = (e) => {
          const text = (e?.value?.[0] || '').toString();
          setTranscript(text);
        };
        Voice.onSpeechPartialResults = (e) => {
          const text = (e?.value?.[0] || '').toString();
          setTranscript(text);
        };
        Voice.onSpeechError = (e) => {
          let msg = 'speech-error';
          try {
            if (e && typeof e === 'object') {
              msg = (e.error && e.error.message) ? e.error.message : (e.message || JSON.stringify(e));
            } else if (typeof e !== 'undefined') {
              msg = String(e);
            }
          } catch {}
          setError(msg);
        };
        Voice.onSpeechEnd = () => setIsRecording(false);
      } catch (e) {
        setError('device-stt-not-available');
      }
    })();
    return () => {
      mounted = false;
      const Voice = VoiceRef.current;
      if (Voice) {
        try { Voice.destroy?.().then?.(() => Voice.removeAllListeners?.()); } catch {}
      }
    };
  }, []);

  async function start() {
    try {
      const Voice = VoiceRef.current;
      if (!Voice) throw new Error('device-stt-not-ready');
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('mic-permission-denied');
      }
      setTranscript('');
      setError(null);
      await Voice.start(locale);
      setIsRecording(true);
    } catch (e) {
      setError(String(e?.message || e));
      setIsRecording(false);
    }
  }

  async function stop() {
    try {
      const Voice = VoiceRef.current;
      await Voice?.stop?.();
    } catch {}
    setIsRecording(false);
  }

  return { isRecording, transcript, error, start, stop, setTranscript };
}
