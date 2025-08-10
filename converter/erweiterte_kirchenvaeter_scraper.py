import requests
import pandas as pd
import re
import time
import zipfile
try:
    from docx import Document  # python-docx
except ImportError:
    print("⚠️ python-docx nicht installiert - DOCX-Unterstützung deaktiviert")
    Document = None
try:
    import fitz  # PyMuPDF
except ImportError:
    print("⚠️ PyMuPDF nicht installiert - PDF-Unterstützung deaktiviert")
    fitz = None
from pathlib import Path
from bs4 import BeautifulSoup
try:
    from ebooklib import epub
    import ebooklib
except ImportError:
    print("⚠️ ebooklib nicht installiert - EPUB-Unterstützung deaktiviert")
    epub = None
    ebooklib = None

# Neue Kirchenväter die noch nicht in den CSVs sind (bereits vorhandene entfernt)
NEW_KIRCHENVAETER = [
    "Ambrosius von Mailand",
    "Clemens von Alexandrien", 
    "Gregor von Nyssa",
    "Gregor der Grosse",
    "Irenäus von Lyon",
    "Johannes Cassianus",
    "Laktanz",
    "Leo der Grosse",
    "Methodius von Olympus",
    "Minucius Felix",
    "Novatian",
    "Polykarp von Smyrna",
    "Sulpicius Severus",
    "Synesios von Kyrene",
    "Tatian",
    "Theophilus von Antiochien",
    "Vinzenz von Lérins",
    "Athenagoras von Athen",
    "Aristides von Athen",
    "Cyrill von Jerusalem",
    "Epiphanius von Salamis",
    "Johannes von Damaskus",
    "Nemesios von Emesa",
    "Dionysius von Alexandria"
]

def get_author_works(author_name):
    """Holt alle Werke eines Autors von der BKV-Website"""
    print(f"\n📖 Suche Werke für: {author_name}")
    
    # Suche nach dem Autor
    search_url = "https://bkv.unifr.ch/de/works"
    
    try:
        response = requests.get(search_url)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Finde den Autor in der Liste
        author_links = []
        for link in soup.find_all('a', href=True):
            if author_name.lower() in link.get_text().lower():
                author_url = "https://bkv.unifr.ch" + link['href']
                author_links.append(author_url)
                print(f"   🔗 Gefunden: {author_url}")
        
        if not author_links:
            print(f"   ❌ Keine Werke für {author_name} gefunden")
            return []
        
        # Hole Werke des Autors
        works = []
        for author_url in author_links:
            try:
                time.sleep(1)  # Rate limiting
                work_response = requests.get(author_url)
                work_response.raise_for_status()
                
                work_soup = BeautifulSoup(work_response.content, 'html.parser')
                
                # Finde deutsche Werke
                for work_link in work_soup.find_all('a', href=True):
                    work_text = work_link.get_text().strip()
                    if 'deutsch' in work_text.lower() and 'übersetzung' in work_text.lower():
                        work_url = "https://bkv.unifr.ch" + work_link['href']
                        works.append({
                            'title': clean_work_title(work_text),
                            'url': work_url
                        })
                        print(f"   📄 Deutsches Werk: {work_text}")
                        
            except Exception as e:
                print(f"   ❌ Fehler beim Laden von {author_url}: {e}")
                continue
        
        return works
        
    except Exception as e:
        print(f"   ❌ Fehler bei der Suche: {e}")
        return []

def clean_work_title(title):
    """Bereinigt Werktitel"""
    title = re.sub(r'Übersetzung \([^)]+\):\s*', '', title)
    title = re.sub(r'Kommentar \([^)]+\):\s*', '', title)
    title = re.sub(r'\s*\([^)]*\)\s*$', '', title)
    title = re.sub(r'\s+', ' ', title)
    return title.strip()

def download_and_extract_text(work_url):
    """Lädt ein Werk herunter und extrahiert den Text"""
    try:
        response = requests.get(work_url)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Suche nach Download-Links
        download_links = []
        for link in soup.find_all('a', href=True):
            href = link['href'].lower()
            if any(ext in href for ext in ['.epub', '.docx', '.pdf', '.txt']):
                download_url = "https://bkv.unifr.ch" + link['href'] if link['href'].startswith('/') else link['href']
                download_links.append((download_url, href.split('.')[-1]))
        
        # Bevorzuge EPUB > DOCX > PDF > TXT
        preferred_order = ['epub', 'docx', 'pdf', 'txt']
        download_links.sort(key=lambda x: preferred_order.index(x[1]) if x[1] in preferred_order else 999)
        
        if not download_links:
            # Fallback: Extrahiere HTML-Text
            return extract_html_text(soup)
        
        # Lade bevorzugtes Format herunter
        download_url, file_type = download_links[0]
        print(f"     📥 Lade {file_type.upper()} herunter: {download_url}")
        
        file_response = requests.get(download_url)
        file_response.raise_for_status()
        
        # Extrahiere Text je nach Format
        if file_type == 'epub':
            return extract_epub_text(file_response.content)
        elif file_type == 'docx':
            return extract_docx_text(file_response.content)
        elif file_type == 'pdf':
            return extract_pdf_text(file_response.content)
        elif file_type == 'txt':
            return file_response.text
        else:
            return extract_html_text(soup)
            
    except Exception as e:
        print(f"     ❌ Fehler beim Download: {e}")
        return ""

