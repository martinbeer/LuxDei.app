"""
SUPABASE SETUP - Kirchenväter Tabelle erstellen

Führe diese SQL-Kommandos in der Supabase SQL-Konsole aus:
https://supabase.com/dashboard/project/bpjikoubhxsmsswgixix/sql

Dann kannst du das Upload-Script ausführen.
"""

print("🔧 SUPABASE TABELLE ERSTELLEN")
print("=" * 50)

sql_commands = """
-- 1. Erstelle die Kirchenväter-Tabelle
CREATE TABLE IF NOT EXISTS kirchenvaeter (
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
CREATE INDEX IF NOT EXISTS idx_kirchenvaeter_author ON kirchenvaeter(author);
CREATE INDEX IF NOT EXISTS idx_kirchenvaeter_work ON kirchenvaeter(work_title);
CREATE INDEX IF NOT EXISTS idx_kirchenvaeter_language ON kirchenvaeter(language);

-- 3. Erstelle Volltext-Suchindex (optional)
CREATE INDEX IF NOT EXISTS idx_kirchenvaeter_text_search 
ON kirchenvaeter USING gin(to_tsvector('german', text));

-- 4. Aktiviere Row Level Security (RLS)
ALTER TABLE kirchenvaeter ENABLE ROW LEVEL SECURITY;

-- 5. Erstelle Policy für öffentlichen Lesezugriff
CREATE POLICY "Public read access" ON kirchenvaeter
FOR SELECT USING (true);

-- 6. Erstelle Policy für öffentlichen Schreibzugriff (für Upload)
CREATE POLICY "Public insert access" ON kirchenvaeter
FOR INSERT WITH CHECK (true);
"""

print("📋 SQL-Kommandos für Supabase:")
print("-" * 50)
print(sql_commands)
print("-" * 50)

print("\n🔗 ANLEITUNG:")
print("1. Gehe zu: https://supabase.com/dashboard/project/bpjikoubhxsmsswgixix/sql")
print("2. Kopiere die obigen SQL-Kommandos in den Editor")
print("3. Klicke auf 'RUN' um die Tabelle zu erstellen")
print("4. Führe dann das Upload-Script aus: py supabase_upload_final.py")

print("\n📊 TABELLEN-SCHEMA:")
print("- id: Eindeutige ID für jeden Text-Abschnitt")
print("- author: Name des Kirchenvaters")
print("- work_title: Titel des Werks")
print("- section: Abschnittsnummer innerhalb des Werks")
print("- text: Der eigentliche Text-Inhalt")
print("- word_count: Anzahl der Wörter")
print("- language: Sprache (immer 'de' für Deutsch)")
print("- created_at: Zeitstempel der Erstellung")

print("\n✅ Nach der Tabellenerstellung kannst du:")
print("- Die Daten mit dem Upload-Script hochladen")
print("- Die Tabelle über den Table Editor durchsuchen")
print("- Volltext-Suche in deutschen Texten verwenden")
print("- Die Daten in deiner LuxDei-App verwenden")
