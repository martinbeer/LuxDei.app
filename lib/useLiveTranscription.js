import { useEffect, useRef, useState } from 'react';
import { useAudioRecorder, RecordingPresets, setAudioModeAsync, AudioModule } from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import { getOpenAIKey, OPENAI_BASE_URL, OPENAI_TRANSCRIBE_MODEL, OPENAI_LANG } from '../config/openai';

// Simple chunked transcription: record short segments, upload to OpenAI Whisper, append text
export function useLiveTranscription({ locale = 'de-DE', chunkMs = 1500 } = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const apiKeyRef = useRef('');
  const inFlightRef = useRef(0);

  const rec = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    apiKeyRef.current = getOpenAIKey();
  }, []);

  async function transcribeFileAsync(uri) {
    const key = apiKeyRef.current;
    if (!key) return '';
    const endpoint = `${OPENAI_BASE_URL}/audio/transcriptions`;
    try {
      const result = await FileSystem.uploadAsync(endpoint, uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        parameters: {
          model: OPENAI_TRANSCRIBE_MODEL,
          language: OPENAI_LANG,
          response_format: 'json',
          temperature: '0',
        },
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });
      const body = result?.body ?? '';
      const json = (() => { try { return JSON.parse(body); } catch { return null; } })();
      return json?.text || '';
    } catch (e) {
      setError(String(e?.message || e));
      return '';
    }
  }

  async function captureChunk() {
    try {
      await rec.stop();
      const srcUri = rec?.uri;
      let tmpUri = null;
      // Copy to a stable temp file BEFORE preparing new recording (iOS may reuse/delete src)
      if (srcUri) {
        try {
          const ext = srcUri.includes('.') ? srcUri.split('.').pop() : 'm4a';
          const base = `${FileSystem.cacheDirectory || ''}stt-chunk-${Date.now()}.${ext}`;
          await FileSystem.copyAsync({ from: srcUri, to: base });
          tmpUri = base;
        } catch (e) {
          // Fallback: try to use original if copy fails
          tmpUri = srcUri;
        }
      }
      // Immediately resume recording to avoid gaps
      await rec.prepareToRecordAsync();
      rec.record();
      // Upload previous chunk in background from the copied temp
      if (tmpUri) {
        inFlightRef.current += 1;
        (async () => {
          try {
            // Ensure file still exists before upload
            try {
              const info = await FileSystem.getInfoAsync(tmpUri);
              if (!info?.exists) throw new Error('chunk-missing');
            } catch {}
            const text = await transcribeFileAsync(tmpUri);
            if (text) setTranscript((t) => (t ? `${t} ${text}` : text));
          } finally {
            try { await FileSystem.deleteAsync(tmpUri, { idempotent: true }); } catch {}
            inFlightRef.current -= 1;
          }
        })();
      }
    } catch (e) {
      setError(String(e?.message || e));
    }
  }

  async function start() {
    if (isRecording) return;
    setError(null);
    try {
      if (!apiKeyRef.current) {
        throw new Error('OPENAI_API_KEY missing (configure expo.extra.openaiApiKey)');
      }
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm?.granted) throw new Error('mic-permission-denied');
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await rec.prepareToRecordAsync();
      rec.record();
      setIsRecording(true);
      timerRef.current = setInterval(captureChunk, chunkMs);
    } catch (e) {
      setIsRecording(false);
      setError(String(e?.message || e));
    }
  }

  async function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    try {
      await rec.stop();
    } catch {}
    setIsRecording(false);
  }

  return { isRecording, transcript, error, start, stop, setTranscript };
}