def extract_epub_text(epub_content):
    """Extrahiert Text aus EPUB"""
    if not epub or not ebooklib:
        return ""
    
    try:
        # Speichere temporär
        temp_file = "temp.epub"
        with open(temp_file, 'wb') as f:
            f.write(epub_content)
        
        book = epub.read_epub(temp_file)
        text_content = []
        
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_DOCUMENT:
                soup = BeautifulSoup(item.get_content(), 'html.parser')
                text_content.append(soup.get_text())
        
        Path(temp_file).unlink()  # Lösche temp Datei
        return '\n'.join(text_content)
        
    except Exception as e:
        print(f"     ❌ EPUB-Fehler: {e}")
        return ""

def extract_docx_text(docx_content):
    """Extrahiert Text aus DOCX"""
    if not Document:
        return ""
    
    try:
        # Speichere temporär
        temp_file = "temp.docx"
        with open(temp_file, 'wb') as f:
            f.write(docx_content)
        
        doc = Document(temp_file)
        text_content = []
        
        for paragraph in doc.paragraphs:
            text_content.append(paragraph.text)
        
        Path(temp_file).unlink()  # Lösche temp Datei
        return '\n'.join(text_content)
        
    except Exception as e:
        print(f"     ❌ DOCX-Fehler: {e}")
        return ""

def extract_pdf_text(pdf_content):
    """Extrahiert Text aus PDF"""
    if not fitz:
        return ""
    
    try:
        # Speichere temporär
        temp_file = "temp.pdf"
        with open(temp_file, 'wb') as f:
            f.write(pdf_content)
        
        doc = fitz.open(temp_file)
        text_content = []
        
        for page in doc:
            text_content.append(page.get_text())
        
        doc.close()
        Path(temp_file).unlink()  # Lösche temp Datei
        return '\n'.join(text_content)
        
    except Exception as e:
        print(f"     ❌ PDF-Fehler: {e}")
        return ""

def extract_html_text(soup):
    """Extrahiert Text aus HTML"""
    try:
        # Entferne Script und Style Tags
        for script in soup(["script", "style"]):
            script.decompose()
        
        text = soup.get_text()
        
        # Bereinige Text
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = '\n'.join(chunk for chunk in chunks if chunk)
        
        return text
        
    except Exception as e:
        print(f"     ❌ HTML-Fehler: {e}")
        return ""

def process_text_for_supabase(text, author_name, work_title):
    """Verarbeitet Text für Supabase-Format"""
    if not text or len(text.strip()) < 100:
        return []
    
    # Bereinige Text
    text = clean_text(text)
    
    # Teile in Absätze
    paragraphs = split_into_paragraphs(text)
    
    # Erstelle Supabase-Einträge
    entries = []
    for i, paragraph in enumerate(paragraphs, 1):
        if len(paragraph.strip()) > 50:
            entry_id = create_unique_id(author_name, work_title, i)
            entries.append({
                'id': entry_id,
                'author': author_name,
                'work_title': work_title,
                'section': i,
                'text': paragraph.strip(),
                'word_count': len(paragraph.split()),
                'language': 'de'
            })
    
    return entries

def clean_text(text):
    """Bereinigt Text von Metadaten und Artefakten"""
    if not text:
        return ""
    
    # Entferne Seitenzahlen
    text = re.sub(r'S\.\s*\d+', '', text)
    text = re.sub(r'^\s*\d+\s*$', '', text, flags=re.MULTILINE)
    
    # Entferne Fußnoten
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'\(\d+\)', '', text)
    
    # Entferne Metadaten
    patterns = [
        r'^.*Titel Werk:.*$',
        r'^.*Autor:.*$',
        r'^.*Identifier:.*$',
        r'^.*BKV.*$',
        r'^.*SWKV.*$'
    ]
    
    for pattern in patterns:
        text = re.sub(pattern, '', text, flags=re.MULTILINE | re.IGNORECASE)
    
    # Normalisiere Leerzeichen
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'\n\s*\n', '\n', text)
    
    return text.strip()

