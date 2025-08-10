import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from bkv_download_scraper import BKVDownloadScraper

class BKVTestScraper(BKVDownloadScraper):
    def run_test(self):
        """Testlauf mit wenigen Werken"""
        print("BKV Test-Scraper gestartet...")
        
        # Sammle deutsche Werke
        works = self.get_german_works()
        
        if not works:
            print("Keine deutschen Werke gefunden!")
            return
        
        print(f"Gefundene deutsche Werke: {len(works)}")
        
        # Zeige erste 5 Werke
        for i, work in enumerate(works[:5]):
            print(f"Werk {i+1}: {work['title']}")
            print(f"  Autor: {work['author']}")
            print(f"  URL: {work['url']}")
            
            # Teste Download-Link-Suche
            download_links = self.find_download_links(work['url'])
            if download_links:
                print(f"  Download-Links gefunden: {len(download_links)}")
                for dl in download_links:
                    print(f"    {dl['format']}: {dl['url']}")
            else:
                print("  Keine Download-Links gefunden")
            print()
            
        # Verarbeite nur 2 Werke komplett
        all_verses = []
        for i, work in enumerate(works[:2]):
            print(f"\nVerarbeite Werk {i+1}: {work['title']}")
            verses = self.process_work(work)
            all_verses.extend(verses)
            print(f"  Extrahierte Verse: {len(verses)}")
        
        # Speichere Ergebnisse
        if all_verses:
            self.save_to_csv(all_verses)
            print(f"\nTest abgeschlossen! {len(all_verses)} Verse extrahiert.")
        else:
            print("Keine Verse extrahiert.")

if __name__ == "__main__":
    scraper = BKVTestScraper()
    scraper.run_test()
