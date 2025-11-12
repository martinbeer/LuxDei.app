import { supabase } from './supabase';

const TABLE_NAME = 'bible_reference_cache';

const safeJsonParse = (value) => {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch (_err) {
    console.warn('[verseReferenceService] Failed to parse cached JSON payload');
    return null;
  }
};

export const buildVerseKey = ({ book, chapter, verse, translationTable }) => {
  const normalizedBook = (book || '').trim().toLowerCase();
  const normalizedTranslation = (translationTable || '').trim().toLowerCase();
  return `${normalizedBook}:${normalizedTranslation}:${chapter || 0}:${verse || 0}`;
};

export const getCachedReference = async ({ book, chapter, verse, translationTable }) => {
  const verseKey = buildVerseKey({ book, chapter, verse, translationTable });
  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('id, response_text, response_json, created_at, updated_at, model')
      .eq('verse_key', verseKey)
      .maybeSingle();

    if (error) {
      console.warn('[verseReferenceService] Cache lookup failed', error);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      model: data.model || null,
      createdAt: data.created_at || null,
      updatedAt: data.updated_at || null,
      responseText: data.response_text || null,
      responseJson: safeJsonParse(data.response_json),
    };
  } catch (err) {
    console.warn('[verseReferenceService] Cache lookup threw', err);
    return null;
  }
};

export const storeReference = async ({
  book,
  chapter,
  verse,
  translationTable,
  model,
  responseText,
  responseJson,
}) => {
  const verseKey = buildVerseKey({ book, chapter, verse, translationTable });
  try {
    const payload = {
      verse_key: verseKey,
      book,
      chapter,
      verse,
      translation_table: translationTable || null,
      model: model || null,
      response_text: responseText || null,
      response_json: responseJson ? JSON.stringify(responseJson) : null,
    };

    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert(payload, { onConflict: 'verse_key' });

    if (error) {
      console.warn('[verseReferenceService] Cache store failed', error);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[verseReferenceService] Cache store threw', err);
    return false;
  }
};

export const formatVerseReference = ({ bookDisplayName, chapter, verse }) => {
  const name = bookDisplayName || book || 'Unbekanntes Buch';
  const chap = Number.isFinite(chapter) ? chapter : parseInt(chapter, 10) || chapter;
  const ver = Number.isFinite(verse) ? verse : parseInt(verse, 10) || verse;
  return `${name} ${chap},${ver}`;
};
