import requests
import pandas as pd
import re
import time
from pathlib import Path
from bs4 import BeautifulSoup
import os

def find_author_works_directly():
    """Sucht direkt nach Werken bestimmter Autoren"""
    print("🔍 SUCHE DIREKT NACH AUTOR-WERKEN")
    print("=" * 50)
    
    # Gezielte Suche nach Autoren
    target_authors = [
        "Ambrosius von Mailand",
        "Clemens von Alexandrien", 
        "Gregor von Nyssa",
        "Gregor der Grosse",
        "Irenäus von Lyon",
        "Johannes Cassianus",
        "Laktanz",
        "Leo der Grosse",
        "Polykarp von Smyrna",
        "Athenagoras von Athen",
        "Cyrill von Jerusalem",
        "Minucius Felix"
    ]
    
    author_works = {}
    
    for author in target_authors:
        print(f"\n🔍 Suche nach: {author}")
        
        # Suche auf der BKV-Website
        search_url = f"https://bkv.unifr.ch/search?q={author.replace(' ', '%20')}"
        
        try:
            response = requests.get(search_url)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            works = []
            # Finde alle Links zu Werken
            for link in soup.find_all('a', href=True):
                href = link['href']
                if '/works/' in href and '/versions/' in href:
                    title = link.get_text().strip()
                    if len(title) > 5:
                        full_url = href if href.startswith('http') else "https://bkv.unifr.ch" + href
                        works.append({
                            'title': title,
                            'url': full_url
                        })
            
            if works:
                author_works[author] = works
                print(f"   ✅ {len(works)} Werke gefunden")
                for work in works[:3]:  # Zeige erste 3
                    print(f"      📄 {work['title']}")
            else:
                print(f"   ❌ Keine Werke gefunden")
                
        except Exception as e:
            print(f"   ❌ Fehler bei {author}: {e}")
        
        time.sleep(1)  # Rate limiting
    
    return author_works

def extract_text_from_work_version(work_url):
    """Extrahiert Text direkt von einer Werk-Version"""
    print(f"     📄 Extrahiere Text von: {work_url}")
    
    try:
        time.sleep(1)
        response = requests.get(work_url)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Entferne Navigation, Header, Footer
        for unwanted in soup.find_all(['nav', 'header', 'footer', 'aside', 'script', 'style']):
            unwanted.decompose()
        
        # Suche nach dem Haupttext-Container
        main_text = ""
        
        # Verschiedene Selektoren für den Haupttext
        text_selectors = [
            '.text-content',
            '.work-text',
            '.content',
            'main',
            '.main-content',
            '#content'
        ]
        
        for selector in text_selectors:
            element = soup.select_one(selector)
            if element:
                main_text = element.get_text()
                break
        
        # Fallback: Suche nach dem längsten Textblock
        if not main_text:
            paragraphs = soup.find_all('p')
            if paragraphs:
                main_text = '\n'.join([p.get_text() for p in paragraphs])
        
        # Letzter Fallback: Ganzer Body
        if not main_text:
            body = soup.find('body')
            if body:
                main_text = body.get_text()
        
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
        r'.*patristik.*',
        r'.*bibliothek der kirchenväter.*',
        r'.*text anzeigen.*',
        r'.*editionen.*',
        r'.*übersetzungen.*',
        r'.*kommentare.*'
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
        
        if not skip_line and len(line) > 15:
            cleaned_lines.append(line)
    
    # Füge zusammen und bereinige
    cleaned_text = '\n'.join(cleaned_lines)
    
    # Entferne übermäßige Leerzeichen
    cleaned_text = re.sub(r'\s+', ' ', cleaned_text)
    cleaned_text = re.sub(r'\n\s*\n', '\n', cleaned_text)
    
    return cleaned_text.strip()

def create_supabase_entries(text, author_name, work_title):
    """Erstellt Supabase-Einträge aus Text"""
    if not text or len(text) < 300:
        return []
    
    # Teile Text in sinnvolle Abschnitte
    sentences = re.split(r'[.!?]+', text)
    
    entries = []
    current_section = ""
    section_num = 1
    
    for sentence in sentences:
        sentence = sentence.strip()
        
        if len(sentence) < 20:
            continue
        
        # Sammle Text für aktuellen Abschnitt
        if current_section:
            current_section += ". " + sentence
        else:
            current_section = sentence
        
        # Wenn Abschnitt groß genug ist, speichere ihn
        word_count = len(current_section.split())
        if word_count >= 150:
            
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
    if current_section and len(current_section.split()) >= 30:
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
    print("🚀 BKV KIRCHENVÄTER DIREKTER SCRAPER")
    print("=" * 60)
    
    # Suche nach Autor-Werken
    author_works = find_author_works_directly()
    
    if not author_works:
        print("❌ Keine Autor-Werke gefunden!")
        return
    
    successful_authors = 0
    total_entries = 0
    
    # Verarbeite jeden Autor
    for author, works in author_works.items():
        try:
            print(f"\n{'='*60}")
            print(f"🔍 VERARBEITE: {author}")
            print(f"{'='*60}")
            
            # Verarbeite maximal 2 Werke pro Autor
            author_entries = []
            
            for work in works[:2]:
                print(f"   📖 Verarbeite: {work['title']}")
                
                text = extract_text_from_work_version(work['url'])
                
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
