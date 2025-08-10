import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
import re
import os
from urllib.parse import urljoin

# Erweiterte Autor-Mappings basierend auf der Analyse
AUTHOR_MAPPING = {
    'athan': 'Athanasius von Alexandria',
    'august': 'Augustinus von Hippo',
    'ambros': 'Ambrosius von Mailand', 
    'hieron': 'Hieronymus',
    'chrysost': 'Johannes Chrysostomus',
    'basil': 'Basilius von Cäsarea',
    'gregor': 'Gregor von Nazianz',
    'orig': 'Origenes',
    'tertull': 'Tertullian',
    'cyprian': 'Cyprian von Karthago',
    'ignat': 'Ignatius von Antiochien',
    'justin': 'Justin der Märtyrer',
    'iren': 'Irenäus von Lyon',
    'clem': 'Clemens von Rom',
    'hipp': 'Hippolyt von Rom',
    'lact': 'Lactantius',
    'euseb': 'Eusebius von Caesarea',
    'epiphan': 'Epiphanius von Salamis',
    'cyrill': 'Cyrill von Alexandria',
    'maxim': 'Maximus Confessor',
    'damasc': 'Johannes von Damaskus'
}

BASE_URL = "https://bkv.unifr.ch"

class BKVEfficientScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def get_german_works(self, limit=None):
        """Sammelt nur deutsche Werke mit direkten Download-Links"""
        print("Sammle deutsche Werke...")
        
        works_url = f"{BASE_URL}/de/works"
        response = self.session.get(works_url)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Finde alle Werk-Links
        work_links = []
        for link in soup.find_all('a', href=True):
            href = link['href']
            text = link.get_text(strip=True)
            if '/works/' in href and len(text) > 10:
                work_links.append({'href': href, 'text': text})
        
        print(f"Gefunden: {len(work_links)} potenzielle Werke")
        
        # Filtere nur deutsche Werke
        german_works = []
        for i, work in enumerate(work_links):
            if limit and len(german_works) >= limit:
                break
                
            if i % 50 == 0:
                print(f"Verarbeite Werk {i+1}/{len(work_links)}")
            
            full_url = BASE_URL + work['href'] if work['href'].startswith('/') else work['href']
            
            try:
                # Schnelle Prüfung: Ist es ein deutsches Werk?
                if self.is_german_work(full_url):
                    author = self.extract_author(work['href'], work['text'])
                    german_works.append({
                        'title': work['text'],
                        'url': full_url,
                        'author': author
                    })
                    
                time.sleep(0.5)  # Höflichkeitspause
                
            except Exception as e:
                print(f"Fehler bei {work['text']}: {e}")
        
        print(f"Deutsche Werke gefunden: {len(german_works)}")
        return german_works
    
    def is_german_work(self, work_url):
        """Prüft schnell, ob es ein deutsches Werk ist"""
        try:
            response = self.session.get(work_url)
            content = response.text.lower()
            
            # Prüfe auf deutsche Indikatoren
            german_indicators = [
                'übersetzung (deutsch)',
                'deutsch',
                'german translation',
                '.docx',
                '.epub',
                '.pdf',
                '.rtf'
            ]
            
            return any(indicator in content for indicator in german_indicators)
            
        except:
            return False
    
    def extract_author(self, work_url, work_title):
        """Extrahiert Autor aus URL oder Titel"""
        # Versuche aus URL
        url_lower = work_url.lower()
        for key, author in AUTHOR_MAPPING.items():
            if key in url_lower:
                return author
        
        # Versuche aus Titel
        title_lower = work_title.lower()
        for key, author in AUTHOR_MAPPING.items():
            if key in title_lower:
                return author
        
        # Fallback: Extrahiere aus Breadcrumb
        return self.extract_author_from_page(work_url)
    
    def extract_author_from_page(self, work_url):
        """Extrahiert Autor von der Werkseite"""
        try:
            response = self.session.get(work_url)
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Suche nach Autor-Informationen
            for tag in ['h1', 'h2', 'h3']:
                elements = soup.find_all(tag)
                for elem in elements:
                    text = elem.get_text(strip=True)
                    if any(name in text for name in ['von', 'der', 'von Hippo', 'von Mailand', 'von Alexandria']):
                        return text
            
            return "Unbekannt"
            
        except:
            return "Unbekannt"
    
    def scrape_work_content(self, work_info):
        """Scrapt den Inhalt eines Werks"""
        print(f"Scrape: {work_info['title']}")
        
        try:
            response = self.session.get(work_info['url'])
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Extrahiere Textinhalt
            text_elements = soup.find_all(['p', 'div'], class_=re.compile(r'text|content|body'))
            
            if not text_elements:
                # Fallback: Alle p-Tags
                text_elements = soup.find_all('p')
            
            text_parts = []
            for elem in text_elements:
                text = elem.get_text(strip=True)
                if text and len(text) > 20:  # Nur substantielle Texte
                    text_parts.append(text)
            
            # Bereinige und strukturiere
            full_text = '\n'.join(text_parts)
            cleaned_text = self.clean_text(full_text)
            
            # Teile in Abschnitte
            sections = self.split_into_sections(cleaned_text)
            
            # Erstelle Datensätze
            records = []
            for i, section in enumerate(sections, 1):
                if len(section.strip()) > 100:  # Nur substantielle Abschnitte
                    records.append({
                        'id': f"{work_info['author'].replace(' ', '_')}_{self.clean_work_title(work_info['title']).replace(' ', '_')}_{i}",
                        'author': work_info['author'],
                        'work_title': self.clean_work_title(work_info['title']),
                        'section_number': i,
                        'text_content': section.strip(),
                        'word_count': len(section.split()),
                        'language': 'deutsch'
                    })
            
            return records
            
        except Exception as e:
            print(f"Fehler beim Scraping: {e}")
            return []
    
    def clean_text(self, text):
        """Bereinigt Text von Metadaten"""
        if not text:
            return ""
        
        # Entferne häufige Metadaten-Muster
        patterns_to_remove = [
            r'^\s*\d+\s*$',  # Nur Zahlen
            r'^\s*Seite \d+.*?\n',
            r'BKV.*?\n',
            r'Download.*?\n',
            r'Version.*?\n',
            r'Übersetzung.*?\n',
            r'Copyright.*?\n'
        ]
        
        cleaned_text = text
        for pattern in patterns_to_remove:
            cleaned_text = re.sub(pattern, '', cleaned_text, flags=re.MULTILINE | re.IGNORECASE)
        
        # Entferne Fußnoten-Referenzen
        cleaned_text = re.sub(r'\[\d+\]', '', cleaned_text)
        
        # Entferne übermäßige Leerzeilen
        cleaned_text = re.sub(r'\n\s*\n', '\n', cleaned_text)
        
        return cleaned_text.strip()
    
    def clean_work_title(self, title):
        """Bereinigt Werktitel"""
        # Entferne "Übersetzung (Deutsch): " Prefix
        title = re.sub(r'Übersetzung \(Deutsch\):\s*', '', title)
        
        # Entferne (SWKV) und ähnliche Suffixe
        title = re.sub(r'\s*\([^)]*\)\s*$', '', title)
        
        return title.strip()
    
    def split_into_sections(self, text):
        """Teilt Text in sinnvolle Abschnitte"""
        if not text:
            return []
        
        # Teile bei Kapitelmarkierungen
        chapter_patterns = [
            r'\n\s*Kapitel\s+\d+',
            r'\n\s*Kap\.\s+\d+',
            r'\n\s*\d+\.\s+[A-Z]',
            r'\n\s*Brief\s+\d+',
            r'\n\s*Buch\s+\d+'
        ]
        
        sections = [text]
        for pattern in chapter_patterns:
            new_sections = []
            for section in sections:
                new_sections.extend(re.split(pattern, section))
            sections = new_sections
        
        # Filtere leere Abschnitte
        return [s for s in sections if s.strip()]
    
    def save_to_csv(self, all_records):
        """Speichert alle Datensätze in CSV"""
        if not all_records:
            print("Keine Datensätze zum Speichern!")
            return
        
        df = pd.DataFrame(all_records)
        
        # Speichere Hauptdatei
        df.to_csv('bkv_all_works.csv', index=False, encoding='utf-8')
        print(f"Gespeichert: bkv_all_works.csv mit {len(df)} Einträgen")
        
        # Speichere auch pro Autor
        for author in df['author'].unique():
            author_df = df[df['author'] == author]
            filename = f"kirchenvater_{author.replace(' ', '_')}.csv"
            author_df.to_csv(filename, index=False, encoding='utf-8')
            print(f"Gespeichert: {filename} mit {len(author_df)} Einträgen")
        
        # Statistiken
        print(f"\nSTATISTIKEN:")
        print(f"Gesamteinträge: {len(df)}")
        print(f"Autoren: {df['author'].nunique()}")
        print(f"Werke: {df['work_title'].nunique()}")
        print(f"Gesamtwörter: {df['word_count'].sum():,}")
    
    def run(self, limit=None):
        """Hauptprogramm"""
        print("BKV Efficient Scraper gestartet...")
        
        # Sammle deutsche Werke
        works = self.get_german_works(limit=limit)
        
        if not works:
            print("Keine deutschen Werke gefunden!")
            return
        
        all_records = []
        
        # Scrape jedes Werk
        for i, work in enumerate(works, 1):
            print(f"\nVerarbeite Werk {i}/{len(works)}: {work['title']}")
            records = self.scrape_work_content(work)
            all_records.extend(records)
            
            # Höflichkeitspause
            time.sleep(1)
            
            # Zwischenspeichern alle 10 Werke
            if i % 10 == 0:
                print(f"Zwischenspeichern nach {i} Werken...")
                self.save_to_csv(all_records)
        
        # Finale Speicherung
        self.save_to_csv(all_records)
        print(f"\nFertig! {len(all_records)} Datensätze extrahiert.")

if __name__ == "__main__":
    scraper = BKVEfficientScraper()
    # Starte mit 20 Werken zum Testen
    scraper.run(limit=20)
