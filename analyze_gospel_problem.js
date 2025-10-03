// Gospel Debug - Test verschiedener möglicher Probleme

console.log('=== GOSPEL PROBLEM ANALYSIS ===\n');

// 1. Test: Gospel reference format
console.log('1. GOSPEL REFERENCE FORMATS:');
const sampleGospelRefs = [
  "Mt 5, 1-12a",
  "Evangelium nach Mt 5, 1-12a", 
  "Lk 10, 25-37",
  "Joh 3, 16-17"
];

for (const ref of sampleGospelRefs) {
  console.log(`Reference: "${ref}"`);
  
  // Clean up (same logic as in app)
  let cleaned = ref
    .replace(/^vgl\.\s*/i, '') 
    .replace(/^(Lesung aus|Evangelium nach|Psalm)\s+/i, '') 
    .trim();
  
  console.log(`Cleaned: "${cleaned}"`);
  
  // Match pattern
  const match = cleaned.match(/^(.+?)\s+(\d+)[,:]\s*(.+)$/);
  if (match) {
    const [, bookAbbr, chapter, versesRaw] = match;
    console.log(`Parsed: book="${bookAbbr}", chapter=${chapter}, verses="${versesRaw}"`);
  } else {
    console.log('❌ No match!');
  }
  console.log('');
}

// 2. Test: Book mapping
console.log('2. BOOK MAPPING:');
const mapBookAbbreviation = (abbr) => {
  const bookMappings = {
    'Mt': 'Matthäus', 'Mk': 'Markus', 'Lk': 'Lukas', 'Joh': 'Johannes'
  };
  return bookMappings[abbr] || abbr;
};

const getDatabaseBookName = (appBookName, tableName) => {
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
  
  const mapping = bookNameMapping[appBookName];
  return mapping ? mapping[tableName] : null;
};

const gospelAbbrevs = ['Mt', 'Mk', 'Lk', 'Joh'];
const tables = [
  { name: 'Allioli', table: 'bibelverse' },
  { name: 'Schöningh', table: 'bibelverse_schoenigh' },
  { name: 'Einheit', table: 'bibelverse_einheit' }
];

for (const abbr of gospelAbbrevs) {
  const fullName = mapBookAbbreviation(abbr);
  console.log(`${abbr} -> ${fullName}`);
  
  for (const {name, table} of tables) {
    const dbName = getDatabaseBookName(fullName, table);
    console.log(`  ${name}: ${dbName}`);
  }
  console.log('');
}

// 3. Test: Testament detection problem
console.log('3. TESTAMENT DETECTION:');
const testTestamentDetection = (databaseBookName) => {
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
  
  const inAbbr = newTestamentAbbr.has(databaseBookName);
  const inFull = newTestamentFullNames.has(databaseBookName);
  const isNewTestament = inAbbr || inFull;
  
  return { inAbbr, inFull, isNewTestament };
};

const allGospelDbNames = [
  'Mt', 'Mk', 'Lk', 'Joh',
  'Matthaeusevangelium', 'Markusevangelium', 'Lukasevangelium', 'Johannesevangelium'
];

for (const dbName of allGospelDbNames) {
  const result = testTestamentDetection(dbName);
  console.log(`${dbName}:`);
  console.log(`  In abbreviations: ${result.inAbbr}`);
  console.log(`  In full names: ${result.inFull}`);
  console.log(`  Detected as NT: ${result.isNewTestament}`);
  console.log('');
}

console.log('=== POTENTIAL PROBLEMS ===');
console.log('1. Matthaeusevangelium (ae instead of ä) not in newTestamentFullNames!');
console.log('2. If Gospel readings use specific formatting, parsing might fail');
console.log('3. Database might not have Gospel data for selected translation');
console.log('4. Column names might be different (buch vs book, kapitel vs chapter)');