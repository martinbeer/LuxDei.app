import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
import re

# Bekannte Kirchenväter für bessere Zuordnung
KNOWN_CHURCH_FATHERS = [
    'Athanasius', 'Augustinus', 'Hieronymus', 'Ambrosius', 'Johannes Chrysostomus',
    'Basilius', 'Gregor von Nazianz', 'Gregor von Nyssa', 'Origenes', 'Tertullian',
    'Cyprian', 'Ignatius', 'Polykarp', 'Justin', 'Irenäus', 'Clemens', 'Hippolyt',
    'Lactantius', 'Eusebius', 'Johannes Cassian', 'Leo der Große', 'Gregor der Große',
    'Isidor von Sevilla', 'Beda Venerabilis', 'Johannes Damascenus'
]

BASE_URL = "https://bkv.unifr.ch"
START_URL = f"{BASE_URL}/de/works"

def get_deutsch_works():
    print("Sammle ALLE deutschen Werke...")
    response = requests.get(START_URL)
    soup = BeautifulSoup(response.content, "html.parser")
    works = []
    
    # Finde alle Links zu deutschen Übersetzungen
    all_links = soup.find_all('a', href=True)
    deutsch_links = [link for link in all_links if 'deutsch' in link.get_text().lower()]
    
    print(f"Gefunden: {len(deutsch_links)} deutsche Übersetzungen")
    
    for i, link in enumerate(deutsch_links):  # ALLE Werke, keine Limitierung
        link_text = link.get_text(strip=True)
        href = link['href']
        
        if i % 50 == 0:  # Progress Update alle 50 Werke
            print(f"Verarbeitung: {i}/{len(deutsch_links)} Links...")
        
        if href.startswith('http'):
            work_url = href
        else:
            work_url = BASE_URL + href
        
        # Prüfe ob es ein Divisions-Link ist (das sind die Kapitel-Übersichten)
        if '/divisions' in work_url:
            # Extrahiere Autor-Information aus der URL oder dem Link-Text
            author = extract_author_from_work(work_url, link_text)
            works.append({
                'url': work_url,
                'title': link_text,
                'author': author
            })
        
        # Kleine Pause um Server zu schonen
        if i % 20 == 0 and i > 0:
            time.sleep(0.5)
    
    print(f"Insgesamt {len(works)} deutsche Werke gefunden")
    return works

def extract_author_from_work(work_url, link_text):
    """Extrahiert den Autor aus URL oder Titel"""
    # Versuche Autor aus dem Link-Text zu extrahieren
    if '(' in link_text:
        # Manchmal steht der Autor in Klammern
        parts = link_text.split('(')
        if len(parts) > 1:
            return parts[0].strip()
    
    # Versuche Autor aus der URL zu extrahieren
    try:
        # Hole die Werk-Seite um mehr Informationen zu bekommen
        response = requests.get(work_url)
        soup = BeautifulSoup(response.content, "html.parser")
        
        # Suche nach Autor-Informationen
        author_elem = soup.find('span', class_='author') or soup.find('div', class_='author')
        if author_elem:
            return author_elem.get_text(strip=True)
        
        # Fallback: aus Breadcrumbs oder Überschriften
        breadcrumbs = soup.find_all('a', href=True)
        for bc in breadcrumbs:
            if '/authors/' in bc.get('href', ''):
                return bc.get_text(strip=True)
        
        # Letzter Fallback: aus dem Titel versuchen zu extrahieren
        title = soup.find('h1')
        if title:
            title_text = title.get_text(strip=True)
            # Häufige Muster für Autoren
            for pattern in ['von ', 'des ', 'der ']:
                if pattern in title_text.lower():
                    parts = title_text.split(pattern)
                    if len(parts) > 1:
                        return parts[-1].split(',')[0].split('.')[0].strip()
    
    except:
        pass
    
    # Ultimate Fallback: "Unbekannter Autor"
    return "Unbekannter_Autor"

