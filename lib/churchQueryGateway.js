import { supabase } from './supabase';
import { getDatabaseBookName } from '../utils/bookMapping';
import { findBibleRefs } from '../utils/bibleRef';

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 15;

const BOOK_SYNONYMS = {
  Rut: ['Ruth'],
  Ruth: ['Rut'],
  Genesis: ['Gen'],
  Exodus: ['Ex'],
  Levitikus: ['Lev', 'Levitikus'],
  Levit: ['Lev', 'Levitikus'],
  Numeri: ['Num'],
  Deuteronomium: ['Dtn'],
  Offenbarung: ['Apokalypse'],
};

// Alle Bibelbucher in Kurzform
const BIBLE_ABBREVIATIONS = {
  'gen': 'Genesis',
  'ex': 'Exodus',
  'lev': 'Levitikus',
  'num': 'Numeri',
  'dtn': 'Deuteronomium',
  'jos': 'Josua',
  'ri': 'Richter',
  'rut': 'Ruth',
  '1sam': '1. Samuel',
  '2sam': '2. Samuel',
  '1kön': '1. Könige',
  '2kön': '2. Könige',
  '1chr': '1. Chronik',
  '2chr': '2. Chronik',
  'esr': 'Esra',
  'neh': 'Nehemia',
  'est': 'Ester',
  'hiob': 'Hiob',
  'ps': 'Psalmen',
  'spr': 'Sprichwörter',
  'pred': 'Prediger',
  'hohel': 'Hoheslied',
  'jes': 'Jesaja',
  'jer': 'Jeremia',
  'klgl': 'Klagelieder',
  'ez': 'Ezechiel',
  'dan': 'Daniel',
  'hos': 'Hosea',
  'joel': 'Joel',
  'amos': 'Amos',
  'obd': 'Obadja',
  'jona': 'Jona',
  'mi': 'Micha',
  'nah': 'Nahum',
  'hab': 'Habakuk',
  'zef': 'Zefanja',
  'hag': 'Haggai',
  'sach': 'Sacharja',
  'mal': 'Maleachi',
  'mt': 'Matthäus',
  'mk': 'Markus',
  'lk': 'Lukas',
  'joh': 'Johannes',
  'apg': 'Apostelgeschichte',
  'röm': 'Römer',
  '1kor': '1. Korinther',
  '2kor': '2. Korinther',
  'gal': 'Galater',
  'eph': 'Epheser',
  'phil': 'Philipper',
  'kol': 'Kolosser',
  '1thess': '1. Thessalonicher',
  '2thess': '2. Thessalonicher',
  '1tim': '1. Timotheus',
  '2tim': '2. Timotheus',
  'tit': 'Titus',
  'phlm': 'Philemon',
  'hebr': 'Hebräer',
  'jak': 'Jakobus',
  '1petr': '1. Petrus',
  '2petr': '2. Petrus',
  '1joh': '1. Johannes',
  '2joh': '2. Johannes',
  '3joh': '3. Johannes',
  'jud': 'Judas',
  'offb': 'Offenbarung',
};

const normalizeInteger = (value) => {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
};

