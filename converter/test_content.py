import requests
from bs4 import BeautifulSoup

# Test a specific text page
url = 'https://bkv.unifr.ch/works/cpg-2001/versions/athan-arii-deposito-swkv/divisions/1'
response = requests.get(url)
soup = BeautifulSoup(response.content, 'html.parser')

print(f'Status: {response.status_code}')
print(f'Title: {soup.find("title").get_text() if soup.find("title") else "No title"}')

# Find main content area
main_content = soup.find('main') or soup.find('div', class_='content') or soup.find('article')

if main_content:
    print('Found main content area')
    # Get all text from main content
    paragraphs = main_content.find_all('p')
    print(f'Paragraphs in main content: {len(paragraphs)}')
    for i, p in enumerate(paragraphs[:3]):
        text = p.get_text(strip=True)
        print(f'P{i+1}: {text[:100]}...')
else:
    print('No main content found, trying all paragraphs')
    paragraphs = soup.find_all('p')
    print(f'All paragraphs: {len(paragraphs)}')
    for i, p in enumerate(paragraphs[:5]):
        text = p.get_text(strip=True)
        if len(text) > 20:
            print(f'P{i+1}: {text[:100]}...')
