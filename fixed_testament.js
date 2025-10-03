// Fixed testament detection function
const isNewTestamentBook = (databaseBookName) => {
  // New Testament abbreviations 
  const newTestamentAbbr = new Set([
    'Mt','Mk','Lk','Joh','Apg','Röm','1Kor','2Kor','Gal','Eph','Phil','Kol',
    '1Thess','2Thess','1Tim','2Tim','Tit','Phlm','Hebr','Jak','1Petr','2Petr',
    '1Joh','2Joh','3Joh','Jud','Offb'
  ]);
  
  // New Testament full names - INCLUDING both ä and ae versions for Allioli!
  const newTestamentFullNames = new Set([
    'Matthäusevangelium','Matthaeusevangelium', // <-- BOTH VERSIONS!
    'Markusevangelium','Lukasevangelium','Johannesevangelium','Apostelgeschichte',
    'Römerbrief','1. Korintherbrief','2. Korintherbrief','Galaterbrief','Epheserbrief','Philipperbrief',
    'Kolosserbrief','1. Thessalonicherbrief','2. Thessalonicherbrief','1. Timotheusbrief','2. Timotheusbrief',
    'Titusbrief','Philemonbrief','Hebräerbrief','Jakobusbrief','1. Petrusbrief','2. Petrusbrief',
    '1. Johannesbrief','2. Johannesbrief','3. Johannesbrief','Judasbrief','Offenbarung des Johannes'
  ]);
  
  return newTestamentAbbr.has(databaseBookName) || newTestamentFullNames.has(databaseBookName);
};

// Test the fix
console.log('=== FIXED TESTAMENT DETECTION TEST ===');
const testBooks = [
  'Mt', 'Mk', 'Lk', 'Joh',
  'Matthaeusevangelium', 'Matthäusevangelium', 
  'Markusevangelium', 'Lukasevangelium', 'Johannesevangelium'
];

for (const book of testBooks) {
  const result = isNewTestamentBook(book);
  console.log(`${book}: ${result ? 'NT ✅' : 'OT ❌'}`);
}

console.log('\nAll Gospel books should be NT ✅');