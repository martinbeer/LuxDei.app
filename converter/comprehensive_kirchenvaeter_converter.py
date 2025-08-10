#!/usr/bin/env python3
"""
Umfassender Kirchenväter-Konverter für Supabase
==============================================

Analysiert und konvertiert alle deutschen Kirchenväter-Werke aus bkv_links.csv
in strukturierte, detaillierte CSV-Dateien mit vollständiger Metadaten-Erfassung.

Features:
- Automatische Struktur-Analyse (Bücher, Kapitel, Verse)
- Fußnoten-Extraktion und -Kennzeichnung
- Einleitungen als separate Kategorien
- Vollständige Metadaten-Erfassung
- Robuste Fehlerbehandlung
- Progressiver Speicher-Ansatz
"""

import requests
import os
import re
import csv
import time
import json
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
import unicodedata
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional, Tuple
import logging

# Logging konfigurieren
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('kirchenvaeter_converter.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class TextSegment:
    """Datenstruktur für einen Textsegment."""
    id: int
    author: str
    work_title: str
    work_id: str
    section_type: str  # 'introduction', 'preface', 'book', 'chapter', 'verse', 'paragraph', 'footnote'
    section_number: Optional[int]
    subsection_number: Optional[int]
    verse_number: Optional[int]
    title: str
    text: str
    footnotes: List[str]
    word_count: int
    language: str
    parent_section: Optional[str]
    hierarchy_level: int
    is_introduction: bool
    is_footnote: bool
    original_url: str
    page_number: Optional[int]

class ComprehensiveKirchenvaeterConverter:
    """Umfassender Konverter für Kirchenväter-Werke."""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        
        # Ausgabeordner erstellen
        self.output_dir = "kirchenväter-auto"
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)
            logger.info(f"📁 Ordner '{self.output_dir}' erstellt.")
        
        # Statistiken
        self.stats = {
            'processed_works': 0,
            'total_segments': 0,
            'errors': 0,
            'footnotes_found': 0,
            'introductions_found': 0
        }
    
    def download_page(self, url: str) -> Tuple[Optional[str], Optional[int]]:
        """Lädt eine Webseite herunter und gibt den Inhalt und Status-Code zurück."""
        try:
            logger.debug(f"🌐 Lade Seite: {url}")
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            response.encoding = 'utf-8'
            return response.text, response.status_code
        except requests.RequestException as e:
            logger.error(f"❌ Fehler beim Laden der Seite {url}: {e}")
            return None, None
    
    def analyze_work_structure(self, url: str) -> Dict:
        """Analysiert die Struktur eines Werks (Bücher, Kapitel, Verse, etc.)."""
        html, status_code = self.download_page(url)
        if not html:
            return {}
        
        soup = BeautifulSoup(html, 'html.parser')
        
        structure = {
            'has_books': False,
            'has_chapters': False,
            'has_verses': False,
            'has_paragraphs': False,
            'has_footnotes': False,
            'has_introduction': False,
            'book_count': 0,
            'chapter_count': 0,
            'verse_count': 0,
            'paragraph_count': 0,
            'footnote_count': 0,
            'content_type': 'unknown',
            'hierarchy_levels': 0
        }
        
        # Suche nach verschiedenen Strukturelementen
        text_content = soup.get_text()
        
        # Bücher erkennen
        book_patterns = [
            r'Buch\s+[IVX]+', r'Book\s+\d+', r'Liber\s+[IVX]+',
            r'Teil\s+[IVX]+', r'Band\s+\d+'
        ]
        for pattern in book_patterns:
            matches = re.findall(pattern, text_content, re.IGNORECASE)
            if matches:
                structure['has_books'] = True
                structure['book_count'] = len(set(matches))
                structure['hierarchy_levels'] = max(structure['hierarchy_levels'], 1)
        
        # Kapitel erkennen
        chapter_patterns = [
            r'Kapitel\s+\d+', r'Chapter\s+\d+', r'Kap\.\s+\d+',
            r'Cap\.\s+\d+', r'§\s*\d+', r'Abschnitt\s+\d+'
        ]
        for pattern in chapter_patterns:
            matches = re.findall(pattern, text_content, re.IGNORECASE)
            if matches:
                structure['has_chapters'] = True
                structure['chapter_count'] = len(set(matches))
                structure['hierarchy_levels'] = max(structure['hierarchy_levels'], 2)
        
        # Verse erkennen
        verse_patterns = [
            r'\d+\.\s*\d+', r'Vers\s+\d+', r'V\.\s*\d+',
            r'Nr\.\s*\d+', r'\[\d+\]'
        ]
        for pattern in verse_patterns:
            matches = re.findall(pattern, text_content)
            if matches:
                structure['has_verses'] = True
                structure['verse_count'] = len(set(matches))
                structure['hierarchy_levels'] = max(structure['hierarchy_levels'], 3)
        
        # Fußnoten erkennen
        footnote_patterns = [
            r'<sup[^>]*>\d+</sup>', r'\(\d+\)', r'¹', r'²', r'³',
            r'<a[^>]*class[^>]*footnote[^>]*>', r'<div[^>]*class[^>]*footnote[^>]*>'
        ]
        for pattern in footnote_patterns:
            matches = re.findall(pattern, html, re.IGNORECASE)
            if matches:
                structure['has_footnotes'] = True
                structure['footnote_count'] += len(matches)
        
        # Einleitungen erkennen
        intro_patterns = [
            r'Einleitung', r'Vorwort', r'Einführung', r'Vorbemerkung',
            r'Introduction', r'Preface', r'Prolegomena'
        ]
        for pattern in intro_patterns:
            if re.search(pattern, text_content, re.IGNORECASE):
                structure['has_introduction'] = True
        
        # Absätze zählen
        paragraphs = soup.find_all('p')
        structure['paragraph_count'] = len(paragraphs)
        structure['has_paragraphs'] = len(paragraphs) > 0
        
        # Inhaltstyp bestimmen
        if structure['has_books'] and structure['has_chapters']:
            structure['content_type'] = 'multi_book_work'
        elif structure['has_chapters']:
            structure['content_type'] = 'chaptered_work'
        elif structure['has_verses']:
            structure['content_type'] = 'versed_work'
        elif structure['has_paragraphs']:
            structure['content_type'] = 'paragraph_work'
        else:
            structure['content_type'] = 'simple_text'
        
        return structure
    
    def extract_author_and_title(self, soup: BeautifulSoup, url: str) -> Tuple[str, str, str]:
        """Extrahiert Autor, Werktitel und Werk-ID aus der Seite."""
        # Autor extrahieren
        author = "Unbekannter Autor"
        author_selectors = [
            'h1', '.author', '.work-author', '[class*="author"]',
            '.breadcrumb a', '.metadata .author'
        ]
        
        for selector in author_selectors:
            element = soup.select_one(selector)
            if element:
                text = element.get_text(strip=True)
                if text and len(text) > 3:
                    author = text
                    break
        
        # Werktitel extrahieren
        title = "Unbekannter Titel"
        title_selectors = [
            'h2', '.title', '.work-title', '[class*="title"]',
            '.metadata .title', 'h1 + h2'
        ]
        
        for selector in title_selectors:
            element = soup.select_one(selector)
            if element:
                text = element.get_text(strip=True)
                if text and len(text) > 3 and text != author:
                    title = text
                    break
        
        # Werk-ID aus URL extrahieren
        work_id = url.split('/')[-1] if '/' in url else url
        if 'cpg-' in url:
            work_id = re.search(r'cpg-[\d\w-]+', url).group(0) if re.search(r'cpg-[\d\w-]+', url) else work_id
        
        return author, title, work_id
    
    def download_all_pages(self, base_url: str) -> List[str]:
        """Lädt alle Folgeseiten eines Werks herunter."""
        html_pages = []
        page_num = 1
        
        # Basis-URL bereinigen
        base_url_clean = base_url.rstrip('/')
        if base_url_clean.endswith('/divisions'):
            base_url_clean = base_url_clean[:-10]
        
        logger.info(f"🔍 Basis-URL: {base_url_clean}")
        
        while True:
            if page_num == 1:
                url = base_url_clean
            else:
                url = f"{base_url_clean}/{page_num}"
            
            html, status_code = self.download_page(url)
            if not html:
                if page_num == 1:
                    logger.error(f"❌ Konnte Startseite nicht laden: {url}")
                    return []
                else:
                    logger.info(f"ℹ️  Keine weitere Seite gefunden: {url}")
                    break
            
            # Prüfung auf "Page not found"
            if "The page you requested was not found." in html:
                if page_num == 1:
                    logger.error(f"❌ Startseite zeigt 'Page not found': {url}")
                    return []
                else:
                    logger.info(f"ℹ️  Keine weitere Seite: {url} (Page not found)")
                    break
            
            html_pages.append(html)
            logger.info(f"✅ Seite {page_num} geladen: {url}")
            page_num += 1
            
            # Kurze Pause zwischen Requests
            time.sleep(0.2)
        
        return html_pages
    
    def clean_text(self, text: str) -> str:
        """Bereinigt Text von HTML-Tags und unnötigen Zeichen."""
        if not text:
            return ""
        
        # HTML-Tags entfernen
        text = re.sub(r'<[^>]+>', '', text)
        
        # Spezielle Zeichen bereinigen
        text = re.sub(r'↩', '', text)
        text = re.sub(r'[^\w\s\.,;:!?()\[\]"\'„"‚''–—-]', ' ', text)
        text = re.sub(r'\s+', ' ', text)
        
        # Referenzen und Seitenzahlen entfernen
        text = re.sub(r'\bS\.\s*\d+', '', text)
        text = re.sub(r'\b\d+\.\s*\d+\b', '', text)
        text = re.sub(r'\b[IVX]+,\s*c\.\s*\d+\.?', '', text)
        
        text = text.strip()
        text = unicodedata.normalize('NFKC', text)
        
        return text
    
    def extract_footnotes(self, soup: BeautifulSoup) -> List[str]:
        """Extrahiert Fußnoten aus der HTML-Struktur."""
        footnotes = []
        
        # Verschiedene Fußnoten-Selektoren
        footnote_selectors = [
            '.footnote', '[class*="footnote"]', '.note', '[class*="note"]',
            '.annotation', '[class*="annotation"]', 'sup', '.sup'
        ]
        
        for selector in footnote_selectors:
            elements = soup.select(selector)
            for element in elements:
                text = self.clean_text(element.get_text(strip=True))
                if text and len(text) > 5:
                    footnotes.append(text)
        
        return list(set(footnotes))  # Duplikate entfernen
    
    def extract_comprehensive_content(self, html_pages: List[str], author: str, title: str, work_id: str, url: str) -> List[TextSegment]:
        """Extrahiert umfassend strukturierte Inhalte aus allen Seiten."""
        segments = []
        current_id = 1
        
        for page_num, html in enumerate(html_pages, 1):
            soup = BeautifulSoup(html, 'html.parser')
            
            # Störende Elemente entfernen
            for unwanted in soup.select('nav, header, footer, aside, .navigation, .menu, .download'):
                unwanted.decompose()
            
            # Hauptinhalt finden
            main_content = (soup.select_one('.content') or 
                          soup.select_one('.main-content') or 
                          soup.select_one('main') or 
                          soup.select_one('article') or 
                          soup.find('body') or soup)
            
            # Fußnoten extrahieren
            footnotes = self.extract_footnotes(soup)
            self.stats['footnotes_found'] += len(footnotes)
            
            # Strukturierte Elemente finden
            elements = main_content.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'li'])
            
            current_book = None
            current_chapter = None
            current_verse = None
            hierarchy_level = 0
            
            for element in elements:
                raw_text = element.get_text(strip=True)
                if not raw_text or len(raw_text) < 10:
                    continue
                
                cleaned_text = self.clean_text(raw_text)
                if not cleaned_text:
                    continue
                
                # Elementtyp bestimmen
                section_type = 'paragraph'
                section_number = None
                subsection_number = None
                verse_number = None
                is_introduction = False
                
                tag_name = element.name.lower()
                
                # Einleitung erkennen
                if any(word in cleaned_text.lower() for word in ['einleitung', 'vorwort', 'einführung', 'vorbemerkung', 'introduction', 'preface']):
                    section_type = 'introduction'
                    is_introduction = True
                    hierarchy_level = 1
                    self.stats['introductions_found'] += 1
                
                # Überschriften analysieren
                elif tag_name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                    hierarchy_level = int(tag_name[1])
                    
                    # Buchstruktur erkennen
                    if re.search(r'buch\s+[ivx]+|book\s+\d+|liber\s+[ivx]+', cleaned_text, re.IGNORECASE):
                        section_type = 'book'
                        current_book = cleaned_text
                        book_match = re.search(r'[ivx]+|\d+', cleaned_text, re.IGNORECASE)
                        if book_match:
                            section_number = book_match.group()
                    
                    # Kapitelstruktur erkennen
                    elif re.search(r'kapitel\s+\d+|chapter\s+\d+|kap\.\s+\d+', cleaned_text, re.IGNORECASE):
                        section_type = 'chapter'
                        current_chapter = cleaned_text
                        chapter_match = re.search(r'\d+', cleaned_text)
                        if chapter_match:
                            section_number = int(chapter_match.group())
                    
                    else:
                        section_type = 'heading'
                
                # Verse erkennen
                elif re.match(r'^\d+\.\s*\d+', cleaned_text):
                    section_type = 'verse'
                    verse_match = re.match(r'^(\d+)\.\s*(\d+)', cleaned_text)
                    if verse_match:
                        section_number = int(verse_match.group(1))
                        verse_number = int(verse_match.group(2))
                
                # Paragraphen mit Nummern
                elif re.match(r'^\d+\.', cleaned_text):
                    section_type = 'paragraph'
                    para_match = re.match(r'^(\d+)\.', cleaned_text)
                    if para_match:
                        section_number = int(para_match.group(1))
                
                # Fußnote erkennen
                elif (element.get('class') and 
                      any('footnote' in str(cls).lower() or 'note' in str(cls).lower() 
                          for cls in element.get('class', []))):
                    section_type = 'footnote'
                    hierarchy_level = 99  # Fußnoten haben niedrigste Priorität
                
                # Segment erstellen
                segment = TextSegment(
                    id=current_id,
                    author=author,
                    work_title=title,
                    work_id=work_id,
                    section_type=section_type,
                    section_number=section_number,
                    subsection_number=subsection_number,
                    verse_number=verse_number,
                    title=cleaned_text[:100] if len(cleaned_text) > 100 else cleaned_text,
                    text=cleaned_text,
                    footnotes=footnotes if section_type == 'footnote' else [],
                    word_count=len(cleaned_text.split()),
                    language='deutsch',
                    parent_section=current_chapter or current_book,
                    hierarchy_level=hierarchy_level,
                    is_introduction=is_introduction,
                    is_footnote=section_type == 'footnote',
                    original_url=url,
                    page_number=page_num
                )
                
                segments.append(segment)
                current_id += 1
        
        return segments
    
    def save_work_to_csv(self, segments: List[TextSegment], filename: str):
        """Speichert ein Werk als CSV-Datei."""
        if not segments:
            logger.warning(f"⚠️  Keine Segmente zum Speichern für {filename}")
            return
        
        filepath = os.path.join(self.output_dir, filename)
        
        with open(filepath, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = [
                'id', 'author', 'work_title', 'work_id', 'section_type',
                'section_number', 'subsection_number', 'verse_number',
                'title', 'text', 'footnotes', 'word_count', 'language',
                'parent_section', 'hierarchy_level', 'is_introduction',
                'is_footnote', 'original_url', 'page_number'
            ]
            
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            
            for segment in segments:
                row = asdict(segment)
                row['footnotes'] = json.dumps(row['footnotes'], ensure_ascii=False)
                writer.writerow(row)
        
        logger.info(f"✅ Werk gespeichert: {filepath} ({len(segments)} Segmente)")
    
    def sanitize_filename(self, filename: str) -> str:
        """Bereinigt Dateinamen für das Dateisystem."""
        # Sonderzeichen entfernen
        filename = re.sub(r'[<>:"/\\|?*]', '', filename)
        filename = re.sub(r'\s+', '_', filename)
        filename = filename.lower()
        
        # Maximale Länge begrenzen
        if len(filename) > 100:
            filename = filename[:100]
        
        return filename + '.csv'
    
    def process_single_work(self, url: str) -> bool:
        """Verarbeitet ein einzelnes Werk."""
        try:
            logger.info(f"🔍 Verarbeite Werk: {url}")
            
            # Struktur analysieren
            structure = self.analyze_work_structure(url)
            logger.info(f"📊 Struktur: {structure['content_type']}, "
                       f"Bücher: {structure['book_count']}, "
                       f"Kapitel: {structure['chapter_count']}, "
                       f"Fußnoten: {structure['footnote_count']}")
            
            # Alle Seiten herunterladen
            html_pages = self.download_all_pages(url)
            if not html_pages:
                logger.error(f"❌ Keine Seiten für {url}")
                return False
            
            # Erste Seite für Metadaten analysieren
            soup = BeautifulSoup(html_pages[0], 'html.parser')
            author, title, work_id = self.extract_author_and_title(soup, url)
            
            logger.info(f"📚 Autor: {author}, Titel: {title}")
            
            # Inhalte extrahieren
            segments = self.extract_comprehensive_content(html_pages, author, title, work_id, url)
            
            if not segments:
                logger.warning(f"⚠️  Keine Inhalte extrahiert für {url}")
                return False
            
            # Dateiname generieren
            filename = self.sanitize_filename(f"{author}_{title}")
            
            # CSV speichern
            self.save_work_to_csv(segments, filename)
            
            self.stats['processed_works'] += 1
            self.stats['total_segments'] += len(segments)
            
            logger.info(f"✅ Werk verarbeitet: {filename} ({len(segments)} Segmente)")
            return True
            
        except Exception as e:
            logger.error(f"❌ Fehler bei {url}: {e}")
            self.stats['errors'] += 1
            return False
    
    def process_all_works(self, csv_file: str = "bkv_links.csv"):
        """Verarbeitet alle Werke aus der CSV-Datei."""
        logger.info(f"🚀 Starte Verarbeitung aller Werke aus {csv_file}")
        
        # CSV-Datei lesen
        urls = []
        try:
            with open(csv_file, 'r', encoding='utf-8') as file:
                reader = csv.DictReader(file)
                urls = [row['URL'] for row in reader if row['URL']]
        except FileNotFoundError:
            logger.error(f"❌ CSV-Datei nicht gefunden: {csv_file}")
            return
        
        logger.info(f"📋 {len(urls)} Werke zu verarbeiten")
        
        # Werke verarbeiten
        for i, url in enumerate(urls, 1):
            logger.info(f"\n🔄 Verarbeite {i}/{len(urls)}: {url}")
            
            success = self.process_single_work(url)
            
            if success:
                logger.info(f"✅ {i}/{len(urls)} erfolgreich verarbeitet")
            else:
                logger.error(f"❌ {i}/{len(urls)} fehlgeschlagen")
            
            # Pause zwischen Werken
            time.sleep(1)
            
            # Zwischenbericht alle 10 Werke
            if i % 10 == 0:
                logger.info(f"📊 Zwischenbericht: {self.stats['processed_works']}/{i} erfolgreich, "
                           f"{self.stats['total_segments']} Segmente, "
                           f"{self.stats['errors']} Fehler")
        
        # Abschlussbericht
        logger.info(f"\n🎉 Verarbeitung abgeschlossen!")
        logger.info(f"📊 Statistiken:")
        logger.info(f"   - Verarbeitete Werke: {self.stats['processed_works']}/{len(urls)}")
        logger.info(f"   - Gesamte Segmente: {self.stats['total_segments']}")
        logger.info(f"   - Gefundene Fußnoten: {self.stats['footnotes_found']}")
        logger.info(f"   - Gefundene Einleitungen: {self.stats['introductions_found']}")
        logger.info(f"   - Fehler: {self.stats['errors']}")
        logger.info(f"   - Erfolgsrate: {(self.stats['processed_works']/len(urls)*100):.1f}%")

def main():
    """Hauptfunktion."""
    converter = ComprehensiveKirchenvaeterConverter()
    converter.process_all_works()

if __name__ == "__main__":
    main()
