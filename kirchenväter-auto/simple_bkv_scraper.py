#!/usr/bin/env python3
"""
Einfacher, funktionierender BKV Scraper
Analysiert die echte Website-Struktur und lädt deutsche Texte hoch
"""
import requests
from bs4 import BeautifulSoup
import json
import os
import time
import re
from urllib.parse import urljoin

def get_supabase_headers():
    """Hole Supabase Headers"""
    url = os.getenv('SUPABASE_URL', 'https://bpjikoubhxsmsswgixix.supabase.co')
    key = os.getenv('SUPABASE_SERVICE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamlrb3ViaHhzbXNzd2dpeGl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY1ODU1MiwiZXhwIjoyMDY3MjM0NTUyfQ.GiM-rfWsV0sun4JKO0nJg1UQwsXWCirz5FtM74g6eUk')
    
    return {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }, url

def create_tables(supabase_url, headers):
    """Erstelle BKV Tabellen falls sie nicht existieren"""
    print("📊 Erstelle/Prüfe Tabellen...")
    
    # Teste ob bkv_works existiert
    response = requests.get(f"{supabase_url}/rest/v1/bkv_works?limit=1", headers=headers)
    if response.status_code != 200:
        print("❌ Tabellen müssen manuell erstellt werden!")
        print("\nFühre das folgende SQL in Supabase aus:")
        print("""
CREATE TABLE bkv_works (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    source_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE bkv_divisions (
    id TEXT NOT NULL,
    work_id TEXT REFERENCES bkv_works(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    footnotes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (id, work_id)
);

ALTER TABLE bkv_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE bkv_divisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON bkv_works FOR ALL USING (true);
CREATE POLICY "Allow all" ON bkv_divisions FOR ALL USING (true);
""")
        return False
    else:
        print("✅ Tabellen existieren")
        return True

def save_work(work_data, supabase_url, headers):
    """Speichere Werk in Supabase"""
    response = requests.post(
        f"{supabase_url}/rest/v1/bkv_works",
        headers=dict(headers, **{'Prefer': 'resolution=merge-duplicates'}),
        json=work_data
    )
    return response.status_code in [200, 201, 204, 409]

def save_division(division_data, supabase_url, headers):
    """Speichere Kapitel in Supabase"""
    response = requests.post(
        f"{supabase_url}/rest/v1/bkv_divisions",
        headers=dict(headers, **{'Prefer': 'resolution=merge-duplicates'}),
        json=division_data
    )
    return response.status_code in [200, 201, 204, 409]

