import { supabase } from './supabase';

/**
 * Erstelle die church_fathers_cache Tabelle wenn sie nicht existiert
 */
export const ensureCacheTableExists = async () => {
  try {
    // Versuche die Tabelle zu lesen - wenn error code 42P01 (not found), dann erstelle sie
    const { error: readError } = await supabase
      .from('church_fathers_cache')
      .select('*')
      .limit(1);

    // Wenn Fehler "PGRST116" oder "42P01" = Tabelle existiert nicht
    if (readError && (readError.code === 'PGRST116' || readError.code === '42P01')) {
      console.log('[createCacheTable] Table does not exist, attempting to create...');
      
      // Erstelle die Tabelle über SQL
      const { error: createError } = await supabase.rpc('create_church_fathers_cache_table');
      
      if (createError) {
        console.warn('[createCacheTable] RPC method not available, table might need manual creation');
        // Das ist ok - die Tabelle könnte manuell erstellt werden müssen
        // Aber wir können auch einfach weitermachen, da die API-Fehler nett abgefangen werden
      } else {
        console.log('[createCacheTable] Table created successfully');
      }
    } else if (readError) {
      console.warn('[createCacheTable] Unexpected error:', readError);
    } else {
      console.log('[createCacheTable] Table exists');
    }
  } catch (error) {
    console.warn('[createCacheTable] Error checking/creating table:', error);
    // Fehler sind nicht kritisch - die API wird trotzdem funktionieren
  }
};

/**
 * SQL zum manuellen Erstellen der Tabelle (falls nötig):
 * 
 * CREATE TABLE IF NOT EXISTS church_fathers_cache (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   cache_key TEXT UNIQUE NOT NULL,
 *   book TEXT NOT NULL,
 *   chapter INTEGER NOT NULL,
 *   verse INTEGER NOT NULL,
 *   translation_table TEXT,
 *   model TEXT,
 *   response_json JSONB,
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
 * );
 * 
 * CREATE INDEX idx_church_fathers_cache_key ON church_fathers_cache(cache_key);
 * CREATE INDEX idx_church_fathers_cache_verse ON church_fathers_cache(book, chapter, verse);
 */
