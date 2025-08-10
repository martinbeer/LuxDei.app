import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
import re
import os
from urllib.parse import urljoin, urlparse
import zipfile
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

class BKVDownloadScraper:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        self.downloaded_files = []
        self.extracted_texts = []
        
    def get_german_works(self):
        """Sammle alle deutschen Werke von der BKV-Website"""
        print("Sammle deutsche Werke...")
        
        works_url = f"{BASE_URL}/de/works"
        response = self.session.get(works_url)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        works = []
        
        # Suche nach deutschen Werk-Links
        for link in soup.find_all('a', href=True):
            href = link['href']
            text = link.get_text(strip=True)
            
            # Nur deutsche Übersetzungen mit Download-Links
            if '/works/' in href and len(text) > 10 and 'Übersetzung (Deutsch)' in text:
                full_url = urljoin(BASE_URL, href)
                author = self.extract_author_from_url_and_text(href, text)
                
                works.append({
                    'url': full_url,
                    'title': text,
                    'author': author
                })
        
        print(f"Gefunden: {len(works)} deutsche Werke")
        return works
    
    def extract_author_from_url_and_text(self, work_url, link_text):
        """Extrahiere Autor aus URL und Text"""
        
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
        
        # Fallback: Extrahiere aus Breadcrumb oder URL-Struktur
        return self.extract_author_from_breadcrumb(work_url)
    
    def extract_author_from_breadcrumb(self, work_url):
        """Extrahiere Autor aus der Werkseite (Breadcrumb)"""
        try:
            response = self.session.get(work_url)
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Suche nach Autor-Informationen
            breadcrumbs = soup.find_all('a', href=True)
            for bc in breadcrumbs:
                if '/authors/' in bc.get('href', '') or 'author' in bc.get('href', ''):
                    return bc.get_text(strip=True)
            
            # Alternative: Suche in h1/h2/h3 Überschriften
            for tag in ['h1', 'h2', 'h3']:
                elements = soup.find_all(tag)
                for elem in elements:
                    text = elem.get_text(strip=True)
                    if any(name in text for name in ['von', 'der', 'de', 'von Hippo', 'von Mailand']):
                        return text
            
            return "Unbekannt"
            
        except Exception as e:
            print(f"Fehler beim Extrahieren des Autors: {e}")
            return "Unbekannt"
    
    def find_download_links(self, work_url):
        """Finde alle Download-Links auf einer Werkseite"""
        try:
            response = self.session.get(work_url)
            soup = BeautifulSoup(response.content, 'html.parser')
            
            download_links = []
            
            # Suche nach direkten Download-Links (basierend auf Analyse)
            for link in soup.find_all('a', href=True):
                href = link['href']
                text = link.get_text(strip=True).lower()
                
                # Prüfe auf Download-Formate in URL aus /files/ Verzeichnis
                if '/files/' in href and any(fmt in href.lower() for fmt in ['.epub', '.pdf', '.docx', '.rtf']):
                    download_links.append({
                        'url': urljoin(BASE_URL, href),
                        'format': self.get_file_format(href),
                        'text': text
                    })
                
                # Prüfe auf Download-Keywords im Text mit Dateigröße
                elif any(word in text for word in ['docx', 'epub', 'pdf', 'rtf']) and 'kb' in text:
                    download_links.append({
                        'url': urljoin(BASE_URL, href),
                        'format': self.get_file_format(href),
                        'text': text
                    })
            
            # Suche nach versteckten Download-Links in JavaScript oder Metadaten
            scripts = soup.find_all('script')
            for script in scripts:
                if script.string:
                    for fmt in ['epub', 'pdf', 'docx', 'rtf']:
                        if fmt in script.string.lower():
                            # Extrahiere URLs aus JavaScript
                            urls = re.findall(r'https?://[^\s<>"\']+\.' + fmt, script.string, re.IGNORECASE)
                            for url in urls:
                                download_links.append({
                                    'url': url,
                                    'format': fmt,
                                    'text': 'JavaScript'
                                })
            
            return download_links
            
        except Exception as e:
            print(f"Fehler beim Suchen nach Download-Links: {e}")
            return []
    
    def get_file_format(self, url):
        """Bestimme das Dateiformat aus der URL"""
        url_lower = url.lower()
        if '.epub' in url_lower:
            return 'epub'
        elif '.pdf' in url_lower:
            return 'pdf'
        elif '.docx' in url_lower:
            return 'docx'
        elif '.rtf' in url_lower:
            return 'rtf'
        else:
            return 'unknown'
    
    def download_and_extract_text(self, download_url, format_type):
        """Lade eine Datei herunter und extrahiere den Text"""
        try:
            print(f"Lade herunter: {download_url}")
            response = self.session.get(download_url, stream=True)
            
            if response.status_code == 200:
                # Erstelle temporäre Datei
                with tempfile.NamedTemporaryFile(suffix=f'.{format_type}', delete=False) as tmp_file:
                    for chunk in response.iter_content(chunk_size=8192):
                        tmp_file.write(chunk)
                    tmp_filepath = tmp_file.name
                
                # Extrahiere Text basierend auf Format
                text = self.extract_text_from_file(tmp_filepath, format_type)
                
                # Lösche temporäre Datei
                os.unlink(tmp_filepath)
                
                return text
            else:
                print(f"Download fehlgeschlagen: {response.status_code}")
                return None
                
        except Exception as e:
            print(f"Fehler beim Download/Extraktion: {e}")
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
                print(f"Format {format_type} nicht unterstützt oder Bibliothek nicht verfügbar")
                return None
                
        except Exception as e:
            print(f"Fehler beim Extrahieren von Text aus {format_type}: {e}")
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
            print(f"Fehler beim EPUB-Extrahieren: {e}")
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
            print(f"Fehler beim PDF-Extrahieren: {e}")
            return None
    
    def extract_rtf_text(self, filepath):
        """Extrahiere Text aus RTF-Dateien (einfache Implementation)"""
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as file:
                content = file.read()
                
            # Einfache RTF-Bereinigung (entfernt RTF-Codes)
            text = re.sub(r'\\[a-z]+\d*\s?', '', content)
            text = re.sub(r'[{}]', '', text)
            text = re.sub(r'\s+', ' ', text)
            
            return text.strip()
            
        except Exception as e:
            print(f"Fehler beim RTF-Extrahieren: {e}")
            return None
    
    def clean_text(self, text):
        """Bereinige extrahierten Text von Metadaten und Beschreibungen"""
        if not text:
            return ""
        
        # Entferne häufige Metadaten-Muster
        patterns_to_remove = [
            r'^\s*UNTITLED.*?\n',
            r'^\s*Titel Werk:.*?\n',
            r'^\s*Autor:.*?\n',
            r'^\s*Identifier:.*?\n',
            r'^\s*Tag:.*?\n',
            r'^\s*Time:.*?\n',
            r'^\s*Inhaltsverzeichnis.*?\n',
            r'^\s*Bibliographie.*?\n',
            r'^\s*Literaturverzeichnis.*?\n',
            r'^\s*Einleitung.*?\n',
            r'^\s*Vorwort.*?\n',
            r'^\s*Seite \d+.*?\n',
            r'^\s*\d+\s*$',  # Einzelne Seitenzahlen
            r'BKV.*?\n',
            r'Bibliothek.*?\n',
            r'Download.*?\n',
            r'Version.*?\n',
            r'^\s*\[Seite \d+\].*?\n',
            r'^\s*\|\s*\d+\s*\|.*?\n',  # Tabellen-Artefakte
            r'^\s*Copyright.*?\n',
            r'^\s*\©.*?\n',
            r'^\s*ISBN.*?\n',
            r'^\s*Verlag.*?\n',
            r'^\s*Impressum.*?\n',
            r'^\s*Anmerkungen.*?\n',
            r'^\s*Fußnoten.*?\n',
            r'^\s*Register.*?\n',
            r'^\s*Index.*?\n',
            r'^\s*Stichwortverzeichnis.*?\n',
            r'^\s*Printed in.*?\n',
            r'^\s*All rights reserved.*?\n',
            r'^\s*Kein Teil.*?\n',
            r'^\s*Übersetzung.*?\n',
            r'^\s*Übersetzer.*?\n',
            r'^\s*Hrsg\..*?\n',
            r'^\s*Herausgeber.*?\n',
            r'^\s*Redaktion.*?\n',
            r'^\s*Lektorat.*?\n',
            r'^\s*Korrektur.*?\n',
            r'^\s*Satz.*?\n',
            r'^\s*Druck.*?\n',
            r'^\s*Bindung.*?\n',
            r'^\s*Gedruckt.*?\n',
            r'^\s*Erste Auflage.*?\n',
            r'^\s*\d+\. Auflage.*?\n',
            r'^\s*www\..*?\n',
            r'^\s*https?://.*?\n',
            r'^\s*E-Mail.*?\n',
            r'^\s*email.*?\n',
            r'^\s*Tel\..*?\n',
            r'^\s*Fax.*?\n',
            r'^\s*Telefon.*?\n',
            r'^\s*Telefax.*?\n'
        ]
        
        cleaned_text = text
        for pattern in patterns_to_remove:
            cleaned_text = re.sub(pattern, '', cleaned_text, flags=re.MULTILINE | re.IGNORECASE)
        
        # Entferne Fußnoten-Referenzen
        cleaned_text = re.sub(r'\[\d+\]', '', cleaned_text)
        cleaned_text = re.sub(r'\(\d+\)', '', cleaned_text)
        
        # Entferne doppelte Titel und Wiederholungen
        cleaned_text = re.sub(r'(.+?)\n\1', r'\1', cleaned_text)  # Doppelte Zeilen
        
        # Entferne übermäßige Leerzeilen
        cleaned_text = re.sub(r'\n\s*\n', '\n', cleaned_text)
        
        # Entferne Zeilen mit nur wenigen Zeichen oder nur Zahlen
        lines = cleaned_text.split('\n')
        meaningful_lines = []
        for line in lines:
            stripped = line.strip()
            # Nur substantielle Zeilen behalten
            if (len(stripped) > 20 and 
                not stripped.isdigit() and 
                not re.match(r'^\d+\s*$', stripped) and
                not re.match(r'^[A-Z\s]+$', stripped)):  # Keine reinen Großbuchstaben-Titel
                meaningful_lines.append(line)
        
        return '\n'.join(meaningful_lines).strip()
    
    def structure_text_into_verses(self, text, work_title):
        """Strukturiere Text in Kapitel und Verse"""
        if not text:
            return []
        
        verses = []
        
        # Teile Text in Kapitel (verschiedene Muster)
        chapter_patterns = [
            r'Kapitel\s+(\d+)',
            r'Kap\.\s+(\d+)',
            r'^\s*(\d+)\.\s+',
            r'^\s*(\d+)\s+',
            r'Chapter\s+(\d+)',
            r'Book\s+(\d+)'
        ]
        
        current_chapter = "1"
        verse_number = 1
        
        # Teile Text in Absätze
        paragraphs = text.split('\n\n')
        
        for paragraph in paragraphs:
            if not paragraph.strip():
                continue
            
            # Prüfe, ob Paragraph eine Kapitelüberschrift ist
            is_chapter_header = False
            for pattern in chapter_patterns:
                match = re.search(pattern, paragraph.strip(), re.IGNORECASE)
                if match:
                    current_chapter = match.group(1)
                    is_chapter_header = True
                    break
            
            if not is_chapter_header:
                # Teile Paragraph in Sätze für Verse
                sentences = re.split(r'[.!?]+', paragraph)
                for sentence in sentences:
                    sentence = sentence.strip()
                    if len(sentence) > 20:  # Nur substantielle Sätze
                        verses.append({
                            'chapter': current_chapter,
                            'verse': verse_number,
                            'text': sentence
                        })
                        verse_number += 1
        
        return verses
    
    def process_work(self, work_info):
        """Verarbeite ein einzelnes Werk"""
        print(f"\nVerarbeite Werk: {work_info['title']}")
        print(f"Autor: {work_info['author']}")
        
        # Finde Download-Links
        download_links = self.find_download_links(work_info['url'])
        
        if not download_links:
            print("Keine Download-Links gefunden, verwende HTML-Scraping als Fallback")
            return self.fallback_html_scraping(work_info)
        
        # Bevorzuge bestimmte Formate
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
            best_link = download_links[0]  # Nimm den ersten verfügbaren
        
        print(f"Verwende Download-Link: {best_link['url']} ({best_link['format']})")
        
        # Lade herunter und extrahiere
        raw_text = self.download_and_extract_text(best_link['url'], best_link['format'])
        
        if not raw_text:
            print("Download/Extraktion fehlgeschlagen, verwende HTML-Scraping als Fallback")
            return self.fallback_html_scraping(work_info)
        
        # Bereinige Text
        cleaned_text = self.clean_text(raw_text)
        
        # Strukturiere in Verse
        verses = self.structure_text_into_verses(cleaned_text, work_info['title'])
        
        # Füge Metadaten hinzu
        for verse in verses:
            verse['author'] = work_info['author']
            verse['werk'] = work_info['title']
        
        return verses
    
    def fallback_html_scraping(self, work_info):
        """Fallback: HTML-Scraping wenn keine Downloads verfügbar"""
        print("Verwende HTML-Scraping als Fallback...")
        
        try:
            response = self.session.get(work_info['url'])
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Suche nach Textinhalten
            text_elements = soup.find_all(['p', 'div'], class_=re.compile(r'text|content|body'))
            
            if not text_elements:
                # Fallback: Alle p-Tags
                text_elements = soup.find_all('p')
            
            text_parts = []
            for elem in text_elements:
                text_parts.append(elem.get_text(strip=True))
            
            raw_text = '\n'.join(text_parts)
            cleaned_text = self.clean_text(raw_text)
            verses = self.structure_text_into_verses(cleaned_text, work_info['title'])
            
            for verse in verses:
                verse['author'] = work_info['author']
                verse['werk'] = work_info['title']
            
            return verses
            
        except Exception as e:
            print(f"Fehler beim HTML-Scraping: {e}")
            return []
    
    def generate_summary_statistics(self, all_verses):
        """Generiere Zusammenfassungs-Statistiken"""
        if not all_verses:
            return
        
        # Zähle Verse pro Autor
        author_stats = {}
        werk_stats = {}
        
        for verse in all_verses:
            author = verse['author']
            werk = verse['werk']
            
            if author not in author_stats:
                author_stats[author] = {'verses': 0, 'works': set()}
            author_stats[author]['verses'] += 1
            author_stats[author]['works'].add(werk)
            
            if werk not in werk_stats:
                werk_stats[werk] = {'author': author, 'verses': 0}
            werk_stats[werk]['verses'] += 1
        
        # Erstelle Statistik-Datei
        stats_lines = []
        stats_lines.append("BKV SCRAPER STATISTIKEN")
        stats_lines.append("=" * 50)
        stats_lines.append(f"Insgesamt verarbeitete Verse: {len(all_verses)}")
        stats_lines.append(f"Anzahl Autoren: {len(author_stats)}")
        stats_lines.append(f"Anzahl Werke: {len(werk_stats)}")
        stats_lines.append("")
        
        stats_lines.append("VERSE PRO AUTOR:")
        stats_lines.append("-" * 30)
        for author, stats in sorted(author_stats.items(), key=lambda x: x[1]['verses'], reverse=True):
            stats_lines.append(f"{author}: {stats['verses']} Verse in {len(stats['works'])} Werken")
        
        stats_lines.append("")
        stats_lines.append("VERSE PRO WERK:")
        stats_lines.append("-" * 30)
        for werk, stats in sorted(werk_stats.items(), key=lambda x: x[1]['verses'], reverse=True):
            stats_lines.append(f"{werk} ({stats['author']}): {stats['verses']} Verse")
        
        # Speichere Statistiken
        with open('bkv_scraper_statistiken.txt', 'w', encoding='utf-8') as f:
            f.write('\n'.join(stats_lines))
        
        print("\nStatistiken gespeichert in: bkv_scraper_statistiken.txt")
        
        # Zeige Kurzzusammenfassung
        print("\nKURZZUSAMMENFASSUNG:")
        print(f"- {len(all_verses)} Verse extrahiert")
        print(f"- {len(author_stats)} Autoren")
        print(f"- {len(werk_stats)} Werke")
        print(f"- Top 3 Autoren: {', '.join([author for author, _ in sorted(author_stats.items(), key=lambda x: x[1]['verses'], reverse=True)[:3]])}")

    def save_master_csv(self, all_verses):
        """Speichere eine Master-CSV mit allen Versen"""
        if not all_verses:
            return
        
        df = pd.DataFrame(all_verses)
        master_filename = "bkv_alle_kirchenvaeter_vollstaendig.csv"
        df.to_csv(master_filename, index=False, encoding='utf-8')
        print(f"Master-CSV gespeichert: {master_filename}")
        
        # Erstelle auch eine kompakte Version nur mit essentiellen Spalten
        compact_df = df[['author', 'werk', 'chapter', 'verse', 'text']]
        compact_filename = "bkv_alle_kirchenvaeter_kompakt.csv"
        compact_df.to_csv(compact_filename, index=False, encoding='utf-8')
        print(f"Kompakte CSV gespeichert: {compact_filename}")

    def save_to_csv(self, all_verses):
        """Speichere alle Verse in CSV-Dateien, gruppiert nach Autor"""
        if not all_verses:
            print("Keine Verse zum Speichern gefunden.")
            return
        
        # Gruppiere nach Autor
        authors = {}
        for verse in all_verses:
            author = verse['author']
            if author not in authors:
                authors[author] = []
            authors[author].append(verse)
        
        # Speichere pro Autor
        for author, verses in authors.items():
            filename = f"kirchenvater_{author.replace(' ', '_').replace('/', '_')}.csv"
            df = pd.DataFrame(verses)
            df.to_csv(filename, index=False, encoding='utf-8')
            print(f"Gespeichert: {filename} mit {len(verses)} Versen")
        
        # Speichere auch Master-CSV
        self.save_master_csv(all_verses)
        
        # Generiere Statistiken
        self.generate_summary_statistics(all_verses)
    
    def run(self):
        """Hauptprogramm"""
        print("BKV Download-Scraper gestartet...")
        
        # Sammle alle Werke
        works = self.get_german_works()
        
        if not works:
            print("Keine Werke gefunden!")
            return
        
        all_verses = []
        
        # Verarbeite jedes Werk
        for i, work in enumerate(works):  # Verarbeite alle Werke
            print(f"\nVerarbeite Werk {i+1}/{len(works)}")
            verses = self.process_work(work)
            all_verses.extend(verses)
            
            # Höflichkeitspause
            time.sleep(2)
        
        # Speichere Ergebnisse
        self.save_to_csv(all_verses)
        
        print(f"\nFertig! Insgesamt {len(all_verses)} Verse extrahiert.")

if __name__ == "__main__":
    scraper = BKVDownloadScraper()
    scraper.run()
