import pandas as pd
import re
import os
from pathlib import Path

def clean_and_format_for_supabase():
    """
    Bereinigt und formatiert die BKV-CSVs für Supabase-Import
    """
    
    # Finde alle Kirchenvater-CSVs
    csv_files = list(Path('.').glob('kirchenvater_*.csv'))
    
    if not csv_files:
        print("Keine Kirchenvater-CSVs gefunden!")
        return
    
    all_clean_data = []
    
    for csv_file in csv_files:
        print(f"Verarbeite: {csv_file}")
        
        try:
            df = pd.read_csv(csv_file, encoding='utf-8')
            
            # Gruppiere nach Werk und bereinige
            works = df['werk'].unique()
            
            for work in works:
                work_data = df[df['werk'] == work].copy()
                
                # Bereinige Werkname
                clean_work_name = clean_work_title(work)
                
                # Kombiniere Texte zu sinnvollen Abschnitten
                combined_text = combine_verses_to_paragraphs(work_data)
                
                # Erstelle bereinigte Einträge
                for i, paragraph in enumerate(combined_text, 1):
                    if len(paragraph.strip()) > 100:  # Nur substantielle Absätze
                        clean_entry = {
                            'id': f"{work_data['author'].iloc[0].replace(' ', '_')}_{clean_work_name.replace(' ', '_')}_{i}",
                            'author': work_data['author'].iloc[0],
                            'work_title': clean_work_name,
                            'section_number': i,
                            'text_content': paragraph.strip(),
                            'word_count': len(paragraph.split()),
                            'language': 'deutsch'
                        }
                        all_clean_data.append(clean_entry)
                        
        except Exception as e:
            print(f"Fehler bei {csv_file}: {e}")
    
    # Speichere bereinigte Daten
    if all_clean_data:
        clean_df = pd.DataFrame(all_clean_data)
        
        # Validiere für Supabase
        clean_df = validate_csv_for_supabase(clean_df)
        
        # Hauptdatei für Supabase-Upload
        clean_df.to_csv('bkv_supabase_ready.csv', index=False, encoding='utf-8')
        print(f"\nSUPABASE-UPLOAD-BEREITE DATEI ERSTELLT:")
        print(f"✓ Datei: bkv_supabase_ready.csv")
        print(f"✓ Einträge: {len(clean_df)}")
        print(f"✓ Dateigröße: {os.path.getsize('bkv_supabase_ready.csv') / 1024 / 1024:.1f} MB")
        print(f"✓ Encoding: UTF-8")
        
        # Zusätzliche Statistiken
        create_supabase_statistics(clean_df)
        
        # Erstelle auch aufgeteilte Dateien für große Uploads
        create_batch_files(clean_df)
        
    else:
        print("Keine bereinigten Daten gefunden!")

def clean_work_title(work_title):
    """Bereinigt Werktitel von Metadaten"""
    
    # Entferne "Übersetzung (Deutsch): " Prefix
    title = re.sub(r'Übersetzung \(Deutsch\):\s*', '', work_title)
    
    # Entferne (SWKV) und ähnliche Suffixe
    title = re.sub(r'\s*\([^)]*\)\s*$', '', title)
    
    # Entferne Nummerierungen am Ende
    title = re.sub(r'\s*\d+\s*$', '', title)
    
    return title.strip()

def combine_verses_to_paragraphs(work_data):
    """Kombiniert kurze Verse zu sinnvollen Absätzen"""
    
    texts = work_data['text'].tolist()
    combined_paragraphs = []
    current_paragraph = []
    
    for text in texts:
        if not text or pd.isna(text):
            continue
            
        # Bereinige Text
        clean_text = clean_individual_text(str(text))
        
        if not clean_text:
            continue
            
        # Prüfe, ob Text eine neue Sektion beginnt
        if is_section_start(clean_text):
            # Speichere vorherigen Absatz
            if current_paragraph:
                combined_paragraphs.append(' '.join(current_paragraph))
                current_paragraph = []
        
        # Füge Text zum aktuellen Absatz hinzu
        current_paragraph.append(clean_text)
        
        # Prüfe, ob Absatz komplett ist (bei Satzende)
        if clean_text.endswith('.') and len(' '.join(current_paragraph)) > 200:
            combined_paragraphs.append(' '.join(current_paragraph))
            current_paragraph = []
    
    # Füge letzten Absatz hinzu
    if current_paragraph:
        combined_paragraphs.append(' '.join(current_paragraph))
    
    return combined_paragraphs

