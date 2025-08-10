from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
import time

# Headless-Option (ohne sichtbares Browserfenster)
chrome_options = Options()
chrome_options.add_argument("--headless")

# Starte Browser
driver = webdriver.Chrome(options=chrome_options)
driver.get("https://bkv.unifr.ch/de/works")

# Warten, bis die Seite geladen ist (evtl. etwas erhöhen bei langsamen Internet)
time.sleep(5)

soup = BeautifulSoup(driver.page_source, 'html.parser')
base_url = "https://bkv.unifr.ch"

links = []
for entry in soup.find_all('div', class_='work'):
    if entry.find(string=lambda t: 'Übersetzung (Deutsch)' in t):
        a_tag = entry.find('a', href=True)
        if a_tag:
            link = base_url + a_tag['href']
            links.append(link)

for l in links:
    print(l)
print(f"\nGesamtzahl der deutschen Werke auf der Hauptseite: {len(links)}")

driver.quit()
