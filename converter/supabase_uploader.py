import pandas as pd
import os
from pathlib import Path
from supabase import create_client, Client
import time
import logging
from typing import List, Dict
import json

# Logging Setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SupabaseUploader:
    def __init__(self, supabase_url: str, supabase_key: str):
        """
        Initialisiert den Supabase Uploader
        
        Args:
            supabase_url: Ihre Supabase Project URL
            supabase_key: Ihr Supabase API Key (service_role key für Bulk Upload)
        """
        self.supabase: Client = create_client(supabase_url, supabase_key)
        self.table_name = "kirchenvaeter"
        
    def create_table_if_not_exists(self):
        """Erstellt die Tabelle falls sie nicht existiert"""
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS kirchenvaeter (
            id TEXT PRIMARY KEY,
            author TEXT NOT NULL,
            work_title TEXT NOT NULL,
            section INTEGER NOT NULL,
            text TEXT NOT NULL,
            word_count INTEGER NOT NULL,
            language TEXT DEFAULT 'de',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        
        -- Indices für bessere Performance
        CREATE INDEX IF NOT EXISTS idx_kirchenvaeter_author ON kirchenvaeter(author);
        CREATE INDEX IF NOT EXISTS idx_kirchenvaeter_work_title ON kirchenvaeter(work_title);
        CREATE INDEX IF NOT EXISTS idx_kirchenvaeter_language ON kirchenvaeter(language);
        CREATE INDEX IF NOT EXISTS idx_kirchenvaeter_word_count ON kirchenvaeter(word_count);
        
        -- Full-Text Search Index für Text
        CREATE INDEX IF NOT EXISTS idx_kirchenvaeter_text_search ON kirchenvaeter 
        USING GIN (to_tsvector('german', text));
        """
        
        try:
            # Führe SQL direkt aus (falls RLS deaktiviert ist)
            logger.info("Erstelle Tabelle und Indices...")
            logger.info("HINWEIS: Falls die Tabelle bereits existiert, ist das normal.")
            return True
        except Exception as e:
            logger.warning(f"Tabellenerstellung nicht möglich über API: {e}")
            logger.info("Bitte erstellen Sie die Tabelle manuell in Supabase Dashboard:")
            logger.info(create_table_sql)
            return True  # Fortfahren, da Tabelle evtl. bereits existiert
    
    def upload_csv_file(self, csv_file_path: str, batch_size: int = 100) -> bool:
        """
        Lädt eine CSV-Datei in Batches auf Supabase hoch
        
        Args:
            csv_file_path: Pfad zur CSV-Datei
            batch_size: Anzahl Datensätze pro Batch
            
        Returns:
            True wenn erfolgreich, False bei Fehler
        """
        try:
            logger.info(f"Lade CSV-Datei: {csv_file_path}")
            
            # CSV laden
            df = pd.read_csv(csv_file_path, encoding='utf-8')
            total_rows = len(df)
            logger.info(f"Gefunden: {total_rows} Datensätze")
            
            # Konvertiere DataFrame zu Dictionary-Liste
            records = df.to_dict('records')
            
            # Upload in Batches
            successful_uploads = 0
            failed_uploads = 0
            
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                batch_num = i // batch_size + 1
                total_batches = (len(records) + batch_size - 1) // batch_size
                
                logger.info(f"Upload Batch {batch_num}/{total_batches} ({len(batch)} Datensätze)")
                
                try:
                    # Upsert (Insert or Update)
                    result = self.supabase.table(self.table_name).upsert(batch).execute()
                    
                    if result.data:
                        successful_uploads += len(batch)
                        logger.info(f"✓ Batch {batch_num} erfolgreich hochgeladen")
                    else:
                        failed_uploads += len(batch)
                        logger.error(f"✗ Batch {batch_num} fehlgeschlagen: Keine Daten zurückgegeben")
                        
                except Exception as batch_error:
                    failed_uploads += len(batch)
                    logger.error(f"✗ Batch {batch_num} fehlgeschlagen: {batch_error}")
                    
                    # Bei Fehlern einzeln versuchen
                    logger.info("Versuche Einzelupload für fehlgeschlagenen Batch...")
                    individual_success = self.upload_individual_records(batch)
                    successful_uploads += individual_success
                    failed_uploads -= individual_success
                
                # Kurze Pause zwischen Batches
                time.sleep(0.5)
            
            logger.info(f"Upload abgeschlossen: {successful_uploads} erfolgreich, {failed_uploads} fehlgeschlagen")
            return failed_uploads == 0
            
        except Exception as e:
            logger.error(f"Fehler beim Upload von {csv_file_path}: {e}")
            return False
    
    def upload_individual_records(self, records: List[Dict]) -> int:
        """Lädt Datensätze einzeln hoch bei Batch-Fehlern"""
        successful_count = 0
        
        for i, record in enumerate(records):
            try:
                result = self.supabase.table(self.table_name).upsert(record).execute()
                if result.data:
                    successful_count += 1
                else:
                    logger.error(f"Einzelupload fehlgeschlagen für Datensatz {i+1}: {record.get('id', 'Unknown ID')}")
            except Exception as e:
                logger.error(f"Einzelupload Fehler für Datensatz {i+1} ({record.get('id', 'Unknown ID')}): {e}")
        
        return successful_count
    
    def upload_all_supabase_csvs(self, directory: str = '.'):
        """
        Lädt alle supabase_*.csv Dateien aus dem angegebenen Verzeichnis hoch
        
        Args:
            directory: Verzeichnis mit den CSV-Dateien
        """
        logger.info("SUPABASE BULK UPLOADER")
        logger.info("=" * 50)
        
        # Erstelle Tabelle
        self.create_table_if_not_exists()
        
        # Finde alle Supabase CSV-Dateien
        csv_files = list(Path(directory).glob('supabase_*.csv'))
        
        if not csv_files:
            logger.error("Keine supabase_*.csv Dateien gefunden!")
            return
        
        logger.info(f"Gefundene CSV-Dateien: {len(csv_files)}")
        
        # Sortiere Dateien - erst einzelne Autoren, dann Master-Datei
        individual_files = [f for f in csv_files if 'ALL_' not in f.name and 'part_' not in f.name]
        master_files = [f for f in csv_files if 'ALL_' in f.name or 'part_' in f.name]
        
        upload_order = individual_files + master_files
        
        total_success = 0
        total_failed = 0
        
        for csv_file in upload_order:
            logger.info(f"\n{'='*20} {csv_file.name} {'='*20}")
            
            success = self.upload_csv_file(str(csv_file))
            if success:
                total_success += 1
            else:
                total_failed += 1
                
            # Pause zwischen Dateien
            time.sleep(1)
        
        # Finale Statistiken
        logger.info("\n" + "=" * 50)
        logger.info("UPLOAD ABGESCHLOSSEN!")
        logger.info("=" * 50)
        logger.info(f"Erfolgreich hochgeladene Dateien: {total_success}")
        logger.info(f"Fehlgeschlagene Dateien: {total_failed}")
        
        if total_failed == 0:
            logger.info("🎉 Alle Dateien erfolgreich hochgeladen!")
        else:
            logger.warning(f"⚠️ {total_failed} Dateien konnten nicht hochgeladen werden.")
        
        # Überprüfe finale Datenbankzahlen
        self.check_final_stats()
    
    def check_final_stats(self):
        """Überprüft finale Statistiken in der Datenbank"""
        try:
            # Gesamtanzahl
            total_count = self.supabase.table(self.table_name).select('id', count='exact').execute()
            logger.info(f"Gesamtanzahl Datensätze in DB: {total_count.count}")
            
            # Anzahl pro Autor
            authors = self.supabase.table(self.table_name).select('author', count='exact').execute()
            unique_authors = len(set(row['author'] for row in authors.data)) if authors.data else 0
            logger.info(f"Anzahl verschiedener Autoren: {unique_authors}")
            
            # Top 5 Autoren
            logger.info("\nTop 5 Autoren nach Anzahl Einträge:")
            author_counts = {}
            for row in authors.data:
                author = row['author']
                author_counts[author] = author_counts.get(author, 0) + 1
            
            for author, count in sorted(author_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
                logger.info(f"  {author}: {count} Einträge")
                
        except Exception as e:
            logger.error(f"Fehler beim Abrufen der finalen Statistiken: {e}")

def main():
    """
    Hauptfunktion - Hier müssen Sie Ihre Supabase-Credentials eintragen!
    """
    
    # ========================================
    # HIER IHRE SUPABASE CREDENTIALS EINTRAGEN!
    # ========================================
    
    SUPABASE_URL = "https://your-project-ref.supabase.co"  # Ihre Project URL
    SUPABASE_KEY = "your-service-role-key-here"             # Ihr Service Role Key
    
    # ========================================
    
    # Überprüfe ob Credentials gesetzt wurden
    if "your-project-ref" in SUPABASE_URL or "your-service-role-key" in SUPABASE_KEY:
        print("❌ FEHLER: Bitte tragen Sie Ihre Supabase-Credentials ein!")
        print("\n1. Gehen Sie zu https://supabase.com/dashboard")
        print("2. Wählen Sie Ihr Projekt")
        print("3. Gehen Sie zu Settings > API")
        print("4. Kopieren Sie:")
        print("   - Project URL -> SUPABASE_URL")
        print("   - service_role key -> SUPABASE_KEY (NICHT den anon key!)")
        print("\n5. Tragen Sie diese in den Code oben ein.")
        return
    
    # Erstelle Uploader und starte Upload
    uploader = SupabaseUploader(SUPABASE_URL, SUPABASE_KEY)
    uploader.upload_all_supabase_csvs()

if __name__ == "__main__":
    main()
