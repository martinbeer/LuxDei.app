import re

def clean_marker(text):
    # Entferne ALLE bekannten Quadro-Bibel-Marker (sicheres Regex)
    text = re.sub(r"\s*\]//ESyn0812/<t>\s*\$ŽT:\/\/ESyn0812\/Nr\. \d+\s*\$ŽG:\/\/ESyn0812/\s*", "", text)
    text = re.sub(r"\$ŽT:\/\/ESyn0812\/Nr\. \d+", "", text)
    text = re.sub(r"\$ŽG:\/\/ESyn0812\/", "", text)
    text = re.sub(r"//ESyn0812/.*?(?=,|$)", "", text)
    # Entferne komplett leere Klammer-Zeilen [] oder leere Felder
    text = re.sub(r"\[\]", "", text)
    text = text.strip(' ;,')
    return text.strip()

import csv

with open("bibelverse_einheitsuebersetzung.csv", encoding="utf-8") as fin, \
     open("bibelverse_einheitsuebersetzung_CLEAN.csv", "w", encoding="utf-8", newline="") as fout:
    reader = csv.reader(fin)
    writer = csv.writer(fout)
    for i, row in enumerate(reader):
        if i == 0:
            writer.writerow(row)
            continue
        row[-1] = clean_marker(row[-1])
        writer.writerow(row)

print("Fertig! Neue Datei: bibelverse_einheitsuebersetzung_CLEAN.csv")
