"""
SUPABASE KIRCHENVATER TABELLE - SQL Setup

Führe diese SQL-Kommandos in der Supabase SQL-Konsole aus:
https://supabase.com/dashboard/project/bpjikoubhxsmsswgixix/sql
"""

print("🔧 SUPABASE KIRCHENVATER TABELLE SETUP")
print("=" * 50)

sql_commands = """
-- 1. Erstelle die Kirchenvater-Tabelle
CREATE TABLE IF NOT EXISTS kirchenvater (
    id TEXT PRIMARY KEY,
    author TEXT NOT NULL,
    work_title TEXT NOT NULL,
    section INTEGER NOT NULL,
    text TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    language TEXT DEFAULT 'de',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Erstelle Indizes für bessere Performance
CREATE INDEX IF NOT EXISTS idx_kirchenvater_author ON kirchenvater(author);
CREATE INDEX IF NOT EXISTS idx_kirchenvater_work ON kirchenvater(work_title);
CREATE INDEX IF NOT EXISTS idx_kirchenvater_language ON kirchenvater(language);

-- 3. Erstelle Volltext-Suchindex
CREATE INDEX IF NOT EXISTS idx_kirchenvater_text_search 
ON kirchenvater USING gin(to_tsvector('german', text));

-- 4. Aktiviere Row Level Security
ALTER TABLE kirchenvater ENABLE ROW LEVEL SECURITY;

-- 5. Lösche alle vorhandenen Policies (falls vorhanden)
DROP POLICY IF EXISTS "Public read access" ON kirchenvater;
DROP POLICY IF EXISTS "Public insert access" ON kirchenvater;
DROP POLICY IF EXISTS "Allow anonymous read" ON kirchenvater;
DROP POLICY IF EXISTS "Allow anonymous insert" ON kirchenvater;

-- 6. Erstelle neue Policies für anonymen Zugriff
CREATE POLICY "Allow anonymous read" ON kirchenvater
FOR SELECT USING (true);

CREATE POLICY "Allow anonymous insert" ON kirchenvater
FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anonymous update" ON kirchenvater
FOR UPDATE USING (true);

-- 7. Gewähre anonymen Zugriff auf die Tabelle
GRANT SELECT, INSERT, UPDATE ON kirchenvater TO anon;
GRANT SELECT, INSERT, UPDATE ON kirchenvater TO authenticated;
"""

print("📋 SQL-Kommandos für Supabase:")
print("-" * 50)
print(sql_commands)
print("-" * 50)

print("\n🔗 ANLEITUNG:")
print("1. Gehe zu: https://supabase.com/dashboard/project/bpjikoubhxsmsswgixix/sql")
print("2. Kopiere die obigen SQL-Kommandos in den Editor")
print("3. Klicke auf 'RUN' um die Tabelle und Policies zu erstellen")
print("4. Führe dann das Upload-Script aus: py supabase_upload_final.py")

print("\n✅ Nach dem Setup:")
print("- Die Tabelle 'kirchenvater' ist erstellt")
print("- Row Level Security ist aktiviert")
print("- Anonymer Lese- und Schreibzugriff ist erlaubt")
print("- Upload-Script kann die Daten einfügen")
print("- Deine App kann die Daten lesen")
