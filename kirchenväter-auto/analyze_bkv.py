#!/usr/bin/env python3
"""
BKV Website Analyzer - Analysiert die echte Struktur der BKV-Website
"""
import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin

def analyze_bkv():
    print("=== BKV Website Struktur-Analyse ===")
    
    # 1. Hauptseite analysieren
    print("\n1. Analysiere Hauptseite...")
    response = requests.get("https://bkv.unifr.ch/de/works")
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # Finde Links zu Werken
    work_links = soup.find_all('a', href=re.compile(r'/works/[^/]+$'))
    print(f"Gefundene Werk-Links: {len(work_links)}")
    
    if work_links:
        # Analysiere erstes Werk
        first_work = work_links[0]
        work_url = urljoin("https://bkv.unifr.ch", first_work['href'])
        print(f"Erstes Werk: {work_url}")
        print(f"Titel: {first_work.get_text(strip=True)}")
        
        # 2. Werk-Seite analysieren
        print(f"\n2. Analysiere Werk-Seite: {work_url}")
        work_response = requests.get(work_url)
        work_soup = BeautifulSoup(work_response.content, 'html.parser')
        
        # Suche nach Versionen
        version_links = work_soup.find_all('a', href=re.compile(r'/versions/'))
        print(f"Versionen gefunden: {len(version_links)}")
        
        for i, version in enumerate(version_links[:3], 1):
            version_url = urljoin(work_url, version['href'])
            version_text = version.get_text(strip=True)
            print(f"  Version {i}: {version_text}")
            print(f"    URL: {version_url}")
            
            # Prüfe ob deutsch
            if any(term in version_text.lower() for term in ['deutsch', 'german', 'übersetzung']):
                print("    ✅ Deutsche Version gefunden!")
                
                # 3. Analysiere deutsche Version
                print(f"\n3. Analysiere deutsche Version: {version_url}")
                version_response = requests.get(version_url)
                version_soup = BeautifulSoup(version_response.content, 'html.parser')
                
                # Suche nach Kapiteln/Divisions
                div_links = version_soup.find_all('a', href=re.compile(r'/divisions/'))
                print(f"Kapitel/Divisions gefunden: {len(div_links)}")
                
                if div_links:
                    # Analysiere erstes Kapitel
                    first_div = div_links[0]
                    div_url = urljoin(version_url, first_div['href'])
                    div_title = first_div.get_text(strip=True)
                    print(f"Erstes Kapitel: {div_title}")
                    print(f"Kapitel-URL: {div_url}")
                    
                    # 4. Analysiere Kapitel-Inhalt
                    print(f"\n4. Analysiere Kapitel-Inhalt...")
                    div_response = requests.get(div_url)
                    div_soup = BeautifulSoup(div_response.content, 'html.parser')
                    
                    # Extrahiere Text
                    title_elem = div_soup.find('h1')
                    if title_elem:
                        print(f"Kapitel-Titel: {title_elem.get_text(strip=True)}")
                    
                    # Finde Haupttext
                    paragraphs = div_soup.find_all('p')
                    print(f"Absätze gefunden: {len(paragraphs)}")
                    
                    if paragraphs:
                        first_p = paragraphs[0].get_text(strip=True)
                        print(f"Erster Absatz (erste 200 Zeichen):")
                        print(f"  {first_p[:200]}...")
                    
                    # Suche nach Fußnoten
                    footnotes = div_soup.find_all(class_=re.compile(r'footnote|note'))
                    if not footnotes:
                        footnotes = div_soup.find_all('sup')
                    print(f"Fußnoten gefunden: {len(footnotes)}")
                    
                    # Zeige HTML-Struktur
                    print(f"\nHTML-Struktur (erste 500 Zeichen):")
                    print(str(div_soup)[:500] + "...")
                    
                    break
            break

if __name__ == '__main__':
    analyze_bkv()
