import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
import re

# Mapping von URL-Kürzeln zu Kirchenväter-Namen
AUTHOR_MAPPING = {
    'athan': 'Athanasius',
    'august': 'Augustinus',
    'ambros': 'Ambrosius', 
    'hieron': 'Hieronymus',
    'chrysost': 'Johannes_Chrysostomus',
    'basil': 'Basilius',
    'gregor': 'Gregor',
    'orig': 'Origenes',
    'tertull': 'Tertullian',
    'cyprian': 'Cyprian',
    'ignat': 'Ignatius',
    'justin': 'Justin',
    'iren': 'Irenäus',
    'clem': 'Clemens',
    'hipp': 'Hippolyt',
    'lact': 'Lactantius',
    'euseb': 'Eusebius',
    'cassian': 'Johannes_Cassian',
    'leo': 'Leo_der_Große',
    'isidor': 'Isidor',
    'beda': 'Beda',
    'damasc': 'Johannes_Damascenus'
}

BASE_URL = "https://bkv.unifr.ch"
START_URL = f"{BASE_URL}/de/works"

def extract_author_from_url_and_text(work_url, link_text):
    """Verbesserte Autor-Extraktion aus URL und Linktext"""
    
    # 1. Versuche aus URL-Pfad zu extrahieren
    url_lower = work_url.lower()
    for key, author in AUTHOR_MAPPING.items():
        if key in url_lower:
            return author
    
    # 2. Versuche aus Linktext zu extrahieren
    text_lower = link_text.lower()
    
    # Bekannte Muster im Linktext
    if 'athanasius' in text_lower or 'athan' in text_lower:
        return 'Athanasius'
    elif 'augustinus' in text_lower or 'august' in text_lower:
        return 'Augustinus'
    elif 'ambrosius' in text_lower or 'ambros' in text_lower:
        return 'Ambrosius'
    elif 'hieronymus' in text_lower or 'hieron' in text_lower:
        return 'Hieronymus'
    elif 'chrysostomus' in text_lower or 'chrysost' in text_lower:
        return 'Johannes_Chrysostomus'
    elif 'basilius' in text_lower or 'basil' in text_lower:
        return 'Basilius'
    elif 'gregor' in text_lower:
        return 'Gregor'
    elif 'origenes' in text_lower or 'orig' in text_lower:
        return 'Origenes'
    elif 'tertullian' in text_lower or 'tertull' in text_lower:
        return 'Tertullian'
    elif 'cyprian' in text_lower:
        return 'Cyprian'
    
    # 3. Versuche die Werk-Seite zu besuchen für mehr Informationen
    try:
        response = requests.get(work_url, timeout=10)
        soup = BeautifulSoup(response.content, "html.parser")
        
        # Suche nach Autor-Links
        for a in soup.find_all('a', href=True):
            if '/authors/' in a.get('href', ''):
                author_name = a.get_text(strip=True)
                if author_name and len(author_name) > 2:
                    return clean_author_name(author_name)
        
        # Suche in Breadcrumbs oder Überschriften
        for tag in ['h1', 'h2', 'h3']:
            elements = soup.find_all(tag)
            for elem in elements:
                text = elem.get_text(strip=True)
                if any(name in text for name in ['Athanasius', 'Augustinus', 'Ambrosius', 'Hieronymus']):
                    for name in ['Athanasius', 'Augustinus', 'Ambrosius', 'Hieronymus']:
                        if name in text:
                            return name
        
    except Exception as e:
        print(f"      Fehler beim Laden der Werk-Seite: {e}")
    
    # 4. Fallback: Extrahiere aus der URL-Struktur
    # z.B. /works/cpg-2001/ -> verwende cpg-2001 als Basis
    url_parts = work_url.split('/')
    for part in url_parts:
        if 'cpg-' in part or 'cpl-' in part:
            # Das ist eine Corpus-Nummer, versuche daraus den Autor abzuleiten
            return f"Corpus_{part}"
    
    return "Unbekannter_Autor"

