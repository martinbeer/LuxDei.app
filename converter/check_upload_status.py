import pandas as pd
import os
from pathlib import Path
import requests
import json
import time

# Supabase-Konfiguration
SUPABASE_URL = "https://bpjikoubhxsmsswgixix.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamlrb3ViaHhzbXNzd2dpeGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2NTg1NTIsImV4cCI6MjA2NzIzNDU1Mn0.VZQZ-H0hllmqqe-ceGJpjCMY-l0yoo8Cqds9OK_oOZc"

def check_upload_status():
    """Überprüft, wie viele Daten bereits hochgeladen wurden"""
    print("🔍 ÜBERPRÜFE UPLOAD-STATUS")
    print("=" * 50)
    
    # Teste Verbindung zur Tabelle
    url = f"{SUPABASE_URL}/rest/v1/kirchenvater"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    
    try:
        # Anzahl der Einträge abrufen
        response = requests.get(f"{url}?select=count", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Tabelle 'kirchenvater' existiert!")
            print(f"📊 Bereits hochgeladene Einträge: {len(data)}")
            
            # Zeige einige Beispiele
            example_response = requests.get(f"{url}?select=author,work_title&limit=5", headers=headers)
            if example_response.status_code == 200:
                examples = example_response.json()
                print(f"\n📋 Beispieleinträge:")
                for ex in examples:
                    print(f"   - {ex.get('author', 'Unbekannt')}: {ex.get('work_title', 'Unbekannt')}")
                    
            # Zähle Einträge pro Autor
            author_response = requests.get(f"{url}?select=author&limit=5000", headers=headers)
            if author_response.status_code == 200:
                authors = author_response.json()
                author_counts = {}
                for entry in authors:
                    author = entry.get('author', 'Unbekannt')
                    author_counts[author] = author_counts.get(author, 0) + 1
                
                print(f"\n👥 Einträge pro Autor:")
                for author, count in sorted(author_counts.items(), key=lambda x: x[1], reverse=True):
                    print(f"   - {author}: {count} Einträge")
                    
        else:
            print(f"❌ Fehler beim Abrufen der Daten: {response.status_code}")
            print(f"Antwort: {response.text}")
            
    except Exception as e:
        print(f"❌ Fehler: {e}")

def quick_upload_test():
    """Testet Upload mit einer kleinen Datei"""
    print("\n🧪 QUICK UPLOAD TEST")
    print("=" * 30)
    
    # Suche nach einer kleinen CSV-Datei
    small_files = []
    for csv_file in Path('.').glob('supabase_*.csv'):
        if 'backup' not in csv_file.name:
            try:
                df = pd.read_csv(csv_file, encoding='utf-8')
                if 5 <= len(df) <= 50:  # Kleine Dateien
                    small_files.append((csv_file, len(df)))
            except:
                pass
    
    if small_files:
        # Sortiere nach Größe
        small_files.sort(key=lambda x: x[1])
        test_file, size = small_files[0]
        
        print(f"📁 Teste mit: {test_file.name} ({size} Einträge)")
        
        # Lade nur die ersten 5 Einträge
        df = pd.read_csv(test_file, encoding='utf-8')
        test_data = df.head(5).to_dict('records')
        
        url = f"{SUPABASE_URL}/rest/v1/kirchenvater"
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        
        try:
            response = requests.post(url, headers=headers, json=test_data)
            
            if response.status_code in [200, 201]:
                print(f"✅ Test erfolgreich! 5 Einträge hochgeladen")
                return True
            else:
                print(f"❌ Test fehlgeschlagen: {response.status_code}")
                print(f"Fehler: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Test-Fehler: {e}")
            return False
    else:
        print("❌ Keine geeignete Test-Datei gefunden")
        return False

if __name__ == "__main__":
    check_upload_status()
    # quick_upload_test()
