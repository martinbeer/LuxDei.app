"""
Debug-Skript um die BKV Website-Struktur genau zu analysieren.
Wir schauen uns an, wie der deutsche Text der Kirchenväter strukturiert ist.
"""

import requests
from bs4 import BeautifulSoup
import json
import re

def analyze_works_page():
    """Analysiert die Hauptseite mit allen Werken"""
    url = "https://bkv.unifr.ch/de/works"
    print(f"Analysiere Hauptseite: {url}")
    
    response = requests.get(url)
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # Suche deutsche Versionen
    german_links = []
    for li in soup.find_all('li'):
        small = li.find('small')
        if small and 'deutsch' in small.get_text().lower():
            a = li.find('a')
            if a and a.get('href'):
                title = a.get_text().strip()
                href = a['href']
                if href.startswith('/'):
                    href = 'https://bkv.unifr.ch' + href
                german_links.append({
                    'title': title,
                    'url': href,
                    'language_info': small.get_text().strip()
                })
    
    print(f"Gefunden: {len(german_links)} deutsche Versionen")
    return german_links[:3]  # Erste 3 für Analyse

def analyze_version_page(version_url):
    """Analysiert eine spezifische Versions-Seite"""
    print(f"\n--- Analysiere Version: {version_url} ---")
    
    response = requests.get(version_url)
    soup = BeautifulSoup(response.content, 'html.parser')
    
    print("HTML-Struktur der Versions-Seite:")
    
    # Titel und Autor
    headings = soup.find_all(['h1', 'h2', 'h3'])
    print("Gefundene Überschriften:")
    for i, h in enumerate(headings[:5]):
        print(f"  {h.name}: {h.get_text().strip()}")
    
    # Inhaltsverzeichnis
    print("\nInhaltsverzeichnis:")
    toc_found = False
    for h in soup.find_all(['h2', 'h3']):
        if 'inhalts' in h.get_text().lower():
            print(f"TOC Überschrift gefunden: {h.get_text()}")
            ul = h.find_next('ul')
            if ul:
                links = ul.find_all('a')[:5]  # Erste 5 Links
                print(f"Erste {len(links)} TOC Links:")
                for a in links:
                    href = a.get('href', '')
                    text = a.get_text().strip()
                    if href.startswith('/'):
                        href = 'https://bkv.unifr.ch' + href
                    print(f"  - {text}: {href}")
                toc_found = True
                return links[:1]  # Analysiere ersten Link
    
    if not toc_found:
        print("Kein Inhaltsverzeichnis gefunden!")
        return []

def analyze_division_page(division_url):
    """Analysiert eine Division-Seite (wo der eigentliche Text steht)"""
    print(f"\n--- Analysiere Division: {division_url} ---")
    
    response = requests.get(division_url)
    soup = BeautifulSoup(response.content, 'html.parser')
    
    print("Vollständiger HTML-Inhalt der Division (erste 2000 Zeichen):")
    print(str(soup)[:2000])
    print("\n" + "="*60)
    
    # Suche nach dem Haupttext
    print("\nSuche nach verschiedenen Text-Containern:")
    
    # Mögliche Container für den Text
    containers = [
        ('div', {'class': re.compile(r'.*content.*', re.I)}),
        ('div', {'class': re.compile(r'.*text.*', re.I)}),
        ('div', {'class': re.compile(r'.*body.*', re.I)}),
        ('main', {}),
        ('article', {}),
        ('section', {})
    ]
    
    for tag, attrs in containers:
        elements = soup.find_all(tag, attrs)
        if elements:
            print(f"Gefunden {len(elements)} {tag} Element(e) mit {attrs}")
            for i, elem in enumerate(elements[:2]):
                text = elem.get_text().strip()[:300]
                print(f"  {i+1}. Inhalt: {text}...")
    
    # Alle Paragraphen
    paragraphs = soup.find_all('p')
    print(f"\nGefunden {len(paragraphs)} Paragraphen:")
    for i, p in enumerate(paragraphs[:5]):
        text = p.get_text().strip()[:200]
        if text:
            print(f"  P{i+1}: {text}...")
    
    # Alle div-Elemente
    divs = soup.find_all('div')
    print(f"\nGefunden {len(divs)} div-Elemente:")
    for i, div in enumerate(divs[:10]):
        classes = div.get('class', [])
        text = div.get_text().strip()[:150]
        if text and len(text) > 50:  # Nur divs mit substantiellem Text
            print(f"  DIV{i+1} (classes: {classes}): {text}...")
    
    # Suche nach Fußnoten
    print("\nSuche nach Fußnoten:")
    footnote_patterns = ['footnote', 'note', 'anmerkung']
    for pattern in footnote_patterns:
        elements = soup.find_all(attrs={'class': re.compile(pattern, re.I)})
        if elements:
            print(f"  Gefunden {len(elements)} Elemente mit '{pattern}' im class")
    
    # Suche nach dem *** Separator für Notizen
    full_text = soup.get_text()
    if '***' in full_text or '* * *' in full_text:
        print("*** Separator für Notizen gefunden!")
        parts = re.split(r'\*\s*\*\s*\*', full_text)
        if len(parts) > 1:
            print(f"Text vor ***: {parts[0][-200:]}")
            print(f"Text nach ***: {parts[1][:200]}")
    else:
        print("Kein *** Separator gefunden")

def main():
    print("=== BKV Website Struktur-Analyse ===\n")
    
    # 1. Analysiere Hauptseite
    german_versions = analyze_works_page()
    
    # 2. Analysiere erste deutsche Version
    if german_versions:
        version_url = german_versions[0]['url']
        division_links = analyze_version_page(version_url)
        
        # 3. Analysiere erste Division
        if division_links:
            division_url = division_links[0].get('href', '')
            if division_url.startswith('/'):
                division_url = 'https://bkv.unifr.ch' + division_url
            analyze_division_page(division_url)

if __name__ == "__main__":
    main()