def clean_author_name(name):
    """Bereinigt Autorennamen"""
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    name = re.sub(r'\s+', '_', name)
    name = name.strip('.')
    return name[:50]

def get_deutsch_works():
    print("Sammle ALLE deutschen Werke...")
    response = requests.get(START_URL)
    soup = BeautifulSoup(response.content, "html.parser")
    works = []
    
    # Finde alle Links zu deutschen Übersetzungen
    all_links = soup.find_all('a', href=True)
    deutsch_links = [link for link in all_links if 'deutsch' in link.get_text().lower()]
    
    print(f"Gefunden: {len(deutsch_links)} deutsche Übersetzungen")
    
    for i, link in enumerate(deutsch_links):
        link_text = link.get_text(strip=True)
        href = link['href']
        
        if i % 50 == 0:
            print(f"Verarbeitung: {i}/{len(deutsch_links)} Links...")
        
        if href.startswith('http'):
            work_url = href
        else:
            work_url = BASE_URL + href
        
        if '/divisions' in work_url:
            author = extract_author_from_url_and_text(work_url, link_text)
            works.append({
                'url': work_url,
                'title': link_text,
                'author': author
            })
            
            if i < 10:  # Debug: Erste 10 anzeigen
                print(f"  {i+1}. {author} -> {link_text}")
        
        if i % 20 == 0 and i > 0:
            time.sleep(0.3)
    
    print(f"Insgesamt {len(works)} deutsche Werke gefunden")
    return works

def parse_work(work_info):
    work_url = work_info['url']
    work_title = work_info['title']
    author = work_info['author']
    
    print(f"Parsing: {author} - {work_title[:60]}...")
    try:
        response = requests.get(work_url)
        soup = BeautifulSoup(response.content, "html.parser")
        
        chapter_links = []
        for a in soup.find_all('a', href=True):
            href = a['href']
            if '/divisions/' in href and href.split('/divisions/')[-1].isdigit():
                if href.startswith('http'):
                    chapter_url = href
                else:
                    chapter_url = BASE_URL + href
                if chapter_url not in chapter_links:
                    chapter_links.append(chapter_url)
        
        if not chapter_links:
            for a in soup.find_all('a', href=True):
                if 'text anzeigen' in a.get_text().lower():
                    href = a['href']
                    if href.startswith('http'):
                        chapter_url = href
                    else:
                        chapter_url = BASE_URL + href
                    chapter_links.append(chapter_url)
        
        print(f"  Gefundene Kapitel: {len(chapter_links)}")
        
        all_verses = []
        for i, chapter_url in enumerate(chapter_links):
            if i % 5 == 0:
                print(f"    Kapitel {i+1}/{len(chapter_links)}")
            
            chapter_data = parse_chapter(chapter_url, work_title, author)
            all_verses.extend(chapter_data)
            time.sleep(0.3)
        
        print(f"  Insgesamt {len(all_verses)} Textabschnitte extrahiert")
        return all_verses
        
    except Exception as e:
        print(f"  ✗ Fehler beim Parsen von {work_url}: {e}")
        return []

def parse_chapter(chapter_url, werk_title, author):
    try:
        response = requests.get(chapter_url)
        soup = BeautifulSoup(response.content, "html.parser")
        
        chapter_title = "Kapitel"
        title_elem = soup.select_one("h1, h2, h3, .chapter-title")
        if title_elem:
            chapter_title = title_elem.get_text(strip=True)
        
        verses = []
        main_content = soup.find('main') or soup.find('div', class_='content') or soup.find('article')
        
        if main_content:
            paragraphs = main_content.find_all('p')
        else:
            paragraphs = soup.find_all('p')
        
        for p in paragraphs:
            text = p.get_text(strip=True)
            
            if text and len(text) > 50 and not any(skip in text.lower() for skip in [
                'imprimer', 'rapporter', 'fehler melden', 'copyright', 'navigation', 
                'menu', 'footer', 'header', 'login', 'search', 'drucken', 'error',
                'print', 'report error', 'bibliothek der kirchenväter'
            ]):
                vers_num = ""
                
                sup = p.find("sup")
                if sup:
                    vers_num = sup.get_text(strip=True)
                    sup_copy = soup.new_tag("sup")
                    sup_copy.string = sup.get_text()
                    sup.replace_with(sup_copy)
                    text = p.get_text(strip=True)
                
                match = re.match(r'^(\d+)\.?\s*(.*)$', text)
                if match and len(match.group(2)) > 30:
                    vers_num = match.group(1)
                    text = match.group(2)
                
                verses.append({
                    "author": author,
                    "werk": werk_title,
                    "kapitel": chapter_title,
                    "vers": vers_num,
                    "text": text
                })
        
        return verses
        
    except Exception as e:
        print(f"      ✗ Fehler beim Parsen von {chapter_url}: {e}")
        return []

def clean_filename(name):
    cleaned = re.sub(r'[<>:"/\\|?*]', '_', name)
    cleaned = re.sub(r'\s+', '_', cleaned)
    cleaned = cleaned.strip('.')
    return cleaned[:50]

def save_by_author(all_data):
    if not all_data:
        print("Keine Daten zu speichern!")
        return
    
    df = pd.DataFrame(all_data)
    authors = df['author'].unique()
    
    print(f"\nSpeichere Daten für {len(authors)} Autoren...")
    
    for author in authors:
        author_data = df[df['author'] == author]
        clean_author = clean_filename(author)
        filename = f"kirchenvater_{clean_author}.csv"
        
        author_data.to_csv(filename, index=False, encoding='utf-8-sig')
        print(f"✓ {filename}: {len(author_data)} Textabschnitte")
    
    df.to_csv("alle_kirchenvaeter_komplett.csv", index=False, encoding='utf-8-sig')
    print(f"\n✓ alle_kirchenvaeter_komplett.csv: {len(df)} Textabschnitte insgesamt")

def main():
    print("🔥 Starte VERBESSERTEN BKV Scraper mit korrekter Autor-Extraktion! 🔥")
    
    works = get_deutsch_works()
    
    if not works:
        print("Keine deutschen Werke gefunden!")
        return
    
    print(f"\n🚀 Verarbeite {len(works)} Werke...")
    
    all_data = []
    error_count = 0
    
    for i, work_info in enumerate(works):
        print(f"\n📚 Verarbeite Werk {i+1}/{len(works)}")
        
        try:
            werk_data = parse_work(work_info)
            all_data.extend(werk_data)
            print(f"✅ Erfolgreich! Bisher {len(all_data)} Textabschnitte gesammelt")
        except Exception as e:
            error_count += 1
            print(f"❌ Fehler bei Werk {i+1}: {e}")
        
        if (i + 1) % 50 == 0:
            print(f"\n🔄 ZWISCHENSTAND nach {i+1} Werken:")
            print(f"📊 Gesammelte Textabschnitte: {len(all_data)}")
            print(f"⚠️  Fehler: {error_count}")
            
            if all_data:
                save_by_author(all_data)
                print("💾 Zwischenspeicherung abgeschlossen!")
        
        time.sleep(1)
    
    print(f"\n🎉 SCRAPING ABGESCHLOSSEN!")
    
    if all_data:
        save_by_author(all_data)
        
        df = pd.DataFrame(all_data)
        print(f"\n📈 ENDSTATISTIKEN:")
        print(f"   • Autoren: {df['author'].nunique()}")
        print(f"   • Werke: {df['werk'].nunique()}")
        print(f"   • Textabschnitte: {len(df)}")
        
        print(f"\n👥 AUTOREN nach Textabschnitten:")
        top_authors = df['author'].value_counts()
        for author, count in top_authors.items():
            print(f"   • {author}: {count} Abschnitte")
        
        print(f"\n🚀 Separate CSV-Dateien pro Kirchenvater erstellt!")
    
    print("✨ Script beendet!")

if __name__ == "__main__":
    main()
