import requests
import pandas as pd
import re
import time
from pathlib import Path
from bs4 import BeautifulSoup
import os

def get_specific_author_links():
    """Definiert spezifische Autor-Links für die noch fehlenden Kirchenväter"""
    print("🔍 DEFINIERE SPEZIFISCHE AUTOR-LINKS")
    print("=" * 50)
    
    # Nur die wichtigsten Kirchenväter, die noch fehlen
    author_links = {
        "Ambrosius von Mailand": "https://bkv.unifr.ch/de/works/102",
        "Clemens von Alexandrien": "https://bkv.unifr.ch/de/works/17",
        "Gregor von Nyssa": "https://bkv.unifr.ch/de/works/109",
        "Gregor der Grosse": "https://bkv.unifr.ch/de/works/89",
        "Irenäus von Lyon": "https://bkv.unifr.ch/de/works/15",
        "Johannes Cassianus": "https://bkv.unifr.ch/de/works/80",
        "Laktanz": "https://bkv.unifr.ch/de/works/18",
        "Leo der Grosse": "https://bkv.unifr.ch/de/works/86",
        "Polykarp von Smyrna": "https://bkv.unifr.ch/de/works/6",
        "Athenagoras von Athen": "https://bkv.unifr.ch/de/works/14",
        "Cyrill von Jerusalem": "https://bkv.unifr.ch/de/works/31",
        "Minucius Felix": "https://bkv.unifr.ch/de/works/16"
    }
    
    for author, url in author_links.items():
        print(f"   📝 {author}: {url}")
    
    print(f"\n✅ {len(author_links)} Autoren definiert")
    return author_links

def get_german_works_from_author(author_name, author_url):
    """Holt deutsche Werke eines Autors"""
    print(f"\n📖 Verarbeite: {author_name}")
    print(f"   🔗 URL: {author_url}")
    
    try:
        time.sleep(1)  # Rate limiting
        response = requests.get(author_url)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        works = []
        
        # Finde alle Werk-Links (verschiedene Strukturen ausprobieren)
        for link in soup.find_all('a', href=True):
            href = link['href']
            
            # Nur Links zu deutschen Werken
            if '/de/works/' in href and href != author_url:
                title = link.get_text().strip()
                
                # Überspringe sehr kurze oder leere Titel
                if len(title) < 3 or title.lower() in ['mehr', 'details', 'weiter']:
                    continue
                
                full_url = href if href.startswith('http') else "https://bkv.unifr.ch" + href
                works.append({
                    'title': title,
                    'url': full_url
                })
                print(f"      📄 {title}: {full_url}")
        
        # Wenn keine Werke gefunden, versuche andere Strukturen
        if not works:
            # Suche in Listen
            for li in soup.find_all('li'):
                if li.find('a'):
                    link = li.find('a')
                    href = link['href']
                    title = link.get_text().strip()
                    
                    if '/de/works/' in href and len(title) > 3:
                        full_url = href if href.startswith('http') else "https://bkv.unifr.ch" + href
                        works.append({
                            'title': title,
                            'url': full_url
                        })
                        print(f"      📄 {title}: {full_url}")
        
        print(f"   ✅ {len(works)} deutsche Werke gefunden")
        return works
        
    except Exception as e:
        print(f"   ❌ Fehler: {e}")
        return []

def extract_text_from_work_page(work_url):
    """Extrahiert Text von einer Werk-Seite"""
    print(f"     📄 Extrahiere Text von: {work_url}")
    
    try:
        time.sleep(1)  # Rate limiting
        response = requests.get(work_url)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Entferne Navigation, Header, Footer
        for unwanted in soup.find_all(['nav', 'header', 'footer', 'aside']):
            unwanted.decompose()
        
        # Entferne Skripte und Style-Elemente
        for script in soup.find_all(['script', 'style']):
            script.decompose()
        
        # Versuche verschiedene Container für den Haupttext
        main_text = None
        
        # Suche nach dem Hauptcontent
        for selector in ['main', '.content', '#content', '.text', '.work-content']:
            element = soup.select_one(selector)
            if element:
                main_text = element.get_text()
                break
        
        # Fallback: Ganzer Body-Text
        if not main_text:
            # Entferne bekannte Navigations-Elemente
            for unwanted in soup.find_all(class_=['nav', 'navbar', 'menu', 'sidebar']):
                unwanted.decompose()
            
            main_text = soup.get_text()
        
        return clean_extracted_text(main_text)
        
    except Exception as e:
        print(f"     ❌ Text-Extraktion fehlgeschlagen: {e}")
        return ""

def clean_extracted_text(text):
    """Bereinigt extrahierten Text"""
    if not text:
        return ""
    
    # Entferne Navigation und Metadaten
    lines_to_remove = [
        r'.*navigation.*',
        r'.*sprache.*',
        r'.*copyright.*',
        r'.*impressum.*',
        r'.*datenschutz.*',
        r'.*cookies.*',
        r'.*start.*werke.*suche.*',
        r'^de\s*en\s*fr$',
        r'.*unifr\.ch.*',
        r'.*resultate filtern.*',
        r'.*schlagwörter.*',
        r'.*gregor emmenegger.*',
        r'.*theologische fakultät.*',
        r'.*patristik.*'
    ]
    
    lines = text.split('\n')
    cleaned_lines = []
    
    for line in lines:
        line = line.strip()
        
        # Überspringe leere Zeilen
        if not line:
            continue
        
        # Überspringe Navigations-/Metadaten-Zeilen
        skip_line = False
        for pattern in lines_to_remove:
            if re.match(pattern, line, re.IGNORECASE):
                skip_line = True
                break
        
        if not skip_line and len(line) > 10:
            cleaned_lines.append(line)
    
    # Füge zusammen und bereinige
    cleaned_text = '\n'.join(cleaned_lines)
    
    # Entferne übermäßige Leerzeichen
    cleaned_text = re.sub(r'\s+', ' ', cleaned_text)
    cleaned_text = re.sub(r'\n\s*\n', '\n', cleaned_text)
    
    return cleaned_text.strip()

def create_supabase_entries(text, author_name, work_title):
    """Erstellt Supabase-Einträge aus Text"""
    if not text or len(text) < 200:
        return []
    
    # Teile Text in sinnvolle Abschnitte (ca. 200-400 Wörter)
    paragraphs = text.split('\n')
    
    entries = []
    current_section = ""
    section_num = 1
    
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        
        if len(paragraph) < 20:  # Überspringe sehr kurze Absätze
            continue
        
        # Sammle Text für aktuellen Abschnitt
        if current_section:
            current_section += " " + paragraph
        else:
            current_section = paragraph
        
        # Wenn Abschnitt groß genug ist, speichere ihn
        word_count = len(current_section.split())
        if word_count >= 200:
            
            # Erstelle Eintrag
            entry_id = create_unique_id(author_name, work_title, section_num)
            entries.append({
                'id': entry_id,
                'author': author_name,
                'work_title': work_title,
                'section': section_num,
                'text': current_section.strip(),
                'word_count': word_count,
                'language': 'de'
            })
            
            # Reset für nächsten Abschnitt
            current_section = ""
            section_num += 1
    
    # Letzten Abschnitt hinzufügen falls groß genug
    if current_section and len(current_section.split()) >= 50:
        entry_id = create_unique_id(author_name, work_title, section_num)
        entries.append({
            'id': entry_id,
            'author': author_name,
            'work_title': work_title,
            'section': section_num,
            'text': current_section.strip(),
            'word_count': len(current_section.split()),
            'language': 'de'
        })
    
    return entries