def clean_individual_text(text):
    """Bereinigt einzelne Textzeilen"""
    
    # Entferne häufige Metadaten-Muster
    patterns_to_remove = [
        r'^UNTITLED.*',
        r'^Titel Werk:.*',
        r'^Autor:.*',
        r'^Identifier:.*',
        r'^Tag:.*',
        r'^Time:.*',
        r'^\d+\s*$',  # Nur Zahlen
        r'^S\s*$',    # Nur "S"
        r'^sehr fehlerhaft.*',
        r'^in Cassiodor.*',
        r'^Alexander folgte.*',
        r'^Februar.*',
        r'^Das heißt:.*',
        r'^In mir.*',
        r'^\) Ihm folgte.*'
    ]
    
    for pattern in patterns_to_remove:
        if re.match(pattern, text, re.IGNORECASE):
            return ""
    
    # Entferne Seitenzahlen am Anfang
    text = re.sub(r'^\d+\s+', '', text)
    
    # Entferne Fußnoten-Referenzen
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'\d+\s*$', '', text)  # Zahlen am Ende
    
    # Bereinige Anführungszeichen
    text = re.sub(r'[""„"]', '"', text)
    
    # Entferne übermäßige Leerzeichen
    text = re.sub(r'\s+', ' ', text)
    
    return text.strip()

def is_section_start(text):
    """Prüft, ob Text eine neue Sektion beginnt"""
    
    section_indicators = [
        r'^Kapitel\s+\d+',
        r'^Kap\.\s+\d+',
        r'^\d+\.\s+[A-Z]',
        r'^[A-Z][a-z]+\s+\d+',
        r'^Brief\s+\d+',
        r'^Buch\s+\d+'
    ]
    
    for pattern in section_indicators:
        if re.match(pattern, text):
            return True
    
    return False

def create_supabase_statistics(df):
    """Erstellt Statistiken für Supabase-Import"""
    
    stats = {
        'total_entries': len(df),
        'total_authors': df['author'].nunique(),
        'total_works': df['work_title'].nunique(),
        'total_words': df['word_count'].sum(),
        'avg_words_per_entry': df['word_count'].mean(),
        'authors_list': df['author'].unique().tolist(),
        'works_per_author': df.groupby('author')['work_title'].nunique().to_dict()
    }
    
    # Speichere Statistiken
    with open('supabase_import_stats.txt', 'w', encoding='utf-8') as f:
        f.write("BKV SUPABASE IMPORT STATISTIKEN\n")
        f.write("=" * 50 + "\n\n")
        
        f.write(f"Gesamteinträge: {stats['total_entries']}\n")
        f.write(f"Autoren: {stats['total_authors']}\n")
        f.write(f"Werke: {stats['total_works']}\n")
        f.write(f"Gesamtwörter: {stats['total_words']:,}\n")
        f.write(f"Durchschnittliche Wörter pro Eintrag: {stats['avg_words_per_entry']:.1f}\n\n")
        
        f.write("AUTOREN:\n")
        for author in sorted(stats['authors_list']):
            work_count = stats['works_per_author'][author]
            author_entries = len(df[df['author'] == author])
            f.write(f"- {author}: {work_count} Werke, {author_entries} Einträge\n")
    
    print("Statistiken gespeichert in: supabase_import_stats.txt")

def validate_csv_for_supabase(df):
    """Validiert und optimiert CSV für Supabase-Upload"""
    
    print("\nVALIDIERUNG FÜR SUPABASE-UPLOAD:")
    print("=" * 40)
    
    # Prüfe Spaltenformate
    print("Spaltenformate:")
    for col in df.columns:
        dtype = df[col].dtype
        null_count = df[col].isnull().sum()
        print(f"  {col}: {dtype} ({null_count} NULL-Werte)")
    
    # Prüfe auf problematische Zeichen
    text_issues = 0
    for idx, row in df.iterrows():
        text = str(row['text_content'])
        # Prüfe auf problematische Zeichen für Supabase
        if any(ord(c) > 65535 for c in text):  # Unicode-Probleme
            text_issues += 1
    
    if text_issues > 0:
        print(f"  WARNUNG: {text_issues} Einträge mit problematischen Unicode-Zeichen gefunden")
    
    # Prüfe ID-Eindeutigkeit
    duplicate_ids = df['id'].duplicated().sum()
    if duplicate_ids > 0:
        print(f"  WARNUNG: {duplicate_ids} doppelte IDs gefunden")
    
    # Prüfe Textlängen
    max_text_length = df['text_content'].str.len().max()
    avg_text_length = df['text_content'].str.len().mean()
    print(f"  Maximale Textlänge: {max_text_length:,} Zeichen")
    print(f"  Durchschnittliche Textlänge: {avg_text_length:.0f} Zeichen")
    
    # Supabase-Upload-Empfehlungen
    print("\nSUPABASE-UPLOAD-EMPFEHLUNGEN:")
    print("- Verwenden Sie den Supabase Dashboard CSV-Import")
    print("- Stellen Sie sicher, dass die Spaltentypen korrekt erkannt werden")
    print("- Bei großen Dateien: Aufteilen in kleinere Batches (< 10MB)")
    print(f"- Ihre Datei: {os.path.getsize('bkv_supabase_ready.csv') / 1024 / 1024:.1f} MB")
    
    return df