def parse_work(work_info):
    work_url = work_info['url']
    work_title = work_info['title']
    author = work_info['author']
    
    print(f"Parsing: {author} - {work_title}")
    try:
        response = requests.get(work_url)
        soup = BeautifulSoup(response.content, "html.parser")
        
        # Finde alle Divisions/Kapitel-Links
        chapter_links = []
        for a in soup.find_all('a', href=True):
            href = a['href']
            # Suche nach Links die auf /divisions/[nummer] enden
            if '/divisions/' in href and href.split('/divisions/')[-1].isdigit():
                if href.startswith('http'):
                    chapter_url = href
                else:
                    chapter_url = BASE_URL + href
                if chapter_url not in chapter_links:
                    chapter_links.append(chapter_url)
        
        # Falls keine Divisions gefunden, suche nach "Text anzeigen" Links
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
        for i, chapter_url in enumerate(chapter_links):  # ALLE Kapitel verarbeiten
            if i % 5 == 0:
                print(f"    Kapitel {i+1}/{len(chapter_links)}")
            
            chapter_data = parse_chapter(chapter_url, work_title, author)
            all_verses.extend(chapter_data)
            time.sleep(0.3)  # Kurze Pause zwischen Kapiteln
        
        print(f"  Insgesamt {len(all_verses)} Textabschnitte extrahiert")
        return all_verses
        
    except Exception as e:
        print(f"  ✗ Fehler beim Parsen von {work_url}: {e}")
        return []

def parse_chapter(chapter_url, werk_title, author):
    try:
        response = requests.get(chapter_url)
        soup = BeautifulSoup(response.content, "html.parser")
        
        # Kapiteltitel - versuche verschiedene Möglichkeiten
        chapter_title = "Kapitel"
        title_elem = soup.select_one("h1, h2, h3, .chapter-title")
        if title_elem:
            chapter_title = title_elem.get_text(strip=True)
        
        verses = []
        
        # Finde den Hauptinhalt
        main_content = soup.find('main') or soup.find('div', class_='content') or soup.find('article')
        
        if main_content:
            # Suche in dem Hauptinhalt nach Paragraphen
            paragraphs = main_content.find_all('p')
        else:
            # Fallback: alle Paragraphen
            paragraphs = soup.find_all('p')
        
        for p in paragraphs:
            text = p.get_text(strip=True)
            
            # Filtere zu kurze oder irrelevante Texte
            if text and len(text) > 50 and not any(skip in text.lower() for skip in [
                'imprimer', 'rapporter', 'fehler melden', 'copyright', 'navigation', 
                'menu', 'footer', 'header', 'login', 'search', 'drucken', 'error',
                'print', 'report error', 'bibliothek der kirchenväter'
            ]):
                # Versuche Versnummer zu extrahieren
                vers_num = ""
                
                # Suche nach <sup> Tags für Versnummern
                sup = p.find("sup")
                if sup:
                    vers_num = sup.get_text(strip=True)
                    # Entferne das sup Element für den Text
                    sup_copy = soup.new_tag("sup")
                    sup_copy.string = sup.get_text()
                    sup.replace_with(sup_copy)
                    text = p.get_text(strip=True)
                
                # Prüfe auf Nummer am Anfang des Textes
                match = re.match(r'^(\d+)\.?\s*(.*)$', text)
                if match and len(match.group(2)) > 30:  # Nur wenn genug Text nach der Nummer
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
    """Bereinigt Dateinamen für CSV-Export"""
    # Entferne problematische Zeichen
    cleaned = re.sub(r'[<>:"/\\|?*]', '_', name)
    cleaned = re.sub(r'\s+', '_', cleaned)  # Leerzeichen zu Unterstrichen
    cleaned = cleaned.strip('.')  # Punkte am Anfang/Ende entfernen
    return cleaned[:50]  # Max 50 Zeichen

