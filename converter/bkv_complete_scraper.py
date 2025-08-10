import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
import re
import os
from urllib.parse import urljoin
import tempfile
from pathlib import Path

# Bibliotheken für verschiedene Dateiformate
try:
    import ebooklib
    from ebooklib import epub
    EPUB_AVAILABLE = True
except ImportError:
    EPUB_AVAILABLE = False

try:
    import docx2txt
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False

try:
    import PyPDF2
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

# Erweiterte Autor-Mappings
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
    'cassian': 'Johannes Cassianus',
    'leo': 'Leo der Große',
    'isidor': 'Isidor von Sevilla',
    'beda': 'Beda Venerabilis',
    'damasc': 'Johannes von Damaskus',
    'epiphan': 'Epiphanius von Salamis',
    'didy': 'Didymus der Blinde',
    'nyssenus': 'Gregor von Nyssa',
    'nazian': 'Gregor von Nazianz',
    'theod': 'Theodoret von Cyrus',
    'cyrill': 'Cyrill von Alexandria',
    'cyrill_jer': 'Cyrill von Jerusalem',
    'maxim': 'Maximus Confessor',
    'evagr': 'Evagrius Ponticus',
    'palladius': 'Palladius',
    'sozom': 'Sozomenus',
    'socrat': 'Sokrates Scholasticus',
    'theoph': 'Theophilus von Alexandria',
    'ephraem': 'Ephraem der Syrer',
    'rufin': 'Rufinus von Aquileia',
    'sulp': 'Sulpicius Severus',
    'prosper': 'Prosper von Aquitanien',
    'paulin': 'Paulinus von Nola',
    'cassiodor': 'Cassiodorus',
    'boeth': 'Boethius',
    'victor': 'Victorinus',
    'optat': 'Optatus von Mileve',
    'pelag': 'Pelagius',
    'priscill': 'Priscillian',
    'faustus': 'Faustus von Riez',
    'vincent': 'Vincentius von Lérins',
    'hilarius': 'Hilarius von Poitiers',
    'martin': 'Martin von Tours',
    'gennad': 'Gennadius',
    'anast': 'Anastasius Sinaita',
    'damas': 'Papst Damasus',
    'symm': 'Symmachus',
    'prudent': 'Prudentius',
    'caesar': 'Caesarius von Arles',
    'fulgent': 'Fulgentius von Ruspe'
}

BASE_URL = "https://bkv.unifr.ch"

class BKVCompleteScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        self.all_authors_data = {}  # Speichert Daten pro Autor
        
    def get_german_works(self):
        """Sammle alle deutschen Werke von der BKV-Website"""
        print("Sammle deutsche Werke...")
        
        works_url = f"{BASE_URL}/de/works"
        response = self.session.get(works_url)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        works = []
        
        # Finde alle Werk-Links
        for link in soup.find_all('a', href=True):
            href = link['href']
            text = link.get_text(strip=True)
            
            # Prüfe auf deutsche Werke
            if ('/works/' in href and 
                len(text) > 10 and 
                ('Deutsch' in text or 'Übersetzung' in text)):
                
                full_url = urljoin(BASE_URL, href)
                author = self.identify_author(full_url, text)
                
                works.append({
                    'title': text,
                    'url': full_url,
                    'author': author
                })
        
        print(f"Gefunden: {len(works)} deutsche Werke")
        return works
    
    def identify_author(self, work_url, link_text):
        """Identifiziere den Autor eines Werkes"""
        # Versuche aus URL
        url_lower = work_url.lower()
        for key, author in AUTHOR_MAPPING.items():
            if key in url_lower:
                return author
        
        # Versuche aus Text
        text_lower = link_text.lower()
        for key, author in AUTHOR_MAPPING.items():
            if key in text_lower:
                return author
        
        # Fallback: Extrahiere aus URL-Struktur
        parts = work_url.split('/')
        if len(parts) > 4:
            work_id = parts[-1]
            # Versuche Autor aus Work-ID zu extrahieren
            for key, author in AUTHOR_MAPPING.items():
                if key in work_id.lower():
                    return author
        
        return "Unbekannt"
    
    def find_download_links(self, work_url):
        """Finde Download-Links auf einer Werkseite"""
        try:
            response = self.session.get(work_url)
            soup = BeautifulSoup(response.content, 'html.parser')
            
            download_links = []
            
            # Suche nach direkten Download-Links
            for link in soup.find_all('a', href=True):
                href = link['href']
                text = link.get_text(strip=True).lower()
                
                # Prüfe auf Download-Formate
                if any(fmt in href.lower() for fmt in ['epub', 'pdf', 'docx', 'rtf']):
                    format_type = 'epub' if 'epub' in href.lower() else \
                                  'pdf' if 'pdf' in href.lower() else \
                                  'docx' if 'docx' in href.lower() else \
                                  'rtf' if 'rtf' in href.lower() else 'unknown'
                    
                    full_url = urljoin(BASE_URL, href)
                    download_links.append({
                        'url': full_url,
                        'format': format_type
                    })
            
            return download_links
            
        except Exception as e:
            print(f"Fehler beim Suchen von Download-Links: {e}")
            return []
    
    def download_and_extract_text(self, download_url, format_type):
        """Lade eine Datei herunter und extrahiere den Text"""
        try:
            print(f"  Lade {format_type} herunter...")
            response = self.session.get(download_url, stream=True)
            
            if response.status_code == 200:
                with tempfile.NamedTemporaryFile(suffix=f'.{format_type}', delete=False) as tmp_file:
                    for chunk in response.iter_content(chunk_size=8192):
                        tmp_file.write(chunk)
                    tmp_filepath = tmp_file.name
                
                text = self.extract_text_from_file(tmp_filepath, format_type)
                os.unlink(tmp_filepath)
                
                return text
            else:
                print(f"  Download fehlgeschlagen: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"  Fehler beim Download: {e}")
            return None
    
    def extract_text_from_file(self, filepath, format_type):
        """Extrahiere Text aus verschiedenen Dateiformaten"""
        try:
            if format_type == 'epub' and EPUB_AVAILABLE:
                return self.extract_epub_text(filepath)
            elif format_type == 'docx' and DOCX_AVAILABLE:
                return docx2txt.process(filepath)
            elif format_type == 'pdf' and PDF_AVAILABLE:
                return self.extract_pdf_text(filepath)
            elif format_type == 'rtf':
                return self.extract_rtf_text(filepath)
            else:
                return None
                
        except Exception as e:
            print(f"  Fehler beim Extrahieren: {e}")
            return None
    
    def extract_epub_text(self, filepath):
        """Extrahiere Text aus EPUB-Dateien"""
        try:
            book = epub.read_epub(filepath)
            text_parts = []
            
            for item in book.get_items():
                if item.get_type() == ebooklib.ITEM_DOCUMENT:
                    soup = BeautifulSoup(item.get_content(), 'html.parser')
                    text_parts.append(soup.get_text())
            
            return '\n'.join(text_parts)
            
        except Exception as e:
            print(f"  EPUB-Fehler: {e}")
            return None
    
    def extract_pdf_text(self, filepath):
        """Extrahiere Text aus PDF-Dateien"""
        try:
            with open(filepath, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text_parts = []
                
                for page in pdf_reader.pages:
                    text_parts.append(page.extract_text())
                
                return '\n'.join(text_parts)
                
        except Exception as e:
            print(f"  PDF-Fehler: {e}")
            return None
    
    def extract_rtf_text(self, filepath):
        """Extrahiere Text aus RTF-Dateien"""
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as file:
                content = file.read()
                
            # Einfache RTF-Bereinigung
            text = re.sub(r'\\[a-z]+\d*\s?', '', content)
            text = re.sub(r'[{}]', '', text)
            text = re.sub(r'\s+', ' ', text)
            
            return text.strip()
            
        except Exception as e:
            print(f"  RTF-Fehler: {e}")
            return None
    
    def clean_text(self, text):
        """Bereinige extrahierten Text"""
        if not text:
            return ""
        
        # Entferne Metadaten-Muster
        patterns_to_remove = [
            r'^\s*Titel Werk:.*?\n',
            r'^\s*Autor:.*?\n', 
            r'^\s*Identifier:.*?\n',
            r'^\s*Tag:.*?\n',
            r'^\s*Time:.*?\n',
            r'^\s*\d+\s*$',  # Einzelne Seitenzahlen
            r'^\s*UNTITLEd.*?\n',
            r'^\s*\[Seite \d+\].*?\n',
            r'^\s*S\s*$',  # Einzelnes "S"
            r'BKV.*?\n',
            r'Bibliothek.*?\n',
            r'Download.*?\n',
            r'Version.*?\n'
        ]
        
        cleaned_text = text
        for pattern in patterns_to_remove:
            cleaned_text = re.sub(pattern, '', cleaned_text, flags=re.MULTILINE | re.IGNORECASE)
        
        # Entferne Fußnoten-Referenzen
        cleaned_text = re.sub(r'\[\d+\]', '', cleaned_text)
        cleaned_text = re.sub(r'\(\d+\)', '', cleaned_text)
        
        # Entferne übermäßige Leerzeilen
        cleaned_text = re.sub(r'\n\s*\n', '\n', cleaned_text)
        
        # Entferne zu kurze Zeilen
        lines = cleaned_text.split('\n')
        meaningful_lines = []
        for line in lines:
            stripped = line.strip()
            if len(stripped) > 15 and not stripped.isdigit():
                meaningful_lines.append(line)
        
        return '\n'.join(meaningful_lines).strip()
    
    def process_work(self, work_info):
        """Verarbeite ein einzelnes Werk"""
        print(f"  Verarbeite: {work_info['title']}")
        
        # Finde Download-Links
        download_links = self.find_download_links(work_info['url'])
        
        if not download_links:
            print(f"  Keine Download-Links gefunden für: {work_info['title']}")
            return []
        
        # Bevorzuge EPUB > DOCX > PDF > RTF
        preferred_formats = ['epub', 'docx', 'pdf', 'rtf']
        best_link = None
        
        for format_type in preferred_formats:
            for link in download_links:
                if link['format'] == format_type:
                    best_link = link
                    break
            if best_link:
                break
        
        if not best_link:
            best_link = download_links[0]
        
        # Lade herunter und extrahiere
        raw_text = self.download_and_extract_text(best_link['url'], best_link['format'])
        
        if not raw_text:
            print(f"  Extraktion fehlgeschlagen für: {work_info['title']}")
            return []
        
        # Bereinige Text
        cleaned_text = self.clean_text(raw_text)
        
        if not cleaned_text:
            print(f"  Kein Text nach Bereinigung für: {work_info['title']}")
            return []
        
        # Teile in Absätze
        paragraphs = cleaned_text.split('\n\n')
        work_data = []
        
        for i, paragraph in enumerate(paragraphs, 1):
            if len(paragraph.strip()) > 50:  # Nur substantielle Absätze
                work_data.append({
                    'author': work_info['author'],
                    'work_title': work_info['title'],
                    'section': i,
                    'text': paragraph.strip(),
                    'word_count': len(paragraph.split())
                })
        
        print(f"  Extrahiert: {len(work_data)} Absätze")
        return work_data
    
    def save_author_data(self, author_name, author_data):
        """Speichere Daten für einen Autor"""
        if not author_data:
            return
        
        filename = f"kirchenvater_{author_name.replace(' ', '_').replace('/', '_')}.csv"
        df = pd.DataFrame(author_data)
        df.to_csv(filename, index=False, encoding='utf-8')
        print(f"Gespeichert: {filename} mit {len(author_data)} Einträgen")
    
    def run(self):
        """Hauptprogramm"""
        print("BKV Vollständiger Scraper gestartet...")
        print("=" * 50)
        
        # Sammle alle deutschen Werke
        works = self.get_german_works()
        
        if not works:
            print("Keine deutschen Werke gefunden!")
            return
        
        # Gruppiere Werke nach Autor
        authors_works = {}
        for work in works:
            author = work['author']
            if author not in authors_works:
                authors_works[author] = []
            authors_works[author].append(work)
        
        print(f"Gefunden: {len(authors_works)} Autoren mit insgesamt {len(works)} Werken")
        
        # Verarbeite jeden Autor
        for author_name, author_works in authors_works.items():
            print(f"\nAutor: {author_name} ({len(author_works)} Werke)")
            print("-" * 40)
            
            author_data = []
            
            for work in author_works:
                work_data = self.process_work(work)
                author_data.extend(work_data)
                
                # Höflichkeitspause
                time.sleep(1)
            
            # Speichere Daten für diesen Autor
            self.save_author_data(author_name, author_data)
            
            print(f"Autor {author_name} abgeschlossen: {len(author_data)} Einträge")
        
        print("\n" + "=" * 50)
        print("SCRAPING ABGESCHLOSSEN!")
        print(f"Insgesamt {len(authors_works)} Autoren verarbeitet")

if __name__ == "__main__":
    scraper = BKVCompleteScraper()
    scraper.run()
