// Vollständiger Test des Gospel-Parsing-Flows
console.log('=== COMPLETE GOSPEL PARSING FLOW TEST ===\n');

// 1. Parse Gospel Reference
const parseBibleReference = (reference) => {
  if (!reference) return null;
  
  let cleaned = reference
    .replace(/^vgl\.\s*/i, '') 
    .replace(/^(Lesung aus|Evangelium nach|Psalm)\s+/i, '') 
    .trim();
  
  cleaned = cleaned.replace(/[–—−]/g, '-');
  console.log('1. Cleaned reference:', cleaned);
  
  const parts = cleaned.split(';');
  const allReferences = [];
  
  for (let part of parts) {
    part = part.trim();
    const match = part.match(/^(.+?)\s+(\d+)[,:]\s*(.+)$/);
    if (match) {
      const [, bookAbbr, chapter, versesRaw] = match;
      const abbrNorm = bookAbbr.replace(/\.$/, '').trim();
      const fullBookName = mapBookAbbreviation(abbrNorm);
      let verses = (versesRaw || '').replace(/[–—−]/g, '-');
      verses = verses.replace(/\s*-\s*/g, '-');
      verses = verses.replace(/,\s*/g, ', ');
      
      console.log('2. Book mapping:', abbrNorm, '->', fullBookName);
      
      if (fullBookName) {
        allReferences.push({
          book: fullBookName,
          chapter: parseInt(chapter),
          verses: verses.trim()
        });
      }
    }
  }
  
  return allReferences;
};

const mapBookAbbreviation = (abbr) => {
  const bookMappings = {
    'Mt': 'Matthäus', 'Mk': 'Markus', 'Lk': 'Lukas', 'Joh': 'Johannes'
  };
  return bookMappings[abbr] || abbr;
};

// 3. Database Name Mapping
const bookNameMapping = {
  'Matthäus': {
    'bibelverse': 'Matthaeusevangelium',
    'bibelverse_schoenigh': 'Mt',
    'bibelverse_einheit': 'Mt'
  },
  'Markus': {
    'bibelverse': 'Markusevangelium',
    'bibelverse_schoenigh': 'Mk',
    'bibelverse_einheit': 'Mk'
  },
  'Lukas': {
    'bibelverse': 'Lukasevangelium',
    'bibelverse_schoenigh': 'Lk',
    'bibelverse_einheit': 'Lk'
  },
  'Johannes': {
    'bibelverse': 'Johannesevangelium',
    'bibelverse_schoenigh': 'Joh',
    'bibelverse_einheit': 'Joh'
  }
};

const getDatabaseBookName = (appBookName, tableName) => {
  const mapping = bookNameMapping[appBookName];
  if (!mapping) {
    console.warn(`❌ No mapping found for book: ${appBookName}`);
    return null;
  }
  
  const databaseName = mapping[tableName];
  if (!databaseName) {
    console.warn(`❌ No database name found for book: ${appBookName} in table: ${tableName}`);
    return null;
  }
  
  return databaseName;
};

// 4. Testament Detection
const detectTestament = (databaseBookName, tableName) => {
  if (tableName === 'bibelverse') {
    return 'NO_TESTAMENT_FIELD'; // Allioli hat kein Testament-Feld
  }
  
  const newTestamentAbbr = new Set([
    'Mt','Mk','Lk','Joh','Apg','Röm','1Kor','2Kor','Gal','Eph','Phil','Kol',
    '1Thess','2Thess','1Tim','2Tim','Tit','Phlm','Hebr','Jak','1Petr','2Petr',
    '1Joh','2Joh','3Joh','Jud','Offb'
  ]);
  const newTestamentFullNames = new Set([
    'Matthäusevangelium','Markusevangelium','Lukasevangelium','Johannesevangelium','Apostelgeschichte',
    'Römerbrief','1. Korintherbrief','2. Korintherbrief','Galaterbrief','Epheserbrief','Philipperbrief',
    'Kolosserbrief','1. Thessalonicherbrief','2. Thessalonicherbrief','1. Timotheusbrief','2. Timotheusbrief',
    'Titusbrief','Philemonbrief','Hebräerbrief','Jakobusbrief','1. Petrusbrief','2. Petrusbrief',
    '1. Johannesbrief','2. Johannesbrief','3. Johannesbrief','Judasbrief','Offenbarung des Johannes'
  ]);
  
  const isNewTestament = newTestamentAbbr.has(databaseBookName) || newTestamentFullNames.has(databaseBookName);
  return isNewTestament ? 'NT' : 'OT';
};

// FULL FLOW TEST
const testReference = "Mt 5, 1-12a";
const translations = [
  { name: 'Allioli-Arndt', table: 'bibelverse' },
  { name: 'Schöningh', table: 'bibelverse_schoenigh' },
  { name: 'Einheitsübersetzung', table: 'bibelverse_einheit' }
];

console.log(`Testing reference: "${testReference}"\n`);

const references = parseBibleReference(testReference);
console.log('3. Parsed references:', references);

if (references && references.length > 0) {
  const ref = references[0];
  console.log(`\n4. Testing database queries for: ${ref.book} ${ref.chapter}:${ref.verses}\n`);
  
  for (const translation of translations) {
    console.log(`--- ${translation.name} (${translation.table}) ---`);
    
    const databaseBookName = getDatabaseBookName(ref.book, translation.table);
    console.log(`Database book name: ${databaseBookName}`);
    
    if (databaseBookName) {
      const testament = detectTestament(databaseBookName, translation.table);
      console.log(`Testament: ${testament}`);
      
      // Simulate query construction
      console.log('Query would be:');
      console.log(`  SELECT * FROM ${translation.table}`);
      console.log(`  WHERE buch = '${databaseBookName}'`);
      console.log(`  AND kapitel = ${ref.chapter}`);
      console.log(`  AND vers >= 1 AND vers <= 12`);
      if (testament !== 'NO_TESTAMENT_FIELD') {
        console.log(`  AND testament = '${testament}'`);
      }
    }
    console.log('');
  }
}