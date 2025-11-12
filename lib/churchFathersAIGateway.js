import { supabase } from './supabase';
import { getOpenAIKey, OPENAI_BASE_URL } from '../config/openai';

const CACHE_TABLE = 'church_fathers_cache';
const MODEL = 'gpt-4o-mini'; // oder 'gpt-3.5-turbo' für schneller/günstiger
const REQUEST_TIMEOUT = 30000; // 30 Sekunden

/**
 * Erstelle einen eindeutigen Cache-Key für einen Vers
 */
const buildCacheKey = ({ book, chapter, verse, translationTable }) => {
  const normalizedBook = (book || '').trim().toLowerCase();
  const normalizedTranslation = (translationTable || 'allioli').trim().toLowerCase();
  return `${normalizedBook}:${normalizedTranslation}:${chapter}:${verse}`;
};

/**
 * Hole gecachte Church Fathers Ergebnisse
 */
export const getCachedChurchFathers = async ({ book, chapter, verse, translationTable }) => {
  const cacheKey = buildCacheKey({ book, chapter, verse, translationTable });
  
  try {
    const { data, error } = await supabase
      .from(CACHE_TABLE)
      .select('id, response_json, created_at, model')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (error) {
      console.warn('[churchFathersAIGateway] Cache lookup failed', error);
      return null;
    }

    if (!data) {
      console.log('[churchFathersAIGateway] No cache found for:', cacheKey);
      return null;
    }

    console.log('[churchFathersAIGateway] Cache HIT for:', cacheKey);
    
    try {
      const responseJson = typeof data.response_json === 'string' 
        ? JSON.parse(data.response_json) 
        : data.response_json;
      return {
        passages: responseJson.passages || [],
        source: 'cache',
        cachedAt: data.created_at,
        model: data.model
      };
    } catch (parseErr) {
      console.warn('[churchFathersAIGateway] Failed to parse cached JSON', parseErr);
      return null;
    }
  } catch (err) {
    console.warn('[churchFathersAIGateway] Cache lookup threw', err);
    return null;
  }
};

/**
 * Speichere Church Fathers Ergebnisse in der Datenbank
 */
const storeCacheResult = async ({ book, chapter, verse, translationTable, passages }) => {
  const cacheKey = buildCacheKey({ book, chapter, verse, translationTable });
  
  try {
    const payload = {
      cache_key: cacheKey,
      book,
      chapter,
      verse,
      translation_table: translationTable || null,
      model: MODEL,
      response_json: JSON.stringify({ passages }),
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from(CACHE_TABLE)
      .upsert(payload, { onConflict: 'cache_key' });

    if (error) {
      console.warn('[churchFathersAIGateway] Cache store failed', error);
      return false;
    }

    console.log('[churchFathersAIGateway] Cached result for:', cacheKey);
    return true;
  } catch (err) {
    console.warn('[churchFathersAIGateway] Cache store threw', err);
    return false;
  }
};

/**
 * Rufe ChatGPT auf um Church Fathers Zitate zu finden
 */
const queryOpenAI = async ({ book, chapter, verse, verseText }) => {
  const apiKey = getOpenAIKey();
  
  if (!apiKey) {
    throw new Error('OpenAI API Key not configured');
  }

  const prompt = `Du bist ein Experte in Kirchenväterliteratur. Ein Nutzer liest einen Bibelvers und möchte Zitate von Kirchenvätern finden, die sich auf diesen Vers beziehen.

Bibelstelle: ${book} ${chapter},${verse}
Vers-Text: "${verseText}"

AUFGABE: Finde die BESTEN Zitate aus der Kirchenväter-Literatur zu diesem Vers. Diese Zitate befinden sich in deiner Wissensbasis über die frühen christlichen Schriften.

Antworte mit einem JSON-Array in dieser Struktur (KEINE anderen Erklärungen):
[
  {
    "author": "Name des Kirchenvaters",
    "work": "Titel des Werkes",
    "excerpt": "Das tatsächliche Zitat oder die relevante Stelle (2-3 Sätze)",
    "relevance": "kurze Erklärung warum es relevant ist"
  },
  ...
]

Finde mindestens 2-3 relevante Zitate, maximal 5. Die Zitate sollten direkt zum Vers passen.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    console.log('[churchFathersAIGateway] OpenAI response:', content);

    // Extrahiere JSON aus der Antwort
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No valid JSON array in OpenAI response');
    }

    const passages = JSON.parse(jsonMatch[0]);
    
    if (!Array.isArray(passages)) {
      throw new Error('OpenAI response is not an array');
    }

    return passages;
  } catch (error) {
    console.error('[churchFathersAIGateway] OpenAI query failed:', error);
    throw error;
  }
};

/**
 * Hauptfunktion: Hole Church Fathers Zitate (mit Caching)
 */
export const queryChurchFathersWithAI = async ({
  book,
  chapter,
  verse,
  verseText,
  translationTable = 'bibelverse',
}) => {
  console.log('[churchFathersAIGateway] Query started for:', { book, chapter, verse });

  // 1. Prüfe Cache
  const cached = await getCachedChurchFathers({ book, chapter, verse, translationTable });
  if (cached) {
    return cached;
  }

  // 2. Cache miss → Frage ChatGPT
  console.log('[churchFathersAIGateway] Cache miss - querying OpenAI...');
  
  try {
    const passages = await queryOpenAI({ book, chapter, verse, verseText });
    
    if (!passages || passages.length === 0) {
      console.log('[churchFathersAIGateway] No passages found by OpenAI');
      return {
        passages: [],
        source: 'openai',
        message: 'Keine Kirchenväter-Zitate zu diesem Vers gefunden'
      };
    }

    // 3. Speichere in Cache
    await storeCacheResult({ book, chapter, verse, translationTable, passages });

    return {
      passages,
      source: 'openai',
      count: passages.length
    };
  } catch (error) {
    console.error('[churchFathersAIGateway] Failed to query OpenAI', error);
    return {
      passages: [],
      source: 'error',
      error: error.message
    };
  }
};
