import requests
import pandas as pd
import re
import time
from pathlib import Path
from bs4 import BeautifulSoup

def get_all_author_links():
    """Holt alle Autor-Links von der BKV-Website"""
    print("🔍 SAMMLE ALLE AUTOR-LINKS")
    print("=" * 50)
    
    try:
        response = requests.get("https://bkv.unifr.ch/de/works")
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        author_links = {}
        
        # Suche nach allen Autor-Links - sie sind direkt in h5 als Links
        for h5 in soup.find_all('h5'):
            author_name = h5.get_text().strip()
            
            # Finde Link direkt in h5 oder im nächsten Element
            link = None
            if h5.find('a'):
                link = h5.find('a')['href']
            else:
                # Schaue in nachfolgenden Elementen
                next_sibling = h5.find_next_sibling()
                while next_sibling and not link:
                    if next_sibling.name == 'p' and next_sibling.find('a'):
                        link = next_sibling.find('a')['href']
                        break
                    next_sibling = next_sibling.find_next_sibling()
            
            if link:
                full_url = "https://bkv.unifr.ch" + link if link.startswith('/') else link
                author_links[author_name] = full_url
                print(f"   📝 {author_name}: {full_url}")
        
        print(f"\n✅ {len(author_links)} Autoren gefunden")
        return author_links
        
    except Exception as e:
        print(f"❌ Fehler: {e}")
        return {}

def get_german_works_from_author(author_name, author_url):
    """Holt deutsche Werke eines Autors"""
    print(f"\n📖 Verarbeite: {author_name}")
    print(f"   🔗 URL: {author_url}")
    
    try:
        time.sleep(1)  # Rate limiting
        response = requests.get(author_url)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        german_works = []
        
        # Suche nach Werk-Links
        for link in soup.find_all('a', href=True):
            link_text = link.get_text().strip()
            
            # Filtere deutsche Übersetzungen
            if any(keyword in link_text.lower() for keyword in ['deutsch', 'übersetzung', 'bkv']):
                work_url = "https://bkv.unifr.ch" + link['href'] if link['href'].startswith('/') else link['href']
                
                clean_title = clean_work_title(link_text)
                
                german_works.append({
                    'title': clean_title,
                    'url': work_url,
                    'original_text': link_text
                })
                print(f"   📄 Deutsches Werk: {clean_title}")
        
        return german_works
        
    except Exception as e:
        print(f"   ❌ Fehler: {e}")
        return []

def clean_work_title(title):
    """Bereinigt Werktitel"""
    # Entferne Übersetzungshinweise
    title = re.sub(r'Übersetzung \([^)]+\):\s*', '', title)
    title = re.sub(r'Kommentar \([^)]+\):\s*', '', title)
    title = re.sub(r'\(BKV[^)]*\)', '', title)
    title = re.sub(r'\s*\([^)]*\)\s*$', '', title)
    title = re.sub(r'\s+', ' ', title)
    return title.strip()

def extract_text_from_work_page(work_url):
    """Extrahiert Text von einer Werk-Seite"""
    try:
        time.sleep(1)
        response = requests.get(work_url)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Suche nach dem Haupttext-Bereich
        text_content = []
        
        # Verschiedene mögliche Container für den Text
        content_selectors = [
            'div.content',
            'div.text',
            'main',
            'article',
            'div.work-content',
            '.content-body'
        ]
        
        content_found = False
        for selector in content_selectors:
            content_div = soup.select_one(selector)
            if content_div:
                # Entferne Navigation und unwichtige Elemente
                for unwanted in content_div(['nav', 'header', 'footer', 'script', 'style']):
                    unwanted.decompose()
                
                # Hole alle Textabsätze
                for element in content_div.find_all(['p', 'div'], string=True):
                    text = element.get_text().strip()
                    if len(text) > 30:  # Nur substantielle Texte
                        text_content.append(text)
                
                if text_content:
                    content_found = True
                    break
        
        # Fallback: Hole allen Text
        if not content_found:
            # Entferne unwichtige Elemente
            for unwanted in soup(['nav', 'header', 'footer', 'script', 'style']):
                unwanted.decompose()
            
            text_content = [soup.get_text()]
        
        full_text = '\n'.join(text_content)
        return clean_extracted_text(full_text)
        
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
        r'.*unifr\.ch.*'
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

def main():
    """Hauptfunktion"""
    print("🚀 BKV KIRCHENVÄTER VOLLSTÄNDIGER SCRAPER")
    print("=" * 60)
    
    # Hole alle Autor-Links
    author_links = get_all_author_links()
    
    if not author_links:
        print("❌ Keine Autor-Links gefunden!")
        return
    
    # Prioritäre Autoren (die noch nicht in CSVs sind)
    priority_authors = [
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
    
    successful_authors = 0
    total_entries = 0
    
    for author in priority_authors:
        if author in author_links:
            try:
                # Hole deutsche Werke
                works = get_german_works_from_author(author, author_links[author])
                
                if not works:
                    print(f"   ❌ Keine deutschen Werke gefunden")
                    continue
                
                # Verarbeite alle Werke des Autors
                author_entries = []
                
                for work in works[:3]:  # Maximal 3 Werke pro Autor
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
        else:
            print(f"\n❌ {author} nicht in Autor-Links gefunden")
    
    # Finale Statistiken
    print(f"\n" + "=" * 60)
    print("🎉 SCRAPING ABGESCHLOSSEN!")
    print("=" * 60)
    print(f"📊 Erfolgreiche Autoren: {successful_authors}")
    print(f"📊 Neue Einträge: {total_entries}")

if __name__ == "__main__":
    main()
