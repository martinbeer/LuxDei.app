"""
Korrigierter BKV Scraper der echte deutsche Kirchenväter-Texte extrahiert.

Basierend auf der Website-Analyse:
- Deutsche Versionen sind in /works/.../versions/.../divisions/X URLs
- Der echte Text steht in <main> oder <p> Elementen  
- Es gibt oft direkte Division-Links ohne Inhaltsverzeichnis
- Fußnoten stehen als Paragraphen oder nach dem Text
"""

import requests
from bs4 import BeautifulSoup
import json
import re
import time
import os
from urllib.parse import urljoin, urlparse

# Supabase config aus env vars
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://bpjikoubhxsmsswgixix.supabase.co')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY', 
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
    'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamlrb3ViaHhzbXNzd2dpeGl4Iiwicm9sZSI6'
    'InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY1ODU1MiwiZXhwIjoyMDY3MjM0NTUyfQ.'
    'GiM-rfWsV0sun4JKO0nJg1UQwsXWCirz5FtM74g6eUk')

class BKVScraper:
    def __init__(self, delay=2.0):
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        self.works_found = []
        self.divisions_processed = []
        
    def log(self, message):
        print(f"[BKV] {message}")
        
    def get_german_versions(self, max_works=5):
        """Findet deutsche Versionen auf der Hauptseite"""
        self.log("Suche deutsche Versionen...")
        
        url = "https://bkv.unifr.ch/de/works"
        response = self.session.get(url)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        german_versions = []
        
        # Suche alle Listen-Items mit deutschen Versionen
        for li in soup.find_all('li'):
            small = li.find('small')
            if not small:
                continue
                
            small_text = small.get_text().strip().lower()
            if 'deutsch' not in small_text:
                continue
                
            # Finde den Link
            a = li.find('a', href=True)
            if not a:
                continue
                
            title = a.get_text().strip()
            href = a['href']
            
            # Vollständige URL bauen
            if href.startswith('/'):
                href = 'https://bkv.unifr.ch' + href
                
            # Entferne trailing /divisions wenn vorhanden  
            base_version_url = re.sub(r'/divisions/?$', '', href)
            
            german_versions.append({
                'title': title,
                'author': self._extract_author_from_title(title),
                'version_url': base_version_url,
                'language_info': small.get_text().strip()
            })
            
            if len(german_versions) >= max_works:
                break
                
        self.log(f"Gefunden: {len(german_versions)} deutsche Werke")
        return german_versions
    
    def _extract_author_from_title(self, title):
        """Extrahiert Autorname aus Titel"""
        # Einfache Heuristik - alles vor dem ersten Komma oder Klammer
        match = re.match(r'^([^,(]+)', title)
        return match.group(1).strip() if match else title[:50]
    
    def process_work(self, work_info):
        """Verarbeitet ein einzelnes Werk"""
        self.log(f"Verarbeite: {work_info['title']}")
        
        version_url = work_info['version_url']
        
        # Hole Metadaten von der Versions-Seite
        metadata = self._get_version_metadata(version_url)
        
        # Teste verschiedene Division-URLs
        divisions = self._find_divisions(version_url)
        
        if not divisions:
            self.log(f"Keine Divisions gefunden für {work_info['title']}")
            return None
            
        work_data = {
            'title': work_info['title'],
            'author': work_info['author'],
            'version_url': version_url,
            'metadata': metadata,
            'divisions': divisions,
            'text_content': []
        }
        
        # Verarbeite jede Division
        for i, division_url in enumerate(divisions, 1):
            self.log(f"  Division {i}: {division_url}")
            
            division_data = self._process_division(division_url, i)
            if division_data:
                work_data['text_content'].append(division_data)
                
            time.sleep(self.delay)  # Rate limiting
            
        return work_data
    
    def _get_version_metadata(self, version_url):
        """Extrahiert Metadaten von einer Versions-Seite"""
        try:
            response = self.session.get(version_url)
            soup = BeautifulSoup(response.content, 'html.parser')
            
            metadata = {}
            
            # Titel und Autor
            headings = soup.find_all(['h1', 'h2', 'h3'])
            if headings:
                metadata['main_title'] = headings[0].get_text().strip()
                
            # Suche nach bibliographischen Angaben
            for element in soup.find_all(string=re.compile(r'Bibliographische Angabe', re.I)):
                parent = element.parent
                if parent:
                    next_elem = parent.find_next_sibling()
                    if next_elem:
                        metadata['bibliography'] = next_elem.get_text().strip()
                        
            # Datum/Jahrhundert
            for element in soup.find_all(string=re.compile(r'Datum', re.I)):
                parent = element.parent
                if parent:
                    next_elem = parent.find_next_sibling()
                    if next_elem:
                        metadata['date'] = next_elem.get_text().strip()
                        
            return metadata
            
        except Exception as e:
            self.log(f"Fehler beim Metadaten-Parsing: {e}")
            return {}
    
    def _find_divisions(self, version_url, max_divisions=10):
        """Findet verfügbare Division-URLs für ein Werk"""
        divisions = []
        
        # Teste direkte Division-URLs
        for i in range(1, max_divisions + 1):
            division_url = f"{version_url}/divisions/{i}"
            
            try:
                response = self.session.get(division_url)
                
                if response.status_code == 200:
                    # Prüfe ob die Seite echten Inhalt hat
                    soup = BeautifulSoup(response.content, 'html.parser')
                    main = soup.find('main')
                    
                    if main:
                        text = main.get_text().strip()
                        # Wenn es mehr als nur "The page you requested was not found" ist
                        if len(text) > 100 and 'not found' not in text.lower():
                            divisions.append(division_url)
                            self.log(f"    Division {i}: OK ({len(text)} Zeichen)")
                        else:
                            self.log(f"    Division {i}: Kein Inhalt")
                            break  # Keine weiteren Divisions
                    else:
                        break
                else:
                    self.log(f"    Division {i}: Status {response.status_code}")
                    break  # Keine weiteren Divisions
                    
            except Exception as e:
                self.log(f"    Division {i}: Fehler {e}")
                break
                
            time.sleep(0.5)  # Mini-delay zwischen Tests
            
        return divisions
    
    def _process_division(self, division_url, division_number):
        """Extrahiert Text und Fußnoten aus einer Division"""
        try:
            response = self.session.get(division_url)
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Haupttext extrahieren
            main_element = soup.find('main')
            if not main_element:
                return None
                
            # Entferne Navigation und Metadaten
            for elem in main_element.find_all(['nav', 'header', 'footer']):
                elem.decompose()
                
            # Extrahiere alle Paragraphen
            paragraphs = main_element.find_all('p')
            
            main_text_parts = []
            footnotes = []
            
            for p in paragraphs:
                text = p.get_text().strip()
                
                # Skip zu kurze oder Meta-Paragraphen
                if len(text) < 20:
                    continue
                    
                # Skip Footer/Copyright
                if any(skip in text.lower() for skip in ['©', 'impressum', 'datenschutz', 'fakultät']):
                    continue
                    
                # Prüfe ob es eine Fußnote ist (beginnt mit Zahl oder Buchstabe + Punkt)
                if re.match(r'^[0-9a-zA-Z]+[.)]\s', text):
                    footnotes.append({
                        'number': re.match(r'^([0-9a-zA-Z]+)[.)]', text).group(1),
                        'text': text,
                        'html': str(p)
                    })
                else:
                    # Haupttext
                    main_text_parts.append(text)
            
            # Kombiniere Haupttext
            main_text = '\n\n'.join(main_text_parts)
            
            # Extrahiere auch den kompletten HTML für spätere Verarbeitung
            main_html = str(main_element)
            
            division_data = {
                'division_number': division_number,
                'url': division_url,
                'main_text': main_text,
                'main_html': main_html,
                'footnotes': footnotes,
                'char_count': len(main_text),
                'paragraph_count': len(main_text_parts)
            }
            
            self.log(f"    Extrahiert: {len(main_text)} Zeichen, {len(footnotes)} Fußnoten")
            
            return division_data
            
        except Exception as e:
            self.log(f"Fehler bei Division {division_url}: {e}")
            return None
    
    def upload_to_supabase(self, work_data):
        """Lädt die Daten zu Supabase hoch"""
        try:
            # Vereinfachte Daten für Upload
            work_record = {
                'title': work_data['title'],
                'author': work_data['author'],
                'source_url': work_data['version_url'],
                'language': 'de',
                'metadata': json.dumps(work_data['metadata']),
                'division_count': len(work_data['divisions'])
            }
            
            # Upload Work
            work_response = self._supabase_request('POST', '/rest/v1/bkv_works', work_record)
            
            if not work_response:
                return False
                
            work_id = work_response[0]['id'] if work_response else None
            
            # Upload Divisions
            for division in work_data['text_content']:
                division_record = {
                    'work_id': work_id,
                    'division_number': division['division_number'],
                    'source_url': division['url'],
                    'main_text': division['main_text'],
                    'main_html': division['main_html'],
                    'footnotes': json.dumps(division['footnotes']),
                    'char_count': division['char_count'],
                    'paragraph_count': division['paragraph_count']
                }
                
                self._supabase_request('POST', '/rest/v1/bkv_divisions', division_record)
                
            self.log(f"Upload erfolgreich: {work_data['title']}")
            return True
            
        except Exception as e:
            self.log(f"Upload-Fehler: {e}")
            return False
    
    def _supabase_request(self, method, endpoint, data=None):
        """Führt eine Supabase REST API Anfrage aus"""
        try:
            import requests
            
            url = f"{SUPABASE_URL}{endpoint}"
            headers = {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            }
            
            if method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            else:
                response = requests.get(url, headers=headers)
                
            if response.status_code in [200, 201]:
                return response.json()
            else:
                self.log(f"Supabase Fehler {response.status_code}: {response.text}")
                return None
                
        except Exception as e:
            self.log(f"Supabase Request Fehler: {e}")
            return None
    
    def run(self, max_works=5):
        """Hauptfunktion - führt den kompletten Scraping-Prozess aus"""
        self.log("=== BKV Scraper gestartet ===")
        
        # 1. Deutsche Versionen finden
        german_works = self.get_german_versions(max_works)
        
        if not german_works:
            self.log("Keine deutschen Werke gefunden!")
            return
            
        # 2. Jedes Werk verarbeiten
        processed_works = []
        
        for i, work_info in enumerate(german_works, 1):
            self.log(f"\n--- Werk {i}/{len(german_works)} ---")
            
            work_data = self.process_work(work_info)
            
            if work_data and work_data['text_content']:
                processed_works.append(work_data)
                
                # Zeige Beispieltext
                first_division = work_data['text_content'][0]
                sample_text = first_division['main_text'][:300]
                self.log(f"Beispieltext: {sample_text}...")
                
                # Upload zu Supabase
                self.upload_to_supabase(work_data)
            else:
                self.log(f"Kein Text extrahiert für {work_info['title']}")
                
            time.sleep(self.delay)
            
        # 3. Zusammenfassung
        self.log(f"\n=== Zusammenfassung ===")
        self.log(f"Verarbeitete Werke: {len(processed_works)}")
        
        for work in processed_works:
            total_chars = sum(d['char_count'] for d in work['text_content'])
            total_footnotes = sum(len(d['footnotes']) for d in work['text_content'])
            self.log(f"- {work['title']}: {len(work['text_content'])} Divisions, {total_chars} Zeichen, {total_footnotes} Fußnoten")

def main():
    scraper = BKVScraper(delay=2.0)
    scraper.run(max_works=3)  # Teste mit 3 Werken

if __name__ == "__main__":
    main()
