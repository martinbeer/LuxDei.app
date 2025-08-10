import requests
import pandas as pd
import re
import time
from pathlib import Path
from bs4 import BeautifulSoup

# Neue Kirchenväter die noch nicht in den CSVs sind (exakte Namen von der Website)
PRIORITY_KIRCHENVAETER = [
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
    "Minucius Felix",
    "Methodius von Olympus"
]

def find_author_page(author_name):
    """Findet die Autorenseite auf BKV"""
    print(f"\n📖 Suche nach: {author_name}")
    
    try:
        # Durchsuche die Werke-Seite
        response = requests.get("https://bkv.unifr.ch/de/works")
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Suche nach exakter Übereinstimmung oder Teilübereinstimmung
        for link in soup.find_all('a', href=True):
            link_text = link.get_text().strip()
            
            # Exakte Übereinstimmung oder sehr ähnlich
            if (author_name.lower() == link_text.lower() or 
                author_name.lower() in link_text.lower() and len(link_text) < len(author_name) + 20):
                
                author_url = "https://bkv.unifr.ch" + link['href'] if link['href'].startswith('/') else link['href']
                print(f"   🔗 Gefunden: {link_text} -> {author_url}")
                return author_url
        
        print(f"   ❌ Autor nicht gefunden")
        return None
        
    except Exception as e:
        print(f"   ❌ Fehler: {e}")
        return None

def get_german_works(author_url):
    """Holt deutsche Werke eines Autors"""
    try:
        time.sleep(1)  # Rate limiting
        response = requests.get(author_url)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        german_works = []
        
        # Suche nach deutschen Übersetzungen
        for link in soup.find_all('a', href=True):
            link_text = link.get_text().strip()
            
            # Filtere deutsche Werke
            if any(keyword in link_text.lower() for keyword in ['deutsch', 'übersetzung', 'german']):
                work_url = "https://bkv.unifr.ch" + link['href'] if link['href'].startswith('/') else link['href']
                
                # Bereinige Titel
                clean_title = clean_work_title(link_text)
                
                german_works.append({
                    'title': clean_title,
                    'url': work_url
                })
                print(f"   📄 Deutsches Werk: {clean_title}")
        
        return german_works
        
    except Exception as e:
        print(f"   ❌ Fehler beim Laden der Werke: {e}")
        return []

def clean_work_title(title):
    """Bereinigt Werktitel"""
    title = re.sub(r'Übersetzung \([^)]+\):\s*', '', title)
    title = re.sub(r'Kommentar \([^)]+\):\s*', '', title)
    title = re.sub(r'\s*\([^)]*\)\s*$', '', title)
    title = re.sub(r'\s+', ' ', title)
    return title.strip()

def extract_text_from_work(work_url):
    """Extrahiert Text von einer Werk-URL"""
    try:
        time.sleep(1)  # Rate limiting
        response = requests.get(work_url)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Entferne Navigation, Header, Footer
        for element in soup(['nav', 'header', 'footer', 'script', 'style']):
            element.decompose()
        
        # Extrahiere Haupttext
        text_content = []
        
        # Suche nach Hauptinhalt
        main_content = soup.find('main') or soup.find('div', class_='content') or soup.body
        
        if main_content:
            # Hole alle Textabsätze
            for p in main_content.find_all(['p', 'div'], string=True):
                text = p.get_text().strip()
                if len(text) > 50:  # Nur substantielle Texte
                    text_content.append(text)
        
        # Falls kein strukturierter Inhalt, nehme allen Text
        if not text_content:
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
    
    # Entferne Metadaten und Navigation
    text = re.sub(r'Navigation.*?$', '', text, flags=re.MULTILINE)
    text = re.sub(r'Sprache.*?$', '', text, flags=re.MULTILINE)
    text = re.sub(r'Copyright.*?$', '', text, flags=re.MULTILINE)
    
    # Entferne Seitenzahlen
    text = re.sub(r'S\.\s*\d+', '', text)
    text = re.sub(r'^\s*\d+\s*$', '', text, flags=re.MULTILINE)
    
    # Entferne übermäßige Leerzeichen
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'\n\s*\n', '\n', text)
    
    return text.strip()

def split_text_for_supabase(text, author_name, work_title):
    """Teilt Text für Supabase-Format auf"""
    if not text or len(text.strip()) < 100:
        return []
    
    # Teile in Absätze (einfache Methode)
    paragraphs = text.split('\n')
    
    entries = []
    current_text = ""
    section = 1
    
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        
        if not paragraph or len(paragraph) < 20:
            continue
        
        # Sammle Text bis ~200-400 Wörter
        if len(current_text.split()) < 200:
            current_text += " " + paragraph if current_text else paragraph
        else:
            # Speichere aktuellen Abschnitt
            if len(current_text.split()) >= 20:
                entry_id = create_unique_id(author_name, work_title, section)
                entries.append({
                    'id': entry_id,
                    'author': author_name,
                    'work_title': work_title,
                    'section': section,
                    'text': current_text.strip(),
                    'word_count': len(current_text.split()),
                    'language': 'de'
                })
                section += 1
            
            # Starte neuen Abschnitt
            current_text = paragraph
    
    # Letzten Abschnitt hinzufügen
    if current_text and len(current_text.split()) >= 20:
        entry_id = create_unique_id(author_name, work_title, section)
        entries.append({
            'id': entry_id,
            'author': author_name,
            'work_title': work_title,
            'section': section,
            'text': current_text.strip(),
            'word_count': len(current_text.split()),
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

def scrape_priority_kirchenvaeter():
    """Scrapt die prioritären Kirchenväter"""
    print("🚀 ERWEITERTE KIRCHENVÄTER-SAMMLUNG (PRIORITÄT)")
    print("=" * 60)
    
    print(f"📋 Prioritäre Kirchenväter: {len(PRIORITY_KIRCHENVAETER)}")
    for i, author in enumerate(PRIORITY_KIRCHENVAETER, 1):
        print(f"   {i}. {author}")
    
    successful_authors = 0
    total_entries = 0
    
    for author in PRIORITY_KIRCHENVAETER:
        print(f"\n{'='*20} {author} {'='*20}")
        
        try:
            # Finde Autorenseite
            author_url = find_author_page(author)
            if not author_url:
                continue
            
            # Hole deutsche Werke
            works = get_german_works(author_url)
            if not works:
                print(f"   ❌ Keine deutschen Werke gefunden")
                continue
            
            # Verarbeite alle Werke
            author_entries = []
            
            for work in works:
                print(f"   📖 Verarbeite: {work['title']}")
                
                text = extract_text_from_work(work['url'])
                
                if text and len(text) > 500:
                    entries = split_text_for_supabase(text, author, work['title'])
                    author_entries.extend(entries)
                    print(f"     ✅ {len(entries)} Abschnitte erstellt")
                else:
                    print(f"     ❌ Zu wenig verwertbarer Text")
                
                time.sleep(2)  # Rate limiting
            
            # Speichere Autor-CSV
            if author_entries:
                if save_author_csv(author, author_entries):
                    successful_authors += 1
                    total_entries += len(author_entries)
                    print(f"   🎉 {author}: {len(author_entries)} Einträge gespeichert")
            else:
                print(f"   ❌ {author}: Keine verwertbaren Texte")
                
        except Exception as e:
            print(f"   ❌ Fehler bei {author}: {e}")
            continue
    
    # Finale Statistiken
    print(f"\n" + "=" * 60)
    print("🎉 PRIORITÄRE KIRCHENVÄTER ABGESCHLOSSEN!")
    print("=" * 60)
    print(f"📊 Erfolgreiche Autoren: {successful_authors}/{len(PRIORITY_KIRCHENVAETER)}")
    print(f"📊 Neue Einträge: {total_entries}")
    
    if successful_authors > 0:
        print(f"\n📁 Neue CSV-Dateien:")
        for author in PRIORITY_KIRCHENVAETER:
            csv_file = f"supabase_{author.replace(' ', '_')}.csv"
            if Path(csv_file).exists():
                df = pd.read_csv(csv_file)
                print(f"   ✅ {csv_file} ({len(df)} Einträge)")

if __name__ == "__main__":
    scrape_priority_kirchenvaeter()
