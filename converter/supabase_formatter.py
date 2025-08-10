import pandas as pd
import re
import os
from pathlib import Path

def create_supabase_ready_data():
    """
    Erstellt Supabase-bereite CSV-Dateien aus den rohen Kirchenvater-Daten
    """
    print("BKV SUPABASE FORMATTER")
    print("=" * 50)
    
    # Finde alle Kirchenvater-CSVs (außer der riesigen "Unbekannt"-Datei)
    csv_files = [f for f in Path('.').glob('kirchenvater_*.csv') 
                 if 'Unbekannt' not in f.name]
    
    print(f"Gefundene Kirchenvater-CSVs: {len(csv_files)}")
    
    all_supabase_data = []
    author_stats = {}
    
    for csv_file in csv_files:
        print(f"\nVerarbeite: {csv_file.name}")
        
        try:
            df = pd.read_csv(csv_file, encoding='utf-8')
            print(f"  Rohdaten: {len(df)} Einträge")
            
            # Extrahiere Autorname aus Dateiname
            author_name = extract_author_from_filename(csv_file.name)
            
            # Filtere nur deutsche Werke
            german_works = df[df['work_title'].str.contains('Deutsch', na=False)]
            print(f"  Deutsche Werke: {len(german_works)} Einträge")
            
            if len(german_works) == 0:
                print("  Keine deutschen Werke gefunden - übersprungen")
                continue
            
            # Verarbeite jedes Werk
            author_data = []
            for work_title in german_works['work_title'].unique():
                work_data = german_works[german_works['work_title'] == work_title]
                processed_work = process_work_for_supabase(author_name, work_title, work_data)
                author_data.extend(processed_work)
            
            # Speichere Autor-spezifische Datei
            save_author_supabase_csv(author_name, author_data)
            
            # Füge zu Gesamtdaten hinzu
            all_supabase_data.extend(author_data)
            author_stats[author_name] = len(author_data)
            
            print(f"  Supabase-bereit: {len(author_data)} Einträge")
            
        except Exception as e:
            print(f"  Fehler: {e}")
    
    # Speichere Master-Datei
    save_master_supabase_csv(all_supabase_data)
    
    # Zeige Statistiken
    show_final_statistics(author_stats, len(all_supabase_data))

def extract_author_from_filename(filename):
    """Extrahiert Autorname aus CSV-Dateiname"""
    # "kirchenvater_Augustinus_von_Hippo.csv" -> "Augustinus von Hippo"
    name = filename.replace('kirchenvater_', '').replace('.csv', '')
    return name.replace('_', ' ')

def process_work_for_supabase(author_name, work_title, work_data):
    """Verarbeitet ein Werk für Supabase-Upload"""
    
    # Bereinige Werktitel
    clean_title = clean_work_title(work_title)
    
    supabase_entries = []
    
    for idx, row in work_data.iterrows():
        # Bereinige Text gründlich
        clean_text = deep_clean_text(row['text'])
        
        # Teile in kleinere, sinnvolle Abschnitte
        paragraphs = split_into_paragraphs(clean_text)
        
        for paragraph_num, paragraph in enumerate(paragraphs, 1):
            if len(paragraph.strip()) > 50:  # Nur substantielle Absätze
                
                # Erstelle eindeutige ID
                entry_id = create_unique_id(author_name, clean_title, paragraph_num)
                
                supabase_entries.append({
                    'id': entry_id,
                    'author': author_name,
                    'work_title': clean_title,
                    'section': paragraph_num,
                    'text': paragraph.strip(),
                    'word_count': len(paragraph.split()),
                    'language': 'de'
                })
    
    return supabase_entries

def clean_work_title(title):
    """Bereinigt Werktitel von Metadaten"""
    # Entferne "Übersetzung (Deutsch): " und ähnliche Präfixe
    title = re.sub(r'Übersetzung \([^)]+\):\s*', '', title)
    title = re.sub(r'Kommentar \([^)]+\):\s*', '', title)
    
    # Entferne Suffixe wie (BKV), (SWKV), etc.
    title = re.sub(r'\s*\([^)]*\)\s*$', '', title)
    
    # Bereinige weitere Artefakte
    title = re.sub(r'\s+', ' ', title)
    
    return title.strip()

def deep_clean_text(text):
    """Gründliche Textbereinigung für Supabase"""
    if not text or pd.isna(text):
        return ""
    
    # Entferne Seitenzahlen
    text = re.sub(r'S\.\s*\d+', '', text)
    text = re.sub(r'^\s*\d+\s*', '', text, flags=re.MULTILINE)
    
    # Entferne Fußnoten-Referenzen
    text = re.sub(r'↩︎', '', text)
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'\(\d+\)', '', text)
    
    # Entferne Metadaten-Zeilen
    patterns_to_remove = [
        r'^.*Titel Werk:.*$',
        r'^.*Autor:.*$',
        r'^.*Identifier:.*$',
        r'^.*Tag:.*$',
        r'^.*Time:.*$',
        r'^.*UNTITLEd.*$',
        r'^.*UNTITLED.*$',
        r'^\s*S\s*$',
        r'^\s*\d+\s*$',
        r'^.*lib\.\s*I.*$',
        r'^.*Hist\..*$',
        r'^.*E\.\s*VIII.*$'
    ]
    
    for pattern in patterns_to_remove:
        text = re.sub(pattern, '', text, flags=re.MULTILINE | re.IGNORECASE)
    
    # Entferne übermäßige Leerzeichen und Zeilenwechsel
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'\n\s*\n', '\n', text)
    
    # Entferne Namen-Listen (Priester, Diakone)
    if 'Priester' in text and 'Diakon' in text:
        # Das ist wahrscheinlich eine Namensliste, entferne sie
        lines = text.split('\n')
        cleaned_lines = []
        for line in lines:
            if not (('Priester' in line or 'Diakon' in line) and len(line.split()) < 10):
                cleaned_lines.append(line)
        text = '\n'.join(cleaned_lines)
    
    return text.strip()

