import pandas as pd
import re
import os
from pathlib import Path

def clean_existing_supabase_csvs():
    """
    Bereinigt bereits erstellte Supabase-CSVs von verbleibendem Müll
    """
    print("CSV CLEANER - Nachbereinigung")
    print("=" * 50)
    
    # Finde alle Supabase-CSVs
    csv_files = list(Path('.').glob('supabase_*.csv'))
    
    if not csv_files:
        print("Keine supabase_*.csv Dateien gefunden!")
        return
    
    print(f"Gefundene Supabase-CSVs: {len(csv_files)}")
    
    total_cleaned = 0
    total_removed = 0
    
    for csv_file in csv_files:
        print(f"\nBereinige: {csv_file.name}")
        
        try:
            # CSV laden
            df = pd.read_csv(csv_file, encoding='utf-8')
            original_count = len(df)
            print(f"  Original: {original_count} Einträge")
            
            # Bereinige Text-Spalte
            if 'text' in df.columns:
                df['text'] = df['text'].apply(deep_clean_final_text)
            
            # Entferne Einträge mit zu kurzem oder schlechtem Text
            df_cleaned = df[df['text'].apply(is_valid_text_entry)]
            
            # Entferne Duplikate basierend auf Text-Inhalt
            df_cleaned = remove_text_duplicates(df_cleaned)
            
            # Aktualisiere word_count
            if 'text' in df_cleaned.columns and 'word_count' in df_cleaned.columns:
                df_cleaned['word_count'] = df_cleaned['text'].apply(lambda x: len(str(x).split()) if pd.notna(x) else 0)
            
            # Entferne Einträge mit zu wenig Wörtern
            df_cleaned = df_cleaned[df_cleaned['word_count'] >= 15]
            
            cleaned_count = len(df_cleaned)
            removed_count = original_count - cleaned_count
            
            print(f"  Bereinigt: {cleaned_count} Einträge")
            print(f"  Entfernt: {removed_count} schlechte Einträge")
            
            # Speichere bereinigte Version
            backup_name = csv_file.name.replace('.csv', '_backup.csv')
            csv_file.rename(backup_name)
            print(f"  Backup: {backup_name}")
            
            df_cleaned.to_csv(csv_file.name, index=False, encoding='utf-8')
            print(f"  Gespeichert: {csv_file.name}")
            
            total_cleaned += cleaned_count
            total_removed += removed_count
            
        except Exception as e:
            print(f"  FEHLER: {e}")
    
    # Finale Statistiken
    print("\n" + "=" * 50)
    print("BEREINIGUNG ABGESCHLOSSEN!")
    print("=" * 50)
    print(f"Gesamt bereinigte Einträge: {total_cleaned}")
    print(f"Gesamt entfernte Einträge: {total_removed}")

def deep_clean_final_text(text):
    """Finale, aggressive Textbereinigung"""
    if not text or pd.isna(text):
        return ""
    
    text = str(text)
    
    # Entferne häufige Artefakte am Ende
    text = re.sub(r',\s*de\s*$', '', text)  # ", de" am Ende
    text = re.sub(r',\s*\d+\s*$', '', text)  # ", 398" am Ende
    text = re.sub(r'\s+\d+\s*$', '', text)  # " 398" am Ende
    text = re.sub(r'^\d+\s*,', '', text)  # "398," am Anfang
    
    # Entferne Seitenzahlen und Referenzen
    text = re.sub(r'S\.\s*\d+', '', text)
    text = re.sub(r'^\s*\d+\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\s+\d+\s*$', '', text, flags=re.MULTILINE)
    
    # Entferne Fußnoten komplett
    text = re.sub(r'↩︎', '', text)
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'\(\d+\)', '', text)
    text = re.sub(r'\d+\.', '', text)  # Nummerierungen
    
    # Entferne URL-Artefakte und Metadaten
    text = re.sub(r'http[s]?://\S+', '', text)
    text = re.sub(r'www\.\S+', '', text)
    text = re.sub(r'[A-Z]{2,}\s*\d+', '', text)  # CAPS + Zahlen
    
    # Entferne typische BKV-Metadaten
    patterns_to_remove = [
        r'Titel Werk:.*?(?=\w)',
        r'Autor:.*?(?=\w)',
        r'Identifier:.*?(?=\w)',
        r'Tag:.*?(?=\w)',
        r'Time:.*?(?=\w)',
        r'CPG\s*\d+',
        r'BKV.*?(?=\w)',
        r'SWKV.*?(?=\w)',
        r'Übersetzung\s*\([^)]*\):',
        r'Kommentar\s*\([^)]*\):',
        r'lib\.\s*[IVX]+',
        r'Hist\.\s*\w+',
        r'E\.\s*[IVX]+',
        r'c\.\s*\d+',
        r'cap\.\s*\d+',
        r'§\s*\d+',
        r'Nr\.\s*\d+',
        r'n\.\s*\d+'
    ]
    
    for pattern in patterns_to_remove:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE)
    
    # Entferne Listen von Namen (Priester, Diakone, etc.)
    if 'Priester' in text or 'Diakon' in text:
        lines = text.split('\n')
        cleaned_lines = []
        for line in lines:
            line_words = line.strip().split()
            # Überspringe Zeilen mit typischen Namensmustern
            if len(line_words) <= 3 and any(word in line for word in ['Priester', 'Diakon', 'Bischof']):
                continue
            if len(line_words) == 2 and re.match(r'^[A-Z][a-z]+,?\s+[A-Z][a-z]+\.?$', line.strip()):
                continue  # "Marcus, Priester" etc.
            cleaned_lines.append(line)
        text = '\n'.join(cleaned_lines)
    
    # Entferne leere Klammern und überschüssige Interpunktion
    text = re.sub(r'\(\s*\)', '', text)
    text = re.sub(r'\[\s*\]', '', text)
    text = re.sub(r'\s*[,;]\s*[,;]+', ',', text)
    text = re.sub(r'\s*\.\s*\.+', '.', text)
    
    # Normalisiere Leerzeichen
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'\n\s*\n', '\n', text)
    
    # Entferne führende/trailing Sonderzeichen
    text = re.sub(r'^[^\w"„"]+', '', text)
    text = re.sub(r'[^\w".!?"„"]+$', '', text)
    
    return text.strip()