def create_batch_files(df, batch_size=1000):
    """Erstellt aufgeteilte CSV-Dateien für große Uploads"""
    
    if len(df) <= batch_size:
        print("Datei ist klein genug, keine Aufteilung nötig")
        return
    
    num_batches = (len(df) + batch_size - 1) // batch_size
    print(f"\nERSTELLE BATCH-DATEIEN FÜR UPLOAD:")
    print(f"Teile {len(df)} Einträge in {num_batches} Batches à {batch_size} Einträge")
    
    for i in range(num_batches):
        start_idx = i * batch_size
        end_idx = min((i + 1) * batch_size, len(df))
        batch_df = df.iloc[start_idx:end_idx]
        
        filename = f'bkv_supabase_batch_{i+1:02d}.csv'
        batch_df.to_csv(filename, index=False, encoding='utf-8')
        print(f"✓ {filename}: {len(batch_df)} Einträge")
    
    print(f"\nFür große Uploads: Laden Sie die Batch-Dateien einzeln hoch")

def create_upload_guide():
    """Erstellt Anleitung für Supabase-Upload"""
    
    guide = """
ANLEITUNG: BKV-DATEN IN SUPABASE HOCHLADEN
==========================================

DATEI-FORMAT:
✓ bkv_supabase_ready.csv - Hauptdatei mit allen Daten
✓ bkv_supabase_batch_XX.csv - Aufgeteilte Dateien (falls nötig)

SPALTEN-STRUKTUR:
- id: Eindeutige ID (VARCHAR, Primary Key)
- author: Autor des Werks (VARCHAR)
- work_title: Titel des Werks (VARCHAR)  
- section_number: Abschnittsnummer (INTEGER)
- text_content: Textinhalt (TEXT)
- word_count: Anzahl Wörter (INTEGER)
- language: Sprache (VARCHAR, immer "deutsch")

UPLOAD-SCHRITTE:
1. Öffnen Sie Ihr Supabase Dashboard
2. Gehen Sie zu "Table Editor"
3. Klicken Sie auf "New Table" oder verwenden Sie bestehende Tabelle
4. Wählen Sie "Import data from CSV"
5. Laden Sie bkv_supabase_ready.csv hoch
6. Überprüfen Sie die Spaltentypen:
   - id: text (Primary Key)
   - author: text
   - work_title: text
   - section_number: int4
   - text_content: text
   - word_count: int4
   - language: text
7. Importieren Sie die Daten

EMPFEHLUNGEN:
- Bei Fehlern: Verwenden Sie die Batch-Dateien
- Aktivieren Sie RLS (Row Level Security) nach dem Import
- Erstellen Sie Indizes für bessere Performance
- Testen Sie mit einer kleinen Batch-Datei zuerst

NACHBEARBEITUNG:
- Erstellen Sie einen Index auf der 'author' Spalte
- Erstellen Sie einen Volltext-Index auf 'text_content'
- Setzen Sie RLS-Policies für Ihren Use Case

Bei Problemen: Prüfen Sie die Logs und die Validierungsausgabe.
"""
    
    with open('supabase_upload_guide.txt', 'w', encoding='utf-8') as f:
        f.write(guide)
    
    print("Upload-Anleitung gespeichert in: supabase_upload_guide.txt")

def preview_supabase_data():
    """Zeigt Preview der Supabase-bereiten Daten"""
    
    try:
        df = pd.read_csv('bkv_supabase_ready.csv', encoding='utf-8')
        
        print("\nSUPABASE-UPLOAD PREVIEW:")
        print("=" * 50)
        print(f"✓ Datei: bkv_supabase_ready.csv")
        print(f"✓ Spalten: {list(df.columns)}")
        print(f"✓ Zeilen: {len(df):,}")
        print(f"✓ Dateigröße: {os.path.getsize('bkv_supabase_ready.csv') / 1024 / 1024:.1f} MB")
        print(f"✓ Encoding: UTF-8")
        
        print("\nERSTE 2 EINTRÄGE ALS BEISPIEL:")
        for i in range(min(2, len(df))):
            row = df.iloc[i]
            print(f"\n--- Eintrag {i+1} ---")
            print(f"ID: {row['id']}")
            print(f"Autor: {row['author']}")
            print(f"Werk: {row['work_title']}")
            print(f"Abschnitt: {row['section_number']}")
            print(f"Wörter: {row['word_count']}")
            print(f"Text: {row['text_content'][:150]}...")
            
        print(f"\n✓ BEREIT FÜR SUPABASE-UPLOAD!")
        
    except Exception as e:
        print(f"Fehler beim Preview: {e}")

if __name__ == "__main__":
    print("BKV Supabase Formatter gestartet...")
    print("Bereitet CSV-Dateien für Ihren Supabase-Upload vor...\n")
    
    clean_and_format_for_supabase()
    preview_supabase_data()
    create_upload_guide()
    
    print("\n" + "="*60)
    print("ZUSAMMENFASSUNG:")
    print("✓ CSV-Dateien für Supabase-Upload bereit")
    print("✓ Validierung durchgeführt")
    print("✓ Upload-Anleitung erstellt")
    print("✓ Sie können jetzt die Dateien in Supabase hochladen")
    print("="*60)