def create_unique_id(author, work_title, section):
    """Erstellt eindeutige ID"""
    author_clean = re.sub(r'[^a-zA-Z0-9]', '_', author)
    work_clean = re.sub(r'[^a-zA-Z0-9]', '_', work_title)
    
    if len(work_clean) > 30:
        work_clean = work_clean[:30]
    
    return f"{author_clean}_{work_clean}_{section}"

def save_author_csv(author_name, entries):
    """Speichert CSV für einen Autor"""
    if not entries:
        return False
    
    filename = f"supabase_{author_name.replace(' ', '_')}.csv"
    df = pd.DataFrame(entries)
    df.to_csv(filename, index=False, encoding='utf-8')
    print(f"   💾 Gespeichert: {filename} ({len(entries)} Einträge)")
    return True

def move_csvs_to_target_folder():
    """Verschiebt neue CSV-Dateien in den Zielordner"""
    target_folder = Path("LuxDei/lib/supabase_csvs")
    
    if not target_folder.exists():
        print(f"❌ Zielordner {target_folder} existiert nicht!")
        return
    
    # Finde alle supabase_*.csv Dateien im aktuellen Verzeichnis
    csv_files = list(Path(".").glob("supabase_*.csv"))
    
    if not csv_files:
        print("ℹ️ Keine neuen CSV-Dateien gefunden")
        return
    
    moved_count = 0
    for csv_file in csv_files:
        target_path = target_folder / csv_file.name
        
        if not target_path.exists():
            try:
                csv_file.rename(target_path)
                print(f"   📁 Verschoben: {csv_file.name} → {target_path}")
                moved_count += 1
            except Exception as e:
                print(f"   ❌ Fehler beim Verschieben von {csv_file.name}: {e}")
    
    print(f"\n📊 {moved_count} CSV-Dateien verschoben")

def main():
    """Hauptfunktion"""
    print("🚀 BKV KIRCHENVÄTER SPEZIFISCHER SCRAPER")
    print("=" * 60)
    
    # Hole spezifische Autor-Links
    author_links = get_specific_author_links()
    
    if not author_links:
        print("❌ Keine Autor-Links definiert!")
        return
    
    successful_authors = 0
    total_entries = 0
    
    # Verarbeite jeden Autor
    for author, author_url in author_links.items():
        try:
            print(f"\n{'='*60}")
            print(f"🔍 VERARBEITE: {author}")
            print(f"{'='*60}")
            
            # Hole deutsche Werke
            works = get_german_works_from_author(author, author_url)
            
            if not works:
                print(f"   ❌ Keine deutschen Werke gefunden")
                continue
            
            # Verarbeite maximal 3 Werke pro Autor
            author_entries = []
            
            for work in works[:3]:
                print(f"   📖 Verarbeite: {work['title']}")
                
                text = extract_text_from_work_page(work['url'])
                
                if text and len(text) > 500:
                    entries = create_supabase_entries(text, author, work['title'])
                    author_entries.extend(entries)
                    print(f"     ✅ {len(entries)} Abschnitte erstellt")
                else:
                    print(f"     ❌ Zu wenig Text ({len(text)} Zeichen)")
                
                time.sleep(2)  # Rate limiting
            
            # Speichere CSV für diesen Autor
            if author_entries:
                if save_author_csv(author, author_entries):
                    successful_authors += 1
                    total_entries += len(author_entries)
                    print(f"   🎉 {author}: {len(author_entries)} Einträge gespeichert")
            
        except Exception as e:
            print(f"   ❌ Fehler bei {author}: {e}")
            continue
    
    # Verschiebe CSV-Dateien in Zielordner
    move_csvs_to_target_folder()
    
    # Finale Statistiken
    print(f"\n" + "=" * 60)
    print("🎉 SCRAPING ABGESCHLOSSEN!")
    print("=" * 60)
    print(f"📊 Erfolgreiche Autoren: {successful_authors}")
    print(f"📊 Neue Einträge: {total_entries}")

if __name__ == "__main__":
    main()