def save_by_author(all_data):
    """Speichert Daten gruppiert nach Autoren in separate CSV-Dateien"""
    if not all_data:
        print("Keine Daten zu speichern!")
        return
    
    # Gruppiere nach Autoren
    df = pd.DataFrame(all_data)
    authors = df['author'].unique()
    
    print(f"\nSpeichere Daten für {len(authors)} Autoren...")
    
    for author in authors:
        author_data = df[df['author'] == author]
        
        # Bereinige Autorennamen für Dateinamen
        clean_author = clean_filename(author)
        filename = f"kirchenvater_{clean_author}.csv"
        
        # Speichere als CSV
        author_data.to_csv(filename, index=False, encoding='utf-8-sig')
        
        print(f"✓ {filename}: {len(author_data)} Textabschnitte")
        print(f"  Werke: {author_data['werk'].nunique()}")
        print(f"  Kapitel: {author_data['kapitel'].nunique()}")
    
    # Zusätzlich: Eine Gesamt-CSV mit allen Daten
    df.to_csv("alle_kirchenvaeter_komplett.csv", index=False, encoding='utf-8-sig')
    print(f"\n✓ alle_kirchenvaeter_komplett.csv: {len(df)} Textabschnitte insgesamt")

def main():
    print("🔥 Starte VOLLSTÄNDIGEN BKV Scraper für ALLE deutschen Werke! 🔥")
    print("⚠️  WARNUNG: Dies kann mehrere Stunden dauern!")
    
    # Sammle ALLE deutschen Werke
    works = get_deutsch_works()
    
    if not works:
        print("Keine deutschen Werke gefunden!")
        return
    
    print(f"\n🚀 Verarbeite {len(works)} Werke - das wird eine Weile dauern...")
    print("💡 Tipp: Das Script pausiert zwischen Requests um den Server zu schonen")
    
    all_data = []
    error_count = 0
    
    for i, work_info in enumerate(works):
        print(f"\n📚 Verarbeite Werk {i+1}/{len(works)}")
        print(f"📖 Autor: {work_info['author']}")
        
        try:
            werk_data = parse_work(work_info)
            all_data.extend(werk_data)
            print(f"✅ Erfolgreich! Bisher {len(all_data)} Textabschnitte gesammelt")
        except Exception as e:
            error_count += 1
            print(f"❌ Fehler bei Werk {i+1}: {e}")
        
        # Progress Update und Zwischenspeicherung alle 50 Werke
        if (i + 1) % 50 == 0:
            print(f"\n🔄 ZWISCHENSTAND nach {i+1} Werken:")
            print(f"📊 Gesammelte Textabschnitte: {len(all_data)}")
            print(f"⚠️  Fehler: {error_count}")
            
            # Zwischenspeicherung
            if all_data:
                save_by_author(all_data)
                print("💾 Zwischenspeicherung abgeschlossen!")
        
        # Pause zwischen Werken (wichtig!)
        time.sleep(1)
    
    print(f"\n🎉 SCRAPING ABGESCHLOSSEN!")
    print(f"📊 Endstatistiken:")
    print(f"   • Verarbeitete Werke: {len(works)}")
    print(f"   • Gesammelte Textabschnitte: {len(all_data)}")
    print(f"   • Fehler: {error_count}")
    
    if all_data:
        # Finale Speicherung
        save_by_author(all_data)
        
        # Detaillierte Statistiken
        df = pd.DataFrame(all_data)
        print(f"\n📈 DETAILLIERTE STATISTIKEN:")
        print(f"   • Autoren: {df['author'].nunique()}")
        print(f"   • Werke: {df['werk'].nunique()}")
        print(f"   • Kapitel: {df['kapitel'].nunique()}")
        print(f"   • Durchschnittliche Textlänge: {df['text'].str.len().mean():.0f} Zeichen")
        
        print(f"\n👥 TOP 10 AUTOREN nach Textabschnitten:")
        top_authors = df['author'].value_counts().head(10)
        for author, count in top_authors.items():
            print(f"   • {author}: {count} Abschnitte")
        
        print(f"\n🚀 Alle Dateien sind bereit für Supabase Upload!")
    else:
        print("❌ Keine Daten gesammelt!")
    
    print("✨ Script beendet!")

if __name__ == "__main__":
    main()
