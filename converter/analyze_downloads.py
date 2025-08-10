import requests
from bs4 import BeautifulSoup
import re
import time

BASE_URL = "https://bkv.unifr.ch"

def analyze_download_structure():
    """Analysiere die Download-Struktur der BKV-Website"""
    
    # Sammle eine Stichprobe von Werkseiten
    works_url = f"{BASE_URL}/de/works"
    response = requests.get(works_url)
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # Finde alle Werk-Links
    work_links = []
    for link in soup.find_all('a', href=True):
        href = link['href']
        text = link.get_text(strip=True)
        if '/works/' in href and len(text) > 10:  # Längere Texte sind wahrscheinlich Werktitel
            work_links.append({'href': href, 'text': text})
    
    print(f"Gefunden: {len(work_links)} potenzielle Werke")
    
    # Analysiere eine Stichprobe von Werkseiten
    download_patterns = {}
    
    for i, work in enumerate(work_links[:20]):  # Erste 20 Werke analysieren
        print(f"\nAnalysiere Werk {i+1}: {work['text']}")
        
        full_url = BASE_URL + work['href'] if work['href'].startswith('/') else work['href']
        
        try:
            work_response = requests.get(full_url)
            work_soup = BeautifulSoup(work_response.content, 'html.parser')
            
            # Suche nach Download-Links
            download_links = []
            for link in work_soup.find_all('a', href=True):
                href = link['href']
                text = link.get_text(strip=True).lower()
                
                # Prüfe auf Download-Formate
                if any(fmt in href.lower() for fmt in ['epub', 'pdf', 'docx', 'rtf']):
                    download_links.append({'href': href, 'text': text, 'format': 'direct'})
                elif any(word in text for word in ['download', 'herunterladen', 'pdf', 'epub', 'docx', 'rtf']):
                    download_links.append({'href': href, 'text': text, 'format': 'text'})
            
            if download_links:
                print(f"  Gefundene Download-Links: {len(download_links)}")
                for dl in download_links:
                    print(f"    {dl['format']}: {dl['text']} -> {dl['href']}")
            else:
                print("  Keine Download-Links gefunden")
                
                # Suche nach Versionen oder anderen Formaten
                versions = work_soup.find_all('a', href=True)
                version_links = []
                for link in versions:
                    href = link['href']
                    text = link.get_text(strip=True)
                    if '/versions/' in href:
                        version_links.append({'href': href, 'text': text})
                
                if version_links:
                    print(f"  Gefundene Versionen: {len(version_links)}")
                    for v in version_links[:3]:  # Nur erste 3 zeigen
                        print(f"    {v['text']} -> {v['href']}")
        
        except Exception as e:
            print(f"  Fehler beim Analysieren: {e}")
        
        time.sleep(1)  # Höflich sein
    
    return download_patterns

def analyze_specific_work_page(work_url):
    """Analysiere eine spezifische Werkseite detailliert"""
    
    print(f"\nDetaillierte Analyse von: {work_url}")
    
    try:
        response = requests.get(work_url)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        print("\nAlle Links auf der Seite:")
        for link in soup.find_all('a', href=True):
            href = link['href']
            text = link.get_text(strip=True)
            if text and len(text) > 2:
                print(f"  {text} -> {href}")
        
        print("\nAlle Text-Elemente mit 'download' oder Format-Keywords:")
        page_text = soup.get_text().lower()
        for keyword in ['download', 'pdf', 'epub', 'docx', 'rtf', 'herunterladen']:
            if keyword in page_text:
                print(f"  Keyword '{keyword}' gefunden")
        
        # Suche nach versteckten Download-Links in JavaScript oder anderen Elementen
        scripts = soup.find_all('script')
        for script in scripts:
            if script.string and any(fmt in script.string.lower() for fmt in ['pdf', 'epub', 'docx', 'rtf']):
                print(f"  Format-Keyword in Script gefunden: {script.string[:200]}...")
        
    except Exception as e:
        print(f"Fehler: {e}")

if __name__ == "__main__":
    # Hauptanalyse
    analyze_download_structure()
    
    # Detailanalyse einer spezifischen Seite
    analyze_specific_work_page("https://bkv.unifr.ch/de/works/cpg-2101")
