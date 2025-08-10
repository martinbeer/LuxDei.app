import xml.etree.ElementTree as ET
import csv

# Datei-Pfade anpassen!
xml_file = r"C:\Coding\LuxDei\lib\SF_2020-02-04_DEU_ALLIOLI_ARNDT_1914_NUR_BIBELTEXT_ALTE_PSALMENNR_DEUTSCH.xml"
csv_file = "bibelverse_allioli.csv"

tree = ET.parse(xml_file)
root = tree.getroot()

with open(csv_file, mode="w", newline='', encoding="utf-8") as out_csv:
    writer = csv.writer(out_csv)
    writer.writerow(["Buch", "Kapitel", "Vers", "Text"])  # Header

    # Durch alle Bücher, Kapitel und Verse gehen
    for biblebook in root.findall("BIBLEBOOK"):
        buch = biblebook.attrib.get("bname")  # Deutscher Name
        for chapter in biblebook.findall("CHAPTER"):
            kapitel = chapter.attrib.get("cnumber")
            for vers in chapter.findall("VERS"):
                vers_nr = vers.attrib.get("vnumber")
                text = vers.text.strip() if vers.text else ""
                writer.writerow([buch, kapitel, vers_nr, text])
