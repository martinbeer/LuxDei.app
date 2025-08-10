const fs = require('fs');
const path = require('path');

// Umlaut-Ersetzungstabelle
const umlautMap = {
  'ä': 'ae',
  'ö': 'oe',
  'ü': 'ue',
  'Ä': 'Ae',
  'Ö': 'Oe',
  'Ü': 'Ue',
  'ß': 'ss',
  'Ã¤': 'ae',  // UTF-8 encoding problem für ä
  'Ã¶': 'oe',  // UTF-8 encoding problem für ö
  'Ã¼': 'ue',  // UTF-8 encoding problem für ü
  'ÃŸ': 'ss',  // UTF-8 encoding problem für ß
  'Ã„': 'Ae',  // UTF-8 encoding problem für Ä
  'Ã–': 'Oe',  // UTF-8 encoding problem für Ö
  'Ãœ': 'Ue',  // UTF-8 encoding problem für Ü
  '÷': 'oe',   // Spezielle Zeichen die als ö interpretiert werden sollen
  'õ': 'oe'    // Spezielle Zeichen die als ö interpretiert werden sollen
};

function replaceUmlauts(text) {
  let result = text;
  for (const [umlaut, replacement] of Object.entries(umlautMap)) {
    result = result.replace(new RegExp(umlaut, 'g'), replacement);
  }
  return result;
}

function convertCSV(inputFile, outputFile) {
  console.log(`Converting ${inputFile} to ${outputFile}...`);
  
  try {
    // Lese die CSV-Datei
    const csvContent = fs.readFileSync(inputFile, 'utf8');
    const lines = csvContent.split('\n');
    
    console.log(`Found ${lines.length} lines in CSV`);
    
    const convertedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      if (i === 0) {
        // Header-Zeile unverändert übernehmen
        convertedLines.push(line);
        continue;
      }
      
      // Parse die CSV-Zeile
      const parts = line.split(',');
      if (parts.length >= 4) {
        // Nur die Buch-Spalte (erste Spalte) konvertieren
        const originalBook = parts[0];
        const convertedBook = replaceUmlauts(originalBook);
        
        // Zeige Änderungen an
        if (originalBook !== convertedBook) {
          console.log(`Converting: "${originalBook}" -> "${convertedBook}"`);
        }
        
        // Neue Zeile zusammenbauen
        parts[0] = convertedBook;
        convertedLines.push(parts.join(','));
      } else {
        // Zeile unverändert übernehmen wenn Format nicht stimmt
        convertedLines.push(line);
      }
    }
    
    // Schreibe die konvertierte CSV-Datei
    const convertedContent = convertedLines.join('\n');
    fs.writeFileSync(outputFile, convertedContent, 'utf8');
    
    console.log(`Successfully converted ${lines.length - 1} verses`);
    console.log(`Output written to: ${outputFile}`);
    
    // Zeige Statistiken
    const uniqueOriginalBooks = [...new Set(lines.slice(1).map(line => line.split(',')[0]))];
    const uniqueConvertedBooks = [...new Set(convertedLines.slice(1).map(line => line.split(',')[0]))];
    
    console.log(`\nOriginal unique books: ${uniqueOriginalBooks.length}`);
    console.log(`Converted unique books: ${uniqueConvertedBooks.length}`);
    
    console.log('\nConverted book names:');
    uniqueConvertedBooks.sort().forEach((book, index) => {
      console.log(`${index + 1}. ${book}`);
    });
    
  } catch (error) {
    console.error('Error converting CSV:', error);
  }
}

// Konvertiere die Allioli CSV-Datei
const inputFile = path.join(__dirname, 'bibelverse_allioli.csv');
const outputFile = path.join(__dirname, 'bibelverse_allioli_clean.csv');

convertCSV(inputFile, outputFile);