def split_into_paragraphs(text):
    """Teilt Text in sinnvolle Absätze für Supabase"""
    if not text:
        return []
    
    # Teile an doppelten Zeilenwechseln
    paragraphs = text.split('\n\n')
    
    # Filtere zu kurze oder zu lange Absätze
    good_paragraphs = []
    for para in paragraphs:
        para = para.strip()
        word_count = len(para.split())
        
        # Behalte nur Absätze mit 20-500 Wörtern
        if 20 <= word_count <= 500 and len(para) > 100:
            good_paragraphs.append(para)
        elif word_count > 500:
            # Teile sehr lange Absätze an Satzenden
            sentences = re.split(r'[.!?]+', para)
            current_chunk = []
            current_words = 0
            
            for sentence in sentences:
                sentence = sentence.strip()
                if not sentence:
                    continue
                    
                sentence_words = len(sentence.split())
                
                if current_words + sentence_words > 400:
                    if current_chunk:
                        chunk_text = '. '.join(current_chunk) + '.'
                        if len(chunk_text.split()) >= 20:
                            good_paragraphs.append(chunk_text)
                    current_chunk = [sentence]
                    current_words = sentence_words
                else:
                    current_chunk.append(sentence)
                    current_words += sentence_words
            
            # Letzten Chunk hinzufügen
            if current_chunk:
                chunk_text = '. '.join(current_chunk) + '.'
                if len(chunk_text.split()) >= 20:
                    good_paragraphs.append(chunk_text)
    
    return good_paragraphs

def create_unique_id(author, work_title, section):
    """Erstellt eindeutige ID für Supabase"""
    # Bereinige für ID-Verwendung
    author_clean = re.sub(r'[^a-zA-Z0-9]', '_', author)
    work_clean = re.sub(r'[^a-zA-Z0-9]', '_', work_title)
    
    # Kürze bei Bedarf
    if len(work_clean) > 30:
        work_clean = work_clean[:30]
    
    return f"{author_clean}_{work_clean}_{section}"

def save_author_supabase_csv(author_name, author_data):
    """Speichert Supabase-bereite CSV für einen Autor"""
    if not author_data:
        return
    
    filename = f"supabase_{author_name.replace(' ', '_')}.csv"
    df = pd.DataFrame(author_data)
    df.to_csv(filename, index=False, encoding='utf-8')
    print(f"  Gespeichert: {filename}")

def save_master_supabase_csv(all_data):
    """Speichert Master-CSV für Supabase"""
    if not all_data:
        return
    
    df = pd.DataFrame(all_data)
    
    # Sortiere nach Autor und Werk
    df = df.sort_values(['author', 'work_title', 'section'])
    
    # Speichere Master-Datei
    df.to_csv('supabase_ALL_kirchenvaeter.csv', index=False, encoding='utf-8')
    
    # Erstelle auch aufgeteilte Dateien für große Uploads (max 1000 Einträge)
    chunk_size = 1000
    for i in range(0, len(df), chunk_size):
        chunk = df.iloc[i:i+chunk_size]
        chunk_filename = f'supabase_kirchenvaeter_part_{i//chunk_size + 1}.csv'
        chunk.to_csv(chunk_filename, index=False, encoding='utf-8')
        print(f"Chunk gespeichert: {chunk_filename} ({len(chunk)} Einträge)")

def show_final_statistics(author_stats, total_entries):
    """Zeigt finale Statistiken"""
    print("\n" + "=" * 50)
    print("SUPABASE-BEREITE DATEN ERSTELLT!")
    print("=" * 50)
    
    print(f"Gesamteinträge: {total_entries}")
    print(f"Anzahl Autoren: {len(author_stats)}")
    print(f"Durchschnitt pro Autor: {total_entries / len(author_stats):.1f}")
    
    print("\nTOP 10 AUTOREN:")
    print("-" * 30)
    for author, count in sorted(author_stats.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"{author}: {count} Einträge")
    
    print("\nDATEIEN FÜR SUPABASE-UPLOAD:")
    print("-" * 30)
    print("✓ supabase_ALL_kirchenvaeter.csv (Master-Datei)")
    print("✓ supabase_kirchenvaeter_part_*.csv (Aufgeteilte Dateien)")
    print("✓ supabase_[Autorname].csv (Pro Autor)")
    
    print("\nSUPABASE TABLE SCHEMA:")
    print("-" * 30)
    print("CREATE TABLE kirchenvaeter (")
    print("  id TEXT PRIMARY KEY,")
    print("  author TEXT NOT NULL,")
    print("  work_title TEXT NOT NULL,")
    print("  section INTEGER NOT NULL,")
    print("  text TEXT NOT NULL,")
    print("  word_count INTEGER NOT NULL,")
    print("  language TEXT DEFAULT 'de'")
    print(");")

if __name__ == "__main__":
    create_supabase_ready_data()
