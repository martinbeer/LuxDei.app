"""
Detaillierte Analyse der BKV-Struktur - schauen wir uns eine echte deutsche Textseite an
"""

import requests
from bs4 import BeautifulSoup
import json

def analyze_specific_work():
    """Analysiert ein konkretes deutsches Werk direkt"""
    
    # Versuchen wir mal eine konkrete deutsche Übersetzung
    test_urls = [
        "https://bkv.unifr.ch/works/cpg-2001/versions/athan-arii-deposito-swkv/divisions",
        "https://bkv.unifr.ch/de/works/cpg-2001/versions/athan-arii-deposito-swkv",
        "https://bkv.unifr.ch/works/cpg-2001/versions/athan-arii-deposito-swkv"
    ]
    
    for url in test_urls:
        print(f"\n{'='*60}")
        print(f"Teste URL: {url}")
        print('='*60)
        
        try:
            response = requests.get(url)
            if response.status_code != 200:
                print(f"Status Code: {response.status_code}")
                continue
                
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Vollständige Seitenanalyse
            print(f"Seitentitel: {soup.title.get_text() if soup.title else 'Kein Titel'}")
            
            # Alle Links auf der Seite
            links = soup.find_all('a', href=True)
            division_links = []
            
            print(f"\nGefundene Links ({len(links)} total):")
            for i, link in enumerate(links[:20]):  # Erste 20 Links
                href = link['href']
                text = link.get_text().strip()
                if text:  # Nur Links mit Text
                    print(f"  {i+1}. {text}: {href}")
                    if '/divisions/' in href:
                        division_links.append(href)
            
            # Wenn wir division links finden, analysiere den ersten
            if division_links:
                print(f"\nGefundene Division Links: {len(division_links)}")
                first_division = division_links[0]
                if first_division.startswith('/'):
                    first_division = 'https://bkv.unifr.ch' + first_division
                analyze_division_content(first_division)
                break
            
            # Ansonsten schaue nach dem Hauptinhalt
            print(f"\nHauptinhalt der Seite:")
            
            # Suche nach dem eigentlichen Text
            main_content = soup.find('main') or soup.find('div', class_='content') or soup.find('article')
            if main_content:
                text = main_content.get_text().strip()
                print(f"Hauptinhalt gefunden ({len(text)} Zeichen): {text[:500]}...")
            else:
                # Alle Paragraphen
                paragraphs = soup.find_all('p')
                if paragraphs:
                    print(f"Paragraphen gefunden ({len(paragraphs)}):")
                    for i, p in enumerate(paragraphs[:5]):
                        text = p.get_text().strip()
                        if len(text) > 30:
                            print(f"  P{i+1}: {text[:200]}...")
                            
        except Exception as e:
            print(f"Fehler bei {url}: {e}")

def analyze_division_content(division_url):
    """Analysiert den Inhalt einer Division-Seite"""
    print(f"\n{'='*40}")
    print(f"DIVISION ANALYSE: {division_url}")
    print('='*40)
    
    try:
        response = requests.get(division_url)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        print(f"Title: {soup.title.get_text() if soup.title else 'Kein Titel'}")
        
        # Schaue nach der Seitenstruktur
        print(f"\nSeiten-HTML (erste 1500 Zeichen):")
        print(str(soup)[:1500])
        
        print(f"\n{'='*30}")
        print("TEXT-EXTRAKTION:")
        print('='*30)
        
        # Versuche verschiedene Methoden den Text zu finden
        
        # 1. Suche nach main content
        main = soup.find('main')
        if main:
            text = main.get_text('\n', strip=True)
            print(f"MAIN element gefunden ({len(text)} Zeichen):")
            print(text[:800])
            print("...")
        
        # 2. Suche nach content divs
        content_divs = soup.find_all('div', class_=lambda x: x and 'content' in ' '.join(x).lower())
        if content_divs:
            print(f"\nCONTENT divs gefunden ({len(content_divs)}):")
            for i, div in enumerate(content_divs):
                text = div.get_text('\n', strip=True)
                if len(text) > 100:
                    print(f"  DIV {i+1} ({len(text)} Zeichen): {text[:400]}...")
        
        # 3. Alle Paragraphen sammeln
        paragraphs = soup.find_all('p')
        if paragraphs:
            print(f"\nAlle Paragraphen ({len(paragraphs)}):")
            for i, p in enumerate(paragraphs):
                text = p.get_text(strip=True)
                if len(text) > 20:  # Nur substantielle Paragraphen
                    print(f"  P{i+1}: {text}")
        
        # 4. Suche nach Fußnoten
        print(f"\n{'='*20}")
        print("FUSSNOTEN:")
        print('='*20)
        
        # Verschiedene Fußnoten-Pattern
        footnote_elements = soup.find_all(['div', 'section', 'p'], 
                                        class_=lambda x: x and any(pattern in ' '.join(x).lower() 
                                                                 for pattern in ['footnote', 'note', 'anmerkung']))
        
        if footnote_elements:
            print(f"Footnote-Elemente gefunden ({len(footnote_elements)}):")
            for i, elem in enumerate(footnote_elements):
                text = elem.get_text(strip=True)
                print(f"  NOTE{i+1}: {text[:200]}...")
        
        # Suche auch nach *** Pattern
        full_text = soup.get_text()
        if '***' in full_text or '* * *' in full_text:
            print("*** Pattern gefunden - versuche zu splitten")
            import re
            parts = re.split(r'\*\s*\*\s*\*', full_text, 1)
            if len(parts) == 2:
                main_text = parts[0].strip()
                notes_text = parts[1].strip()
                print(f"Haupttext ({len(main_text)} Zeichen): {main_text[-300:]}")
                print(f"Notizen ({len(notes_text)} Zeichen): {notes_text[:300]}")
        
    except Exception as e:
        print(f"Fehler bei Division-Analyse: {e}")

def manual_test():
    """Manueller Test mit bekannten URLs"""
    
    # Test verschiedene URL-Formate
    test_urls = [
        "https://bkv.unifr.ch/works/cpg-2001/versions/athan-arii-deposito-swkv/divisions/1",
        "https://bkv.unifr.ch/works/cpg-2001/versions/athan-arii-deposito-swkv/divisions/2",
        "https://bkv.unifr.ch/works/cpg-2235/versions/athan-vit-ant-dt/divisions/1"
    ]
    
    for url in test_urls:
        analyze_division_content(url)

if __name__ == "__main__":
    print("=== DETAILLIERTE BKV ANALYSE ===")
    analyze_specific_work()
    print("\n" + "="*60)
    print("MANUELLER TEST:")
    manual_test()