def split_into_paragraphs(text):
    """Teilt Text in sinnvolle Absätze"""
    if not text:
        return []
    
    # Teile an doppelten Zeilenwechseln
    paragraphs = text.split('\n\n')
    
    good_paragraphs = []
    for para in paragraphs:
        para = para.strip()
        word_count = len(para.split())
        
        if 20 <= word_count <= 500:
            good_paragraphs.append(para)
        elif word_count > 500:
            # Teile lange Absätze
            sentences = re.split(r'[.!?]+', para)
            current_chunk = []
            current_words = 0
            
            for sentence in sentences:
                sentence = sentence.strip()
                if not sentence:
                    continue
                
                sentence_words = len(sentence.split())
                
                if current_words + sentence_words > 400:
                    if current_chunk:
                        chunk_text = '. '.join(current_chunk) + '.'
                        if len(chunk_text.split()) >= 20:
                            good_paragraphs.append(chunk_text)
                    current_chunk = [sentence]
                    current_words = sentence_words
                else:
                    current_chunk.append(sentence)
                    current_words += sentence_words
            
            if current_chunk:
                chunk_text = '. '.join(current_chunk) + '.'
                if len(chunk_text.split()) >= 20:
                    good_paragraphs.append(chunk_text)
    
    return good_paragraphs

def create_unique_id(author, work_title, section):
    """Erstellt eindeutige ID"""
    author_clean = re.sub(r'[^a-zA-Z0-9]', '_', author)
    work_clean = re.sub(r'[^a-zA-Z0-9]', '_', work_title)
    
    if len(work_clean) > 30:
        work_clean = work_clean[:30]
    
    return f"{author_clean}_{work_clean}_{section}"

def scrape_new_kirchenvaeter():
    """Hauptfunktion zum Scrapen neuer Kirchenväter"""
    print("🚀 ERWEITERTE KIRCHENVÄTER-SAMMLUNG")
    print("=" * 50)
    
    print(f"📋 Neue Kirchenväter zu scrapen: {len(NEW_KIRCHENVAETER)}")
    for i, author in enumerate(NEW_KIRCHENVAETER, 1):
        print(f"   {i}. {author}")
    
    all_entries = []
    successful_authors = 0
    
    for author in NEW_KIRCHENVAETER:
        print(f"\n🔍 Verarbeite: {author}")
        
        try:
            # Hole Werke des Autors
            works = get_author_works(author)
            
            if not works:
                print(f"   ❌ Keine deutschen Werke für {author} gefunden")
                continue
            
            author_entries = []
            
            for work in works:
                print(f"   📖 Verarbeite Werk: {work['title']}")
                
                # Lade und extrahiere Text
                text = download_and_extract_text(work['url'])
                
                if text:
                    # Verarbeite für Supabase
                    entries = process_text_for_supabase(text, author, work['title'])
                    author_entries.extend(entries)
                    print(f"     ✅ {len(entries)} Einträge erstellt")
                else:
                    print(f"     ❌ Kein Text extrahiert")
                
                time.sleep(2)  # Rate limiting
            
            if author_entries:
                # Speichere CSV für diesen Autor
                save_author_csv(author, author_entries)
                all_entries.extend(author_entries)
                successful_authors += 1
                print(f"   🎉 {author}: {len(author_entries)} Einträge gespeichert")
            else:
                print(f"   ❌ {author}: Keine verwertbaren Texte gefunden")
                
        except Exception as e:
            print(f"   ❌ Fehler bei {author}: {e}")
            continue
    
    # Finale Statistiken
    print(f"\n" + "=" * 50)
    print("🎉 ERWEITERUNG ABGESCHLOSSEN!")
    print("=" * 50)
    print(f"📊 Erfolgreiche Autoren: {successful_authors}/{len(NEW_KIRCHENVAETER)}")
    print(f"📊 Neue Einträge: {len(all_entries)}")
    
    if all_entries:
        print(f"\n📁 Neue CSV-Dateien erstellt:")
        for author in NEW_KIRCHENVAETER:
            csv_file = f"supabase_{author.replace(' ', '_')}.csv"
            if Path(csv_file).exists():
                print(f"   ✅ {csv_file}")

def save_author_csv(author_name, entries):
    """Speichert CSV für einen Autor"""
    if not entries:
        return
    
    filename = f"supabase_{author_name.replace(' ', '_')}.csv"
    df = pd.DataFrame(entries)
    df.to_csv(filename, index=False, encoding='utf-8')
    print(f"     💾 Gespeichert: {filename}")

if __name__ == "__main__":
    scrape_new_kirchenvaeter()
