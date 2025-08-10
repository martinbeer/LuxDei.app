#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import csv
import os

def convert_umlauts_in_books(input_file, output_file):
    """
    Konvertiert Umlaute in der Bücher-Spalte einer CSV-Datei.
    Lässt den Text unverändert, ersetzt aber Umlaute in Buchnamen.
    """
    
    # Mapping für Umlaute zu normalen Buchstaben
    umlaut_mapping = {
        'ä': 'ae',
        'ö': 'oe', 
        'ü': 'ue',
        'Ä': 'Ae',
        'Ö': 'Oe',
        'Ü': 'Ue',
        'ß': 'ss',
        # Für bereits vorhandene Encoding-Probleme
        'Ã¤': 'ae',
        'Ã¶': 'oe',
        'Ã¼': 'ue',
        'Ã„': 'Ae',
        'Ã–': 'Oe',
        'Ãœ': 'Ue',
        'Ã¼': 'ue',
        'Ã¶': 'oe',
        'Ã¤': 'ae',
        'Ã': 'Ae',
        'Ã¶': 'oe',
        'Ã¼': 'ue',
        'Ã¤': 'ae',
        'Ã': 'ss',
        'Ã¶': 'oe',
        'Ã¤': 'ae',
        'Ã¼': 'ue',
        'Ã¤': 'ae',
        'Ã¶': 'oe',
        'Ã¼': 'ue',
        'Ã¤': 'ae',
        'Ã¶': 'oe',
        'Ã¼': 'ue',
        'Ã¤': 'ae',
        'Ã¶': 'oe',
        'Ã¼': 'ue'
    }
    
    def replace_umlauts_in_text(text):
        """Ersetzt Umlaute in einem Text"""
        for umlaut, replacement in umlaut_mapping.items():
            text = text.replace(umlaut, replacement)
        return text
    
    # Datei lesen und konvertieren
    converted_rows = []
    
    try:
        with open(input_file, 'r', encoding='utf-8') as infile:
            reader = csv.reader(infile)
            
            # Header lesen
            header = next(reader)
            converted_rows.append(header)
            
            # Daten verarbeiten
            for row in reader:
                if len(row) >= 4:  # buch, kapitel, vers, text
                    # Nur die Bücher-Spalte (Index 0) konvertieren
                    converted_book = replace_umlauts_in_text(row[0])
                    
                    # Neue Zeile mit konvertiertem Buchnamen erstellen
                    new_row = [converted_book] + row[1:]
                    converted_rows.append(new_row)
                else:
                    # Zeile unverändert übernehmen, falls Format nicht stimmt
                    converted_rows.append(row)
    
    except UnicodeDecodeError:
        print("UTF-8 Fehler, versuche mit latin-1 Encoding...")
        with open(input_file, 'r', encoding='latin-1') as infile:
            reader = csv.reader(infile)
            
            # Header lesen
            header = next(reader)
            converted_rows.append(header)
            
            # Daten verarbeiten
            for row in reader:
                if len(row) >= 4:  # buch, kapitel, vers, text
                    # Nur die Bücher-Spalte (Index 0) konvertieren
                    converted_book = replace_umlauts_in_text(row[0])
                    
                    # Neue Zeile mit konvertiertem Buchnamen erstellen
                    new_row = [converted_book] + row[1:]
                    converted_rows.append(new_row)
                else:
                    # Zeile unverändert übernehmen, falls Format nicht stimmt
                    converted_rows.append(row)
    
    # Konvertierte Daten in neue Datei schreiben
    with open(output_file, 'w', encoding='utf-8', newline='') as outfile:
        writer = csv.writer(outfile)
        writer.writerows(converted_rows)
    
    print(f"Konvertierung abgeschlossen!")
    print(f"Eingabedatei: {input_file}")
    print(f"Ausgabedatei: {output_file}")
    print(f"Verarbeitete Zeilen: {len(converted_rows)}")

def show_book_changes(input_file, output_file):
    """Zeigt die Änderungen an den Buchnamen an"""
    print("\nÄnderungen an Buchnamen:")
    print("-" * 50)
    
    original_books = set()
    converted_books = set()
    
    # Originale Bücher lesen
    try:
        with open(input_file, 'r', encoding='utf-8') as infile:
            reader = csv.reader(infile)
            next(reader)  # Header überspringen
            for row in reader:
                if len(row) >= 1:
                    original_books.add(row[0])
    except UnicodeDecodeError:
        with open(input_file, 'r', encoding='latin-1') as infile:
            reader = csv.reader(infile)
            next(reader)  # Header überspringen
            for row in reader:
                if len(row) >= 1:
                    original_books.add(row[0])
    
    # Konvertierte Bücher lesen
    with open(output_file, 'r', encoding='utf-8') as infile:
        reader = csv.reader(infile)
        next(reader)  # Header überspringen
        for row in reader:
            if len(row) >= 1:
                converted_books.add(row[0])
    
    # Änderungen anzeigen
    original_list = sorted(list(original_books))
    converted_list = sorted(list(converted_books))
    
    changes = []
    for orig in original_list:
        # Finde entsprechende konvertierte Version
        for conv in converted_list:
            if orig != conv and orig.replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('Ä', 'Ae').replace('Ö', 'Oe').replace('Ü', 'Ue').replace('ß', 'ss').replace('Ã¤', 'ae').replace('Ã¶', 'oe').replace('Ã¼', 'ue').replace('Ã„', 'Ae').replace('Ã–', 'Oe').replace('Ãœ', 'Ue') == conv:
                changes.append((orig, conv))
                break
    
    if changes:
        for orig, conv in changes:
            print(f"'{orig}' -> '{conv}'")
    else:
        print("Keine Änderungen gefunden (möglicherweise waren bereits alle Umlaute konvertiert)")
    
    print(f"\nEindeutige Bücher vorher: {len(original_books)}")
    print(f"Eindeutige Bücher nachher: {len(converted_books)}")

if __name__ == "__main__":
    input_file = "bibelverse_allioli_clean.csv"
    output_file = "bibelverse_allioli_no_umlauts.csv"
    
    if not os.path.exists(input_file):
        print(f"Eingabedatei '{input_file}' nicht gefunden!")
        exit(1)
    
    # Konvertierung durchführen
    convert_umlauts_in_books(input_file, output_file)
    
    # Änderungen anzeigen
    show_book_changes(input_file, output_file)
