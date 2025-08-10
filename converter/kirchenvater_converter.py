#!/usr/bin/env python3
"""
Kirchenväter-Konverter für Supabase
===================================

Interaktiver Konverter für Kirchenväter-Werke von https://bkv.unifr.ch/de/works
Lädt Werke herunter und konvertiert sie in strukturierte CSV-Dateien für Supabase.
"""

import requests
import os
import re
import csv
import time
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
import unicodedata


class KirchenvaeterConverter:
    """Konverter für Kirchenväter-Werke von der BKV-Website."""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        
        # Ausgabeordner erstellen
        self.output_dir = "Kirchenvater.csv"
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)
            print(f"📁 Ordner '{self.output_dir}' erstellt.")
    
    def download_page(self, url):
        """Lädt eine Webseite herunter und gibt den Inhalt und Status-Code zurück."""
        try:
            print(f"🌐 Lade Seite: {url}")
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            response.encoding = 'utf-8'
            return response.text, response.status_code
        except requests.RequestException as e:
            print(f"❌ Fehler beim Laden der Seite: {e}")
            return None, None

    def find_work_sublinks(self, base_url):
        """Findet alle Unterlinks eines Werks (verschiedene Versionen, Bücher, etc.)."""
        print(f"🔍 Suche nach Unterlinks für: {base_url}")
        
        html, status_code = self.download_page(base_url)
        if not html:
            return []
        
        soup = BeautifulSoup(html, 'html.parser')
        sublinks = []
        
        # Verschiedene Selektoren für Links zu Werk-Teilen
        link_selectors = [
            'a[href*="/versions/"]',  # Versionslinks
            'a[href*="/divisions"]',  # Kapitel/Abschnitte
            'a[href*="bkv"]',        # BKV-spezifische Links
            '.work-links a',         # Werk-Links Container
            '.versions a',           # Versionen Container
            'ul li a',               # Listen mit Links
        ]
        
        for selector in link_selectors:
            links = soup.select(selector)
            for link in links:
                href = link.get('href', '')
                if href:
                    # Vollständige URL erstellen
                    if href.startswith('/'):
                        full_url = urljoin('https://bkv.unifr.ch', href)
                    elif href.startswith('http'):
                        full_url = href
                    else:
                        full_url = urljoin(base_url, href)
                    
                    # Nur deutsche Inhalte und relevante Links
                    link_text = link.get_text(strip=True).lower()
                    if any(keyword in link_text for keyword in ['deutsch', 'bkv', 'übersetzung']) or '/divisions' in href:
                        if full_url not in sublinks:
                            sublinks.append(full_url)
                            print(f"   📎 Gefunden: {full_url}")
        
        # Fallback: Wenn keine Unterlinks gefunden, ursprüngliche URL verwenden
        if not sublinks:
            sublinks = [base_url]
            print(f"   ℹ️  Keine Unterlinks gefunden, verwende Original-URL")
        
        print(f"📋 {len(sublinks)} Link(s) gefunden")
        return sublinks

    def download_all_pages(self, base_url):
        """Lädt alle Folgeseiten (z.B. /2, /3, ...) herunter und gibt die HTML-Inhalte als Liste zurück."""
        html_pages = []
        page_num = 1
        
        # Basis-URL bestimmen (ohne Seitenzahl)
        if base_url.endswith('/2') or base_url.endswith('/3') or base_url.endswith('/4') or base_url.endswith('/5') or base_url.endswith('/6') or base_url.endswith('/7') or base_url.endswith('/8') or base_url.endswith('/9'):
            # URL endet bereits mit einer Seitenzahl, diese entfernen
            base_url_clean = '/'.join(base_url.split('/')[:-1])
            # Aktuelle Seitenzahl bestimmen
            current_page = int(base_url.split('/')[-1])
            page_num = current_page
        else:
            # URL endet nicht mit Seitenzahl
            base_url_clean = base_url.rstrip('/')
        
        print(f"🔍 Basis-URL: {base_url_clean}")
        print(f"🔍 Starte bei Seite: {page_num}")
        
        while True:
            if page_num == 1:
                url = base_url_clean
            else:
                url = f"{base_url_clean}/{page_num}"
                
            html, status_code = self.download_page(url)
            if not html:
                if page_num == 1:
                    print("❌ Konnte die Startseite nicht laden.")
                    return []
                else:
                    print(f"ℹ️  Keine weitere Seite gefunden: {url}")
                    break
                    
            # Prüfen auf spezifische Fehlermeldung "The page you requested was not found."
            soup = BeautifulSoup(html, 'html.parser')
            text_content = soup.get_text()
            
            # Stoppen nur bei der spezifischen Fehlermeldung
            if "The page you requested was not found." in text_content:
                if page_num == 1:
                    print("❌ Startseite zeigt 'Page not found' Fehler.")
                    return []
                else:
                    print(f"ℹ️  Keine weitere Seite gefunden: {url} (Page not found)")
                    break
                    
            html_pages.append(html)
            print(f"✅ Seite {page_num} geladen.")
            page_num += 1
                
        return html_pages
    
    def clean_text(self, text):
        """Bereinigt Text von HTML-Tags und unnötigen Zeichen."""
        if not text:
            return ""
        
        # HTML-Tags entfernen
        text = re.sub(r'<[^>]+>', '', text)
        
        # Spezielle Zeichen und Artefakte entfernen
        text = re.sub(r'↩', '', text)  # Rückgabe-Symbol
        text = re.sub(r'[^\w\s\.,;:!?()\[\]"\'„"‚''–—-]', ' ', text)  # Nur erlaubte Zeichen
        
        # Mehrfache Leerzeichen durch einzelne ersetzen
        text = re.sub(r'\s+', ' ', text)
        
        # Seitenzahlen und Referenzen entfernen
        text = re.sub(r'\bS\.\s*\d+', '', text)  # S. 109
        text = re.sub(r'S\.\s*\d+', '', text)  # S. 109 (auch ohne Wortgrenze)
        text = re.sub(r'\b\d+\.\s*\d+\b', '', text)  # Kapitel.Vers Nummern
        
        # Bibliographische Referenzen entfernen
        text = re.sub(r'\b[IVX]+,\s*c\.\s*\d+\.?', '', text)  # I, c. 6.
        text = re.sub(r'\blib\.\s*[IVX]+', '', text)  # lib. I
        text = re.sub(r'\bHist\.\s*[A-Z][a-z]*\.?', '', text)  # Hist. Concil.
        text = re.sub(r'\b\d+\.\s*Februar\s*\([^)]*\)', '', text)  # Datumsangaben mit Klammern
        
        # Führende und nachfolgende Leerzeichen entfernen
        text = text.strip()
        
        # Unicode normalisieren
        text = unicodedata.normalize('NFKC', text)
        
        return text
    
    def extract_sections(self, soup, work_title):
        """Extrahiert Textabschnitte aus der HTML-Struktur mit intelligenter Filterung."""
        sections = []
        seen_texts = set()  # Duplikate vermeiden
        
        # Störende Elemente entfernen BEVOR wir extrahieren
        unwanted_selectors = [
            'nav', 'header', 'footer', 'aside', '.navigation', '.menu',
            '.download', '.copyright', '.impressum', '.datenschutz',
            '.breadcrumb', '.toolbar', '.sidebar', '.metadata',
            '[class*="nav"]', '[class*="menu"]', '[class*="download"]',
            '[class*="footer"]', '[class*="header"]', '[id*="nav"]',
            '[id*="menu"]', '[id*="download"]', '.btn', 'button'
        ]
        
        for selector in unwanted_selectors:
            for element in soup.select(selector):
                element.decompose()
        
        # Hauptinhalt finden - verschiedene Strategien
        main_content = None
        
        # Strategie 1: Suche nach Hauptinhalt-Container
        for selector in ['.content', '.main-content', '.text-content', 'main', 'article', '[role="main"]']:
            main_content = soup.select_one(selector)
            if main_content:
                break
        
        # Strategie 2: Größter Text-Container
        if not main_content:
            content_divs = soup.find_all('div')
            if content_divs:
                main_content = max(content_divs, key=lambda x: len(x.get_text(strip=True)))
        
        # Fallback: gesamtes Body
        if not main_content:
            main_content = soup.find('body') or soup
        
        print(f"📍 Hauptinhalt gefunden: {main_content.name if hasattr(main_content, 'name') else 'unknown'}")
        
        # Nur Absätze und Überschriften aus dem Hauptinhalt
        elements = main_content.find_all(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
        
        current_title = ""
        current_section = 1
        
        for element in elements:
            raw_text = element.get_text(strip=True)
            
            # Frühe Filter für unwünschte Inhalte
            if self.is_unwanted_content(raw_text):
                continue
                
            text = self.clean_text(raw_text)
            
            if not text or len(text) < 15:  # Mindestlänge erhöht
                continue
            
            # Duplikate vermeiden
            text_hash = hash(text)
            if text_hash in seen_texts:
                continue
            seen_texts.add(text_hash)
            
            # Überschriften behandeln
            if element.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                current_title = text
                print(f"📋 Titel gefunden: {text[:50]}...")
                continue
            
            # Text in sinnvolle Absätze aufteilen
            paragraphs = self.split_into_paragraphs(text)
            
            for paragraph in paragraphs:
                if len(paragraph.split()) >= 10:  # Mindestens 10 Wörter
                    # Wenn kein spezifischer Titel gefunden wurde, work_title verwenden
                    display_title = current_title if current_title else work_title
                    
                    sections.append({
                        'title': display_title,
                        'section': str(current_section),
                        'text': paragraph,
                        'word_count': len(paragraph.split())
                    })
                    current_section += 1
        
        print(f"📊 {len(sections)} saubere Abschnitte extrahiert")
        return sections
    
    def is_unwanted_content(self, text):
        """Prüft ob Text unerwünschte Inhalte enthält."""
        unwanted_patterns = [
            r'start\s+werke\s+einführung',
            r'download\s+(docx|epub|pdf|rtf)',
            r'bibliographische\s+angabe',
            r'©\s*\d{4}',
            r'impressum',
            r'datenschutz',
            r'copyrights?\s+kontakt',
            r'sponsoren\s*/\s*mitarbeiter',
            r'theologische\s+fakultät',
            r'miséricorde.*fribourg',
            r'gregor\s+emmenegger',
            r'text\s+anzeigen',
            r'scans\s+dieser\s+version',
            r'übersetzungen\s+dieses\s+werks',
            r'kommentare\s+zu\s+diesem\s+werk',
            r'drucken\s+fehler\s+melden',
            r'notes\s+and\s+elucidations',
            r'inhaltsangabe',
            r'epistle\s+vergleichen',
            r'bei\s+sokrates.*h\.\s*e\.',
            r'bei\s+gelasius.*hist\.',
            r'in\s+cassiodor.*historia',
            r'bei\s+nicephorus.*h\.\s*e\.',
            r'ihm\s+folgte\s+athanasius',
            r'sehr\s+fehlerhaft.*bei',
            r'\d+\s+zu\s+nicäa.*concilium',
            r'nach\s+andern.*april'
        ]
        
        text_lower = text.lower()
        return any(re.search(pattern, text_lower) for pattern in unwanted_patterns)
    
    def split_into_paragraphs(self, text):
        """Teilt langen Text in sinnvolle Absätze auf."""
        # Bei Satzende-Zeichen aufteilen, aber nur wenn genug Länge
        sentences = re.split(r'(?<=[.!?])\s+(?=[A-ZÄÖÜ])', text)
        
        paragraphs = []
        current_paragraph = ""
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
                
            # Wenn der aktuelle Absatz zu lang wird, neuen beginnen
            if len(current_paragraph.split()) > 40 and len(sentence.split()) > 5:
                if current_paragraph:
                    paragraphs.append(current_paragraph.strip())
                current_paragraph = sentence
            else:
                if current_paragraph:
                    current_paragraph += " " + sentence
                else:
                    current_paragraph = sentence
        
        # Letzten Absatz hinzufügen
        if current_paragraph:
            paragraphs.append(current_paragraph.strip())
        
        return paragraphs
    
    def save_to_csv(self, sections, author, work_title, output_filename):
        """Speichert die Abschnitte in einer CSV-Datei."""
        output_path = os.path.join(self.output_dir, output_filename)
        
        try:
            with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
                fieldnames = ['id', 'author', 'work_title', 'title', 'section', 'text', 'word_count', 'language']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                
                writer.writeheader()
                
                for i, section in enumerate(sections, 1):
                    writer.writerow({
                        'id': i,
                        'author': author,
                        'work_title': work_title,
                        'title': section['title'],
                        'section': section['section'],
                        'text': section['text'],
                        'word_count': section['word_count'],
                        'language': 'deutsch'
                    })
            
            print(f"💾 CSV-Datei gespeichert: {output_path}")
            print(f"📊 {len(sections)} Abschnitte verarbeitet")
            return True
            
        except Exception as e:
            print(f"❌ Fehler beim Speichern der CSV: {e}")
            return False
    
    def convert_work(self, url, author, work_title):
        """Konvertiert ein einzelnes Werk, lädt alle Folgeseiten automatisch."""
        print(f"\n🔄 Starte Konvertierung:")
        print(f"   Autor: {author}")
        print(f"   Werk: {work_title}")
        print(f"   URL: {url}")
        print("-" * 50)

        # Zuerst alle Unterlinks des Werks finden
        sublinks = self.find_work_sublinks(url)
        
        all_sections = []
        
        # Jeden Unterlink verarbeiten
        for i, sublink in enumerate(sublinks, 1):
            print(f"\n📖 Verarbeite Unterlink {i}/{len(sublinks)}: {sublink}")
            
            # Alle Seiten dieses Unterlinks herunterladen
            html_pages = self.download_all_pages(sublink)
            if not html_pages:
                print(f"⚠️  Keine Seiten für Unterlink {i} gefunden!")
                continue

            # Jede Seite des Unterlinks verarbeiten
            for idx, html_content in enumerate(html_pages, 1):
                print(f"➡️  Verarbeite Seite {idx} von Unterlink {i} ...")
                soup = BeautifulSoup(html_content, 'html.parser')
                sections = self.extract_sections(soup, work_title)
                all_sections.extend(sections)

        if not all_sections:
            print("❌ Keine Textabschnitte gefunden!")
            return False

        # CSV-Dateiname generieren
        author_clean = re.sub(r'[^\w\s-]', '', author).strip().replace(' ', '_').lower()
        work_clean = re.sub(r'[^\w\s-]', '', work_title).strip().replace(' ', '_').lower()
        csv_filename = f"{author_clean}_{work_clean}.csv"

        # CSV speichern
        success = self.save_to_csv(all_sections, author, work_title, csv_filename)

        if success:
            print(f"✅ Konvertierung erfolgreich abgeschlossen!")
            print(f"📁 Datei: {os.path.join(self.output_dir, csv_filename)}")

        return success

    def process_all_works_from_csv(self, csv_file="bkv_links.csv"):
        """Verarbeitet alle Werke aus der CSV-Datei automatisch."""
        print(f"\n🚀 BATCH-VERARBEITUNG ALLER WERKE")
        print("=" * 50)
        
        # CSV-Datei lesen
        try:
            with open(csv_file, 'r', encoding='utf-8') as file:
                reader = csv.DictReader(file)
                urls = [row['URL'] for row in reader if row['URL']]
        except FileNotFoundError:
            print(f"❌ CSV-Datei nicht gefunden: {csv_file}")
            return
        
        print(f"📋 {len(urls)} Werke zu verarbeiten")
        
        # Ausgabeordner für Auto-Verarbeitung
        auto_output_dir = "kirchenväter-auto"
        if not os.path.exists(auto_output_dir):
            os.makedirs(auto_output_dir)
        
        # Temporär Ausgabeordner ändern
        original_output_dir = self.output_dir
        self.output_dir = auto_output_dir
        
        successful = 0
        failed = 0
        
        for i, url in enumerate(urls, 1):
            print(f"\n🔄 Verarbeite Werk {i}/{len(urls)}")
            print(f"   URL: {url}")
            
            try:
                # Ersten Unterlink analysieren um Autor/Titel zu extrahieren
                sublinks = self.find_work_sublinks(url)
                if sublinks:
                    first_html, _ = self.download_page(sublinks[0])
                    if first_html:
                        soup = BeautifulSoup(first_html, 'html.parser')
                        
                        # Autor extrahieren
                        author = "Unbekannter Autor"
                        title_elem = soup.find('h1')
                        if title_elem:
                            author = title_elem.get_text(strip=True)
                        
                        # Werktitel extrahieren
                        work_title = "Unbekanntes Werk"
                        subtitle_elem = soup.find('h2')
                        if subtitle_elem:
                            work_title = subtitle_elem.get_text(strip=True)
                        elif url:
                            # Fallback: aus URL extrahieren
                            work_title = url.split('/')[-1].replace('-', ' ').title()
                        
                        print(f"   📚 Erkannt: {author} - {work_title}")
                        
                        # Werk konvertieren
                        success = self.convert_work(url, author, work_title)
                        
                        if success:
                            successful += 1
                            print(f"   ✅ Erfolgreich ({i}/{len(urls)})")
                        else:
                            failed += 1
                            print(f"   ❌ Fehlgeschlagen ({i}/{len(urls)})")
                    else:
                        failed += 1
                        print(f"   ❌ Konnte erste Seite nicht laden")
                else:
                    failed += 1
                    print(f"   ❌ Keine Unterlinks gefunden")
                    
            except Exception as e:
                failed += 1
                print(f"   ❌ Fehler: {e}")
            
            # Kurze Pause zwischen Werken
            time.sleep(2)
            
            # Zwischenbericht alle 10 Werke
            if i % 10 == 0:
                print(f"\n📊 Zwischenbericht: {successful} erfolgreich, {failed} fehlgeschlagen")
        
        # Ausgabeordner zurücksetzen
        self.output_dir = original_output_dir
        
        # Abschlussbericht
        print(f"\n🎉 BATCH-VERARBEITUNG ABGESCHLOSSEN!")
        print("=" * 50)
        print(f"📊 Statistiken:")
        print(f"   - Verarbeitete Werke: {len(urls)}")
        print(f"   - Erfolgreich: {successful}")
        print(f"   - Fehlgeschlagen: {failed}")
        print(f"   - Erfolgsrate: {(successful/len(urls)*100):.1f}%")
        print(f"📁 CSV-Dateien befinden sich im Ordner: {auto_output_dir}/")


def main():
    """Hauptfunktion mit Auswahlmöglichkeit."""
    print("=" * 60)
    print("   KIRCHENVÄTER-KONVERTER FÜR SUPABASE")
    print("=" * 60)
    print("Konvertiert Werke von https://bkv.unifr.ch/de/works zu CSV")
    print()
    
    # Konverter initialisieren
    converter = KirchenvaeterConverter()
    
    # Auswahlmenu
    print("Wählen Sie eine Option:")
    print("1️⃣  Einzelnes Werk interaktiv konvertieren")
    print("2️⃣  ALLE Werke aus bkv_links.csv automatisch verarbeiten")
    print()
    
    while True:
        choice = input("Ihre Wahl (1 oder 2): ").strip()
        if choice in ['1', '2']:
            break
        print("   ⚠️  Bitte wählen Sie 1 oder 2")
    
    if choice == '1':
        # Interaktive Einzelverarbeitung
        print("\n📝 INTERAKTIVE EINZELVERARBEITUNG")
        print("-" * 40)
        
        # Interaktive Eingaben
        print("Bitte geben Sie die folgenden Informationen ein:")
        print()
        
        # Autor eingeben
        while True:
            author = input("🧙 Kirchenvater (Autor): ").strip()
            if author:
                break
            print("   ⚠️  Bitte geben Sie einen Autor ein.")
        
        # Werk eingeben
        while True:
            work_title = input("📚 Werk-Titel: ").strip()
            if work_title:
                break
            print("   ⚠️  Bitte geben Sie einen Werk-Titel ein.")
        
        # Link eingeben
        while True:
            link = input("🔗 Link zum Werk: ").strip()
            if link and link.startswith('http'):
                break
            print("   ⚠️  Bitte geben Sie eine gültige URL ein (muss mit http beginnen).")
        
        print()
        print("📋 ZUSAMMENFASSUNG:")
        print("-" * 30)
        print(f"   Autor: {author}")
        print(f"   Werk: {work_title}")
        print(f"   Link: {link}")
        print()
        
        # Bestätigung
        confirm = input("🚀 Konvertierung starten? (j/n): ").strip().lower()
        if confirm not in ['j', 'ja', 'y', 'yes']:
            print("❌ Konvertierung abgebrochen.")
            return
        
        # Konvertierung durchführen
        success = converter.convert_work(link, author, work_title)
        
        print()
        if success:
            print("🎉 ERFOLGREICH ABGESCHLOSSEN!")
            print(f"📂 CSV-Dateien befinden sich im Ordner: {converter.output_dir}/")
            print("💡 Sie können die CSV-Datei direkt in Supabase importieren.")
        else:
            print("💥 KONVERTIERUNG FEHLGESCHLAGEN!")
            print("🔍 Überprüfen Sie den Link und versuchen Sie es erneut.")
    
    elif choice == '2':
        # Batch-Verarbeitung aller Werke
        print("\n🚀 AUTOMATISCHE BATCH-VERARBEITUNG")
        print("-" * 40)
        print("⚠️  ACHTUNG: Dies wird ALLE ~1000 Werke aus bkv_links.csv verarbeiten!")
        print("⏱️  Die Verarbeitung kann mehrere Stunden dauern.")
        print()
        
        confirm = input("🚀 Batch-Verarbeitung starten? (j/n): ").strip().lower()
        if confirm not in ['j', 'ja', 'y', 'yes']:
            print("❌ Batch-Verarbeitung abgebrochen.")
            return
        
        # Batch-Verarbeitung starten
        converter.process_all_works_from_csv()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Programm durch Benutzer abgebrochen.")
    except Exception as e:
        print(f"\n💥 Unerwarteter Fehler: {e}")