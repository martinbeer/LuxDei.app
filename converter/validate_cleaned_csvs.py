import pandas as pd
import re
from pathlib import Path

def validate_cleaned_csvs():
    """
    Überprüft die bereinigten CSV-Dateien auf verbleibende Artefakte
    """
    print("VALIDIERUNG DER BEREINIGTEN CSV-DATEIEN")
    print("=" * 50)
    
    csv_files = [f for f in Path('.').glob('supabase_*.csv') if 'backup' not in f.name]
    
    print(f"Prüfe {len(csv_files)} CSV-Dateien...")
    
    suspicious_patterns = [
        (r'\d+,?\s*de\s*$', 'Zahlen + "de" am Ende'),
        (r'\s+\d+\s*$', 'Nur Zahlen am Ende'),
        (r'BKV\s*$', 'BKV-Referenzen'),
        (r'SWKV\s*$', 'SWKV-Referenzen'),
        (r'CPG\s*\d+', 'CPG-Referenzen'),
        (r'S\.\s*\d+', 'Seitenzahlen'),
        (r'lib\.\s*[IVX]', 'Lib-Referenzen'),
        (r'^\s*\d+\s*$', 'Nur Zahlen als Text'),
        (r'Titel\s*Werk:', 'Metadaten-Titel'),
        (r'Identifier:', 'Metadaten-Identifier')
    ]
    
    total_issues = 0
    
    for csv_file in csv_files:
        print(f"\n📄 {csv_file.name}")
        
        try:
            df = pd.read_csv(csv_file, encoding='utf-8')
            file_issues = 0
            
            if 'text' in df.columns:
                for idx, text in df['text'].items():
                    if pd.isna(text):
                        continue
                        
                    text_str = str(text)
                    
                    # Prüfe auf verdächtige Patterns
                    for pattern, description in suspicious_patterns:
                        if re.search(pattern, text_str, re.IGNORECASE):
                            if file_issues < 3:  # Zeige nur erste 3 Probleme pro Datei
                                print(f"  ⚠️  {description}: {text_str[-100:]}")
                            file_issues += 1
                            break
                    
                    # Prüfe auf sehr kurze Texte
                    if len(text_str.strip()) < 50:
                        if file_issues < 3:
                            print(f"  ⚠️  Zu kurzer Text: {text_str}")
                        file_issues += 1
                    
                    # Prüfe auf zu wenig Wörter
                    words = text_str.split()
                    if len(words) < 15:
                        if file_issues < 3:
                            print(f"  ⚠️  Zu wenig Wörter ({len(words)}): {text_str[:50]}...")
                        file_issues += 1
            
            if file_issues == 0:
                print("  ✅ Sauber!")
            else:
                print(f"  ❌ {file_issues} Probleme gefunden")
                total_issues += file_issues
                
        except Exception as e:
            print(f"  ❌ Fehler: {e}")
    
    print(f"\n" + "=" * 50)
    if total_issues == 0:
        print("🎉 ALLE DATEIEN SIND SAUBER!")
        print("✅ Bereinigung war erfolgreich - keine Artefakte gefunden!")
    else:
        print(f"⚠️  INSGESAMT {total_issues} PROBLEME GEFUNDEN")
        print("Eventuell ist weitere Bereinigung nötig.")
    print("=" * 50)

def sample_check():
    """
    Zeigt Stichproben aus verschiedenen Dateien
    """
    print("\n" + "=" * 50)
    print("STICHPROBEN-ÜBERPRÜFUNG")
    print("=" * 50)
    
    # Prüfe ein paar wichtige Dateien
    sample_files = [
        'supabase_Athanasius_von_Alexandria.csv',
        'supabase_Augustinus_von_Hippo.csv',
        'supabase_Origenes.csv',
        'supabase_ALL_kirchenvaeter.csv'
    ]
    
    for filename in sample_files:
        file_path = Path(filename)
        if file_path.exists():
            print(f"\n📄 {filename}")
            try:
                df = pd.read_csv(file_path, encoding='utf-8')
                
                # Zeige erste und letzte Einträge
                if 'text' in df.columns and len(df) > 0:
                    print(f"  Einträge: {len(df)}")
                    print(f"  Erster Text: {str(df['text'].iloc[0])[:100]}...")
                    print(f"  Letzter Text: {str(df['text'].iloc[-1])[:100]}...")
                    
                    # Prüfe durchschnittliche Textlänge
                    avg_length = df['text'].str.len().mean()
                    print(f"  Durchschnittliche Textlänge: {avg_length:.1f} Zeichen")
                    
            except Exception as e:
                print(f"  ❌ Fehler: {e}")

if __name__ == "__main__":
    validate_cleaned_csvs()
    sample_check()
