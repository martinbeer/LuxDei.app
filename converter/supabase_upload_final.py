import pandas as pd
import os
from pathlib import Path
import requests
import json
import time

# Supabase-Konfiguration (aus der JS-Datei)
SUPABASE_URL = "https://bpjikoubhxsmsswgixix.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamlrb3ViaHhzbXNzd2dpeGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2NTg1NTIsImV4cCI6MjA2NzIzNDU1Mn0.VZQZ-H0hllmqqe-ceGJpjCMY-l0yoo8Cqds9OK_oOZc"

def upload_to_supabase_rest(data, table_name="kirchenvater"):
    """Lädt Daten über REST API in Supabase hoch"""
    url = f"{SUPABASE_URL}/rest/v1/{table_name}"
    
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    
    response = requests.post(url, headers=headers, json=data)
    return response

def upload_csv_to_supabase(csv_file: Path):
    """Lädt eine CSV-Datei in die Supabase-Tabelle hoch"""
    print(f"\n📤 Lade {csv_file.name} hoch...")
    
    try:
        # CSV laden
        df = pd.read_csv(csv_file, encoding='utf-8')
        print(f"   📊 {len(df)} Einträge gefunden")
        
        # Konvertiere zu Dictionary-Liste
        records = df.to_dict('records')
        
        # Upload in Batches (REST API hat Limits)
        batch_size = 20  # Kleinere Batches für bessere Stabilität
        total_uploaded = 0
        total_failed = 0
        
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            
            try:
                # Upload über REST API
                response = upload_to_supabase_rest(batch)
                
                if response.status_code in [200, 201]:
                    total_uploaded += len(batch)
                    print(f"   ✅ Batch {i//batch_size + 1}: {len(batch)} Einträge hochgeladen")
                else:
                    total_failed += len(batch)
                    print(f"   ❌ Batch {i//batch_size + 1} fehlgeschlagen: {response.status_code}")
                    if response.text:
                        print(f"   Fehler: {response.text[:200]}...")
                
                # Kurze Pause zwischen Batches
                time.sleep(0.5)
                
            except Exception as batch_error:
                total_failed += len(batch)
                print(f"   ❌ Fehler bei Batch {i//batch_size + 1}: {batch_error}")
                # Weiter mit nächstem Batch
                continue
        
        print(f"   🎉 {total_uploaded} von {len(records)} Einträgen erfolgreich hochgeladen!")
        if total_failed > 0:
            print(f"   ⚠️  {total_failed} Einträge fehlgeschlagen")
        
        return total_uploaded
        
    except Exception as e:
        print(f"   ❌ Fehler beim Laden der CSV: {e}")
        return 0

def main():
    """Hauptfunktion für den Upload aller Kirchenväter-Daten"""
    print("🚀 SUPABASE UPLOAD - KIRCHENVÄTER (REST API)")
    print("=" * 50)
    
    print("⚠️  WICHTIG: Bitte stelle sicher, dass die Tabelle 'kirchenvater' existiert!")
    print("    SQL für Tabellenerstellung:")
    print("""
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
    """)
    print("-" * 50)
    
    # Finde alle Supabase-CSV-Dateien (keine Backup-Dateien)
    csv_files = [f for f in Path('.').glob('supabase_*.csv') if 'backup' not in f.name]
    
    if not csv_files:
        print("❌ Keine supabase_*.csv Dateien gefunden!")
        return
    
    print(f"\n📁 Gefundene CSV-Dateien: {len(csv_files)}")
    for i, csv_file in enumerate(csv_files, 1):
        print(f"   {i}. {csv_file.name}")
    
    # Upload-Statistiken
    total_files = len(csv_files)
    successful_uploads = 0
    total_records = 0
    failed_files = []
    
    # Lade jede CSV-Datei hoch
    for i, csv_file in enumerate(csv_files, 1):
        print(f"\n🔄 Verarbeite Datei {i}/{total_files}: {csv_file.name}")
        
        try:
            uploaded_count = upload_csv_to_supabase(csv_file)
            
            if uploaded_count > 0:
                successful_uploads += 1
                total_records += uploaded_count
                print(f"   ✅ Datei {csv_file.name} erfolgreich hochgeladen!")
            else:
                failed_files.append(csv_file.name)
                print(f"   ❌ Datei {csv_file.name} fehlgeschlagen!")
                
        except Exception as file_error:
            failed_files.append(csv_file.name)
            print(f"   ❌ Fehler bei Datei {csv_file.name}: {file_error}")
            # Weiter mit nächster Datei
            continue
    
    # Finale Statistiken
    print(f"\n" + "=" * 50)
    print("🎉 UPLOAD ABGESCHLOSSEN!")
    print("=" * 50)
    print(f"📊 Dateien verarbeitet: {successful_uploads}/{total_files}")
    print(f"📊 Gesamt hochgeladene Einträge: {total_records}")
    print(f"🌐 Supabase-URL: {SUPABASE_URL}")
    print(f"📋 Tabelle: kirchenvater")
    
    if failed_files:
        print(f"\n⚠️  FEHLGESCHLAGENE DATEIEN ({len(failed_files)}):")
        for failed_file in failed_files:
            print(f"   - {failed_file}")
    
    print("\n🔍 Du kannst die Daten jetzt in der Supabase-Konsole überprüfen:")
    print("   - Gehe zu: https://supabase.com/dashboard/project/bpjikoubhxsmsswgixix")
    print("   - Öffne: Table Editor > kirchenvater")
    
    if successful_uploads > 0:
        print(f"\n🎉 ERFOLGREICH! {successful_uploads} von {total_files} Dateien hochgeladen!")
    else:
        print(f"\n❌ KEINE DATEIEN ERFOLGREICH! Überprüfe die RLS-Policies!")

if __name__ == "__main__":
    main()
