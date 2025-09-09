import Constants from 'expo-constants';

export function getOpenAIKey() {
  // Prefer app.json extra, fallback to env if available
  const extra = Constants?.expoConfig?.extra || Constants?.manifest?.extra || {};
  return extra.openaiApiKey || process.env.OPENAI_API_KEY || '';
}

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const OPENAI_TRANSCRIBE_MODEL = 'whisper-1';
export const OPENAI_LANG = 'de';
