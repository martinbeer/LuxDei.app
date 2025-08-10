import os
import csv
import re
from bs4 import BeautifulSoup

# Passe deinen Basisordner an (darin die Unterordner "nt" und "ot")
base_folder = r'C:\Coding\LuxDei\lib\Schoeningh-RoundtripHTML'
output_csv = "bibelverse_schoeningh.csv"

def clean_text(text):
    # Entferne ESyn0812/Quadro-Bibel-Marker & alle komischen Marker
    text = re.sub(r'[\[\]]?//ESyn0812/.*?(?=[,"]|$)', '', text)
    text = re.sub(r'\$Ž[TG]:\/\/ESyn0812\/Nr\.\s*\d+\s*\$ŽG:\/\/ESyn0812/', '', text)
    text = re.sub(r'\$Ž[TG]:\/\/ESyn0812\/', '', text)
    text = re.sub(r'//ESyn0812/.*?\s*', '', text)
    text = re.sub(r'\s{2,}', ' ', text)
    # Entferne doppelte Satzzeichen oder überstehende Leerzeichen
    text = re.sub(r'(\. )+', '. ', text)
    text = text.strip(' ,;\t\r\n')
    # Entferne eckige Klammern, falls übrig
    text = text.replace('[', '').replace(']', '')
    return text.strip()

def get_buch_chapter_from_filename(filename):
    # Beispiel: "1.Joh_2.html" → ("1.Joh", 2)
    name = os.path.splitext(filename)[0]
    if "_" in name:
        buch, kapitel = name.split("_")
        return buch, int(kapitel)
    else:
        return name, 1

with open(output_csv, "w", encoding="utf-8", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["testament", "buch", "kapitel", "vers", "text"])

    for testament_folder in ["nt", "ot"]:
        folder_path = os.path.join(base_folder, testament_folder)
        if not os.path.isdir(folder_path):
            print(f"Ordner nicht gefunden: {folder_path}")
            continue
        testament = "NT" if testament_folder == "nt" else "OT"
        print(f"Verarbeite {testament}-Ordner...")

        for filename in sorted(os.listdir(folder_path)):
            if not filename.endswith(".html"):
                continue
            buch, kapitel = get_buch_chapter_from_filename(filename)
            with open(os.path.join(folder_path, filename), encoding="utf-8") as f:
                soup = BeautifulSoup(f, "html.parser")
            verses = soup.select("div.biblehtmlcontent.verses div.v")
            for v in verses:
                vn = v.find("span", class_="vn")
                if not vn:
                    continue
                try:
                    vers = int(vn.get_text(strip=True))
                except Exception:
                    continue
                # Entferne Versnummern & Fußnoten
                for span in v.find_all("span", class_="vn"):
                    span.decompose()
                for sup in v.find_all("sup"):
                    sup.decompose()
                # Entferne Überschriften im Vers (h2, h3, h4)  
                for tag in v.find_all(['h2','h3','h4']):
                    tag.decompose()
                # Hole Text und reinige
                text = v.get_text(separator=" ", strip=True)
                text = clean_text(text)
                if not text:
                    continue
                writer.writerow([testament, buch, kapitel, vers, text])
print(f"Fertig! Exportiert nach {output_csv}")