// WICHTIG: Suche nach KURZFORMEN statt Vollnamen!
const buildAbbreviationVariants = (book, chapter, verse) => {
  const variants = [];
  
  // Versuche das Buch als Kurzform zu erkennen
  const bookLower = (book || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  
  // Alle möglichen Kurzformen durchsuchen
  for (const [abbr, fullName] of Object.entries(BIBLE_ABBREVIATIONS)) {
    if (fullName.toLowerCase().includes(book.toLowerCase())) {
      // Gefunden! Jetzt verschiedene Suchvarianten
      variants.push(`${abbr} ${chapter}:${verse}`);
      variants.push(`${abbr} ${chapter} ${verse}`);
      variants.push(`${chapter}:${verse}`); // Nur Kapitel:Vers
      variants.push(`${chapter} ${verse}`); // Nur Kapitel Vers
    }
  }
  
  // Fallback: Füge auch direkte Kurzform hinzu
  if (bookLower.length <= 4) {
    variants.push(`${bookLower} ${chapter}:${verse}`);
    variants.push(`${bookLower} ${chapter} ${verse}`);
  }
  
  return Array.from(new Set(variants)); // Deduplizieren
};

// Fast ilike search mit Timeout
const performILikeSearch = async (query, limit) => {
  try {
    const { data, error } = await Promise.race([
      supabase
        .from('passages')
        .select(`
          id,
          plain_text,
          sections!inner(
            works!inner(
              title,
              title_original,
              authors!inner(
                name
              )
            )
          )
        `)
        .ilike('plain_text', `%${query}%`)
        .limit(limit),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 5000) // 5 second timeout
      ),
    ]);

    if (error) {
      console.warn('[churchQueryGateway] ilike search error', error);
      return [];
    }

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('[churchQueryGateway] ilike search exception', error.message);
    return [];
  }
};

export const queryChurchFathersGateway = async ({
  book,
  chapter,
  verse,
  verseText,
  limit = DEFAULT_LIMIT,
}) => {
  const normalizedBook = typeof book === 'string' ? book.trim() : '';
  const normalizedChapter = normalizeInteger(chapter);
  const normalizedVerse = normalizeInteger(verse);

  if (!normalizedBook || !normalizedChapter || !normalizedVerse) {
    console.log('[churchQueryGateway] Invalid parameters:', { normalizedBook, normalizedChapter, normalizedVerse });
    return { passages: [], meta: { reason: 'invalid-parameters' } };
  }

  const cappedLimit = Math.max(1, Math.min(limit, MAX_LIMIT));
  
  // WICHTIG: Verwende Kurzform-Varianten statt Vollnamen!
  const variants = buildAbbreviationVariants(normalizedBook, normalizedChapter, normalizedVerse);
  
  if (!variants.length) {
    console.log('[churchQueryGateway] No search variants generated');
    return { passages: [], meta: { reason: 'no-patterns' } };
  }

  console.log('[churchQueryGateway] Generated variants:', variants);

  try {
    const candidateRows = new Map();

    // Versuche jeden Variant nacheinander
    for (const variant of variants) {
      if (candidateRows.size >= cappedLimit * 2) break;

      console.log(`[churchQueryGateway] Trying: ${variant}`);
      
      const data = await performILikeSearch(variant, cappedLimit * 3);

      if (Array.isArray(data) && data.length > 0) {
        console.log(`[churchQueryGateway] Found ${data.length} results for: ${variant}`);
        data.forEach((row) => {
          if (row?.id && !candidateRows.has(row.id)) {
            candidateRows.set(row.id, row);
          }
        });
      }
    }

    if (!candidateRows.size) {
      console.log('[churchQueryGateway] No candidate rows found');
      return { passages: [], meta: { reason: 'no-results' } };
    }

    const data = Array.from(candidateRows.values());
    const passages = [];
    const seen = new Set();

    // Filtere die Ergebnisse
    for (const row of data) {
      if (!row?.id || seen.has(row.id)) continue;

      seen.add(row.id);
      const worksEntry = row.sections?.works;
      const authorEntry = worksEntry?.authors;
      const authorName =
        (Array.isArray(authorEntry) ? authorEntry[0]?.name : authorEntry?.name) || 'Unbekannter Autor';
      const workTitle =
        worksEntry?.title || worksEntry?.title_original || 'Unbekanntes Werk';
      passages.push({
        id: row.id,
        author: authorName,
        work: workTitle,
        excerpt: row.plain_text,
      });
      if (passages.length >= cappedLimit) break;
    }

    console.log('[churchQueryGateway] Final results:', passages.length);
    return { passages, meta: { reason: passages.length ? 'ok' : 'filtered-empty', count: passages.length } };
  } catch (error) {
    console.warn('[churchQueryGateway] Exception', error);
    return { passages: [], meta: { reason: 'exception', error } };
  }
};
