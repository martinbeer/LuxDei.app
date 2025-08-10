import os
import csv
import requests
from bs4 import BeautifulSoup
from datetime import datetime

BASE_URL = "https://bkv.unifr.ch"
WORKS_URL = f"{BASE_URL}/de/works"
OUTPUT_DIR = "kirchenväter-auto"

# Hilfsfunktion für saubere Dateinamen
def safe_filename(name):
    return "".join(c for c in name if c.isalnum() or c in (" ", "-", "_")).rstrip().replace(" ", "_")

# Hauptfunktion zum Scrapen und Speichern

def scrape_and_save_deutsche_werke():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    print("Lade Hauptseite der Werke...")
    resp = requests.get(WORKS_URL)
    soup = BeautifulSoup(resp.content, "html.parser")

    # Noch robustere Extraktion: Suche ALLE <a href="/works/..."> im gesamten HTML
    work_links = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/works/") and not href.endswith("#"):
            work_links.append(BASE_URL + href)
    work_links = list(set(work_links))
    print(f"Gefundene Werke: {len(work_links)}")

    # Debug: Wenn keine Werke gefunden wurden, versuche es mit Selenium (JS-Rendering)
    if len(work_links) == 0:
        print("WARNUNG: Keine Werke gefunden! Versuche es mit Selenium...")
        try:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            chrome_options = Options()
            chrome_options.add_argument('--headless')
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            driver = webdriver.Chrome(options=chrome_options)
            driver.get(WORKS_URL)
            html = driver.page_source
            driver.quit()
            soup = BeautifulSoup(html, "html.parser")
            work_links = []
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if href.startswith("/works/") and not href.endswith("#"):
                    work_links.append(BASE_URL + href)
            work_links = list(set(work_links))
            print(f"[Selenium] Gefundene Werke: {len(work_links)}")
            if len(work_links) == 0:
                print("[Selenium] WARNUNG: Immer noch keine Werke gefunden! Dump der ersten 2000 Zeichen HTML:")
                print(soup.prettify()[:2000])
        except Exception as e:
            print(f"Selenium-Fehler: {e}\nBitte stelle sicher, dass selenium und ein ChromeDriver installiert sind.")


    # Für jedes Werk Metadaten und Text extrahieren
    all_rows = []
    for i, work_url in enumerate(work_links):
        print(f"[{i+1}/{len(work_links)}] {work_url}")
        try:
            wresp = requests.get(work_url)
            wsoup = BeautifulSoup(wresp.content, "html.parser")

            # Autor und Werkdaten
            author = wsoup.find("h2")
            author_name = author.get_text(strip=True) if author else ""
            cpg = ""
            cpg_tag = wsoup.find(string=lambda t: t and "CPG" in t)
            if cpg_tag:
                cpg = cpg_tag.strip().replace("CPG", "").strip()
            title_tag = wsoup.find("h3")
            work_title = title_tag.get_text(strip=True) if title_tag else ""
            desc_tag = wsoup.find("div", class_="work-description")
            description = desc_tag.get_text(strip=True) if desc_tag else ""

            # Suche nach deutscher BKV-Version (nur eine pro Werk, keine Dubletten)
            version_links = []
            for a in wsoup.find_all("a", href=True):
                # Nur BKV, nur deutschsprachige Versionen
                if "/versions/" in a["href"] and ("bkv" in a["href"] and ("deutsch" in a.get_text(strip=True).lower() or "bkv" in a.get_text(strip=True).lower())):
                    version_links.append(BASE_URL + a["href"])
            version_links = list(set(version_links))
            if not version_links:
                continue  # Kein deutscher Text vorhanden

            for vurl in version_links:
                vresp = requests.get(vurl)
                vsoup = BeautifulSoup(vresp.content, "html.parser")
                # Gliederung (Abschnitts-Links)
                division_links = []
                for a in vsoup.find_all("a", href=True):
                    if "/divisions/" in a["href"]:
                        division_links.append(BASE_URL + a["href"])
                division_links = list(set(division_links))
                if not division_links:
                    # Falls keine Unterteilung, dann Hauptseite als einziger Abschnitt
                    division_links = [vurl]

                for durl in division_links:
                    dresp = requests.get(durl)
                    dsoup = BeautifulSoup(dresp.content, "html.parser")
                    # Abschnittstitel (nur erster h1/h2/h3/h4 nach <main> oder im Hauptbereich)
                    main = dsoup.find("main")
                    div_title = ""
                    if main:
                        for tag in ["h1", "h2", "h3", "h4"]:
                            t = main.find(tag)
                            if t:
                                div_title = t.get_text(strip=True)
                                break
                    if not div_title:
                        div_title = dsoup.find(["h1", "h2", "h3", "h4"]).get_text(strip=True) if dsoup.find(["h1", "h2", "h3", "h4"]) else ""

                    # Nur den eigentlichen Abschnittstext extrahieren (ohne Navigation, ohne Menüs)
                    # Suche nach <main> oder dem größten <div> mit viel Text
                    text = ""
                    if main:
                        paragraphs = main.find_all(["p", "div"], recursive=True)
                        text = "\n".join(p.get_text(" ", strip=True) for p in paragraphs if p.get_text(strip=True))
                    else:
                        # Fallback: alle <p> im Body
                        paragraphs = dsoup.find_all("p")
                        text = "\n".join(p.get_text(" ", strip=True) for p in paragraphs if p.get_text(strip=True))

                    # Fußnoten extrahieren (nur <li id="fn:...">)
                    footnotes = []
                    for fn in dsoup.find_all("li", id=lambda x: x and x.startswith("fn:")):
                        fn_num = fn.get("id", "").replace("fn:", "")
                        fn_text = fn.get_text(" ", strip=True)
                        footnotes.append((fn_num, fn_text))

                    # Update-Datum (falls vorhanden)
                    update_date = ""
                    meta = dsoup.find("meta", {"property": "article:modified_time"})
                    if meta:
                        update_date = meta.get("content", "")

                    # Nur Zeilen mit Text speichern
                    if text.strip():
                        row = {
                            "author_name": author_name,
                            "work_cpg_number": cpg,
                            "work_title": work_title,
                            "work_description": description,
                            "division_title": div_title,
                            "division_url": durl,
                            "text_content": text,
                            "footnotes": " | ".join(f"{n}: {t}" for n, t in footnotes),
                            "update_date": update_date
                        }
                        all_rows.append(row)
        except Exception as e:
            print(f"Fehler bei {work_url}: {e}")
            continue

    # Schreibe alles in eine CSV
    out_csv = os.path.join(OUTPUT_DIR, "bkv_deutsche_werke_flat.csv")
    with open(out_csv, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "author_name", "work_cpg_number", "work_title", "work_description",
            "division_title", "division_url", "text_content", "footnotes", "update_date"
        ])
        writer.writeheader()
        for row in all_rows:
            writer.writerow(row)
    print(f"Fertig! {len(all_rows)} Abschnitte gespeichert in {out_csv}")

if __name__ == "__main__":
    scrape_and_save_deutsche_werke()
