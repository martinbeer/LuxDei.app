import requests
from bs4 import BeautifulSoup

url = 'https://bkv.unifr.ch/works/cpg-2001/versions/athan-arii-deposito-swkv/divisions'
response = requests.get(url)
soup = BeautifulSoup(response.content, 'html.parser')

# Alle Links mit ihren Texten
links = soup.find_all('a', href=True)
print('All relevant links:')
for i, link in enumerate(links):
    href = link['href']
    text = link.get_text(strip=True)
    if text and ('chapter' in href or 'section' in href or 'division' in href):
        print(f'{i+1}. Text: "{text}" -> {href}')

# Falls keine chapter/section links, dann alle Links zeigen
if not [link for link in links if any(term in link['href'] for term in ['chapter', 'section', 'division'])]:
    print('\nNo chapter/section links found. All links:')
    for i, link in enumerate(links[:10]):
        href = link['href']
        text = link.get_text(strip=True)
        if text:
            print(f'{i+1}. Text: "{text}" -> {href}')