def scrape_bkv():
    """Hauptfunktion - Scrape BKV deutsche Texte"""
    print("🚀 Starte BKV Scraping...")
    
    # Setup
    headers, supabase_url = get_supabase_headers()
    
    if not create_tables(supabase_url, headers):
        return
    
    # 1. Hole Liste aller Werke
    print("\n📚 Lade Werke-Liste...")
    response = requests.get("https://bkv.unifr.ch/de/works")
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # Finde alle Werk-Links
    work_links = []
    for a in soup.find_all('a', href=True):
        href = a['href']
        if '/works/' in href and len(href.split('/')) >= 3:
            if href not in work_links:
                work_links.append(href)
    
    print(f"Gefunden: {len(work_links)} Werke")
    
    # Limitiere für Test
    max_works = int(os.getenv('MAX_WORKS', '5'))
    work_links = work_links[:max_works]
    print(f"Verarbeite: {len(work_links)} Werke (limitiert für Test)")
    
    successful = 0
    
    # 2. Verarbeite jedes Werk
    for i, work_href in enumerate(work_links, 1):
        work_url = urljoin("https://bkv.unifr.ch", work_href)
        print(f"\n({i}/{len(work_links)}) 📖 {work_url}")
        
        try:
            # Lade Werk-Seite
            work_response = requests.get(work_url)
            work_soup = BeautifulSoup(work_response.content, 'html.parser')
            
            # Finde deutsche Versionen
            german_versions = []
            for a in work_soup.find_all('a', href=True):
                href = a['href']
                text = a.get_text(strip=True).lower()
                
                if '/versions/' in href:
                    # Prüfe ob deutsch
                    if any(term in text for term in ['deutsch', 'swkv', 'bkv', 'übersetzung']):
                        version_url = urljoin(work_url, href)
                        german_versions.append((version_url, a.get_text(strip=True)))
            
            if not german_versions:
                print("  ⚠️ Keine deutschen Versionen gefunden")
                continue
            
            # Verarbeite erste deutsche Version
            version_url, version_title = german_versions[0]
            print(f"  📝 Deutsche Version: {version_title}")
            
            # Lade Version-Seite
            version_response = requests.get(version_url)
            version_soup = BeautifulSoup(version_response.content, 'html.parser')
            
            # Extrahiere Werk-Info
            title_elem = version_soup.find('h1')
            work_title = title_elem.get_text(strip=True) if title_elem else version_title
            
            work_id = work_url.split('/')[-1]  # z.B. cpg-2001
            
            work_data = {
                'id': work_id,
                'title': work_title,
                'author': '',  # Wird später extrahiert
                'source_url': version_url
            }
            
            # Speichere Werk
            if save_work(work_data, supabase_url, headers):
                print(f"  ✅ Werk gespeichert")
            
            # Finde Kapitel/Divisions
            division_links = []
            for a in version_soup.find_all('a', href=True):
                if '/divisions/' in a['href']:
                    div_url = urljoin(version_url, a['href'])
                    div_title = a.get_text(strip=True) or "Kapitel"
                    division_links.append((div_url, div_title))
            
            print(f"  📑 Gefunden: {len(division_links)} Kapitel")
            
            # Verarbeite Kapitel (max 3 für Test)
            for j, (div_url, div_title) in enumerate(division_links[:3], 1):
                print(f"    ({j}) {div_title}")
                
                try:
                    # Lade Kapitel
                    div_response = requests.get(div_url)
                    div_soup = BeautifulSoup(div_response.content, 'html.parser')
                    
                    # Extrahiere Text
                    paragraphs = []
                    for p in div_soup.find_all('p'):
                        text = p.get_text(strip=True)
                        if text and len(text) > 20:
                            paragraphs.append(text)
                    
                    content = '\n\n'.join(paragraphs)
                    
                    # Extrahiere Fußnoten (einfach)
                    footnotes = []
                    for elem in div_soup.find_all(['sup', 'small']):
                        note_text = elem.get_text(strip=True)
                        if note_text and len(note_text) > 5:
                            footnotes.append(note_text)
                    
                    footnotes_text = ' | '.join(footnotes) if footnotes else ''
                    
                    division_data = {
                        'id': div_url.split('/')[-1],
                        'work_id': work_id,
                        'title': div_title,
                        'content': content[:10000] if content else 'Kein Inhalt gefunden',  # Limit 10k Zeichen
                        'footnotes': footnotes_text[:1000] if footnotes_text else ''  # Limit 1k Zeichen
                    }
                    
                    if save_division(division_data, supabase_url, headers):
                        print(f"      ✅ Kapitel gespeichert ({len(content)} Zeichen)")
                    else:
                        print(f"      ❌ Kapitel-Fehler")
                    
                    time.sleep(0.5)  # Pause
                    
                except Exception as e:
                    print(f"      ❌ Kapitel-Fehler: {e}")
                    continue
            
            successful += 1
            time.sleep(1)  # Pause zwischen Werken
            
        except Exception as e:
            print(f"  ❌ Werk-Fehler: {e}")
            continue
    
    print(f"\n🎉 Fertig! {successful} Werke erfolgreich verarbeitet")
    print(f"📊 Prüfe deine Daten in Supabase: {supabase_url.replace('https://', 'https://app.')}")

if __name__ == '__main__':
    scrape_bkv()