def is_valid_text_entry(text):
    """Prüft ob ein Text-Eintrag gültig und substantiell ist"""
    if not text or pd.isna(text):
        return False
    
    text = str(text).strip()
    
    # Zu kurz
    if len(text) < 50:
        return False
    
    # Zu wenig Wörter
    words = text.split()
    if len(words) < 15:
        return False
    
    # Nur Zahlen oder Sonderzeichen
    if re.match(r'^[\d\s\W]+$', text):
        return False
    
    # Nur Großbuchstaben (wahrscheinlich Metadaten)
    if text.isupper() and len(words) < 20:
        return False
    
    # Typische Metadaten-Muster
    metadata_patterns = [
        r'^(Titel|Autor|Identifier|Tag|Time|CPG|BKV|SWKV)',
        r'^Übersetzung\s*\(',
        r'^Kommentar\s*\(',
        r'^\d+\s*$',
        r'^S\.\s*\d+',
        r'^lib\.\s*[IVX]',
        r'^Hist\.\s*',
        r'^E\.\s*[IVX]'
    ]
    
    for pattern in metadata_patterns:
        if re.match(pattern, text, re.IGNORECASE):
            return False
    
    # Zu hoher Anteil an Zahlen
    digit_ratio = len(re.findall(r'\d', text)) / len(text)
    if digit_ratio > 0.3:
        return False
    
    # Listen-Erkennng (viele kurze Begriffe)
    short_words = [w for w in words if len(w) <= 3]
    if len(short_words) / len(words) > 0.7:
        return False
    
    return True

def remove_text_duplicates(df):
    """Entfernt Duplikate basierend auf ähnlichem Textinhalt"""
    if 'text' not in df.columns:
        return df
    
    # Erstelle normalisierte Version für Duplikat-Erkennung
    df['text_normalized'] = df['text'].apply(normalize_for_duplicate_detection)
    
    # Entferne exakte Duplikate
    df_unique = df.drop_duplicates(subset=['text_normalized'])
    
    # Entferne die Hilfsspalte
    df_unique = df_unique.drop('text_normalized', axis=1)
    
    return df_unique

def normalize_for_duplicate_detection(text):
    """Normalisiert Text für Duplikat-Erkennung"""
    if not text or pd.isna(text):
        return ""
    
    text = str(text).lower()
    
    # Entferne alle Sonderzeichen und Zahlen
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\d+', '', text)
    text = re.sub(r'\s+', ' ', text)
    
    # Nimm nur die ersten 100 Zeichen für Vergleich
    return text.strip()[:100]

def create_final_statistics():
    """Erstellt finale Statistiken nach Bereinigung"""
    print("\n" + "=" * 50)
    print("FINALE STATISTIKEN NACH BEREINIGUNG")
    print("=" * 50)
    
    csv_files = list(Path('.').glob('supabase_*.csv'))
    total_entries = 0
    author_counts = {}
    
    for csv_file in csv_files:
        if 'backup' in csv_file.name:
            continue
            
        try:
            df = pd.read_csv(csv_file, encoding='utf-8')
            entries = len(df)
            total_entries += entries
            
            print(f"{csv_file.name}: {entries} Einträge")
            
            # Sammle Autor-Statistiken
            if 'author' in df.columns:
                for author in df['author'].unique():
                    if pd.notna(author):
                        author_counts[author] = author_counts.get(author, 0) + len(df[df['author'] == author])
        
        except Exception as e:
            print(f"Fehler bei {csv_file.name}: {e}")
    
    print(f"\nGESAMT: {total_entries} bereinigte Einträge")
    print(f"AUTOREN: {len(author_counts)}")
    
    if author_counts:
        print("\nTOP 10 AUTOREN NACH BEREINIGUNG:")
        print("-" * 40)
        for author, count in sorted(author_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
            print(f"{author}: {count} Einträge")

if __name__ == "__main__":
    # Bereinige CSVs
    clean_existing_supabase_csvs()
    
    # Zeige finale Statistiken
    create_final_statistics()
    
    print("\n✅ Bereinigung abgeschlossen!")
    print("Backup-Dateien (*_backup.csv) können gelöscht werden wenn alles OK ist.")
