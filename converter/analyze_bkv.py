import requests
from bs4 import BeautifulSoup

# Analysiere die Hauptseite
url = 'https://bkv.unifr.ch/de/works'
response = requests.get(url)
soup = BeautifulSoup(response.content, 'html.parser')

# Finde spezifische Werk-Links und analysiere deren Struktur
work_links = []
for link in soup.find_all('a', href=True):
    href = link['href']
    text = link.get_text(strip=True)
    if '/works/' in href and 'deutsch' in text.lower():
        work_links.append({'href': href, 'text': text})

print(f'Gefunden: {len(work_links)} deutsche Werke')
print('Erste 10 Beispiele:')
for i, work in enumerate(work_links[:10]):
    print(f'{i+1}. URL: {work["href"]}')
    print(f'   Text: {work["text"]}')
    print()

# Analysiere ein spezifisches Werk um die Autor-Information zu finden
if work_links:
    test_url = 'https://bkv.unifr.ch' + work_links[0]['href']
    print(f'Analysiere Testseite: {test_url}')
    
    test_response = requests.get(test_url)
    test_soup = BeautifulSoup(test_response.content, 'html.parser')
    
    print('Alle h1, h2, h3 Überschriften:')
    for tag in ['h1', 'h2', 'h3']:
        elements = test_soup.find_all(tag)
        for elem in elements:
            print(f'{tag}: {elem.get_text(strip=True)}')
    
    print('\nBreadcrumb-Navigation:')
    breadcrumbs = test_soup.find_all('a', href=True)
    for bc in breadcrumbs[:10]:
        if '/authors/' in bc.get('href', ''):
            print(f'Autor-Link: {bc.get_text(strip=True)} -> {bc["href"]}')
