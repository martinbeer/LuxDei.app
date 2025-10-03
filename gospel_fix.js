// Replacement code für Gospel Testament Detection

// Special Gospel testament detection
const detectGospelTestament = (databaseBookName, readingType) => {
  // For Gospel readings, always treat as New Testament
  if (readingType === 'gospel') {
    console.log('🛠️ GOSPEL FIX: Forcing NT for Gospel reading:', databaseBookName);
    return 'NT';
  }
  
  // Regular detection
  const newTestamentAbbr = new Set([
    'Mt','Mk','Lk','Joh','Apg','Röm','1Kor','2Kor','Gal','Eph','Phil','Kol',
    '1Thess','2Thess','1Tim','2Tim','Tit','Phlm','Hebr','Jak','1Petr','2Petr',
    '1Joh','2Joh','3Joh','Jud','Offb'
  ]);
  const newTestamentFullNames = new Set([
    'Matthäusevangelium','Matthaeusevangelium','Markusevangelium','Lukasevangelium','Johannesevangelium','Apostelgeschichte',
    'Römerbrief','1. Korintherbrief','2. Korintherbrief','Galaterbrief','Epheserbrief','Philipperbrief',
    'Kolosserbrief','1. Thessalonicherbrief','2. Thessalonicherbrief','1. Timotheusbrief','2. Timotheusbrief',
    'Titusbrief','Philemonbrief','Hebräerbrief','Jakobusbrief','1. Petrusbrief','2. Petrusbrief',
    '1. Johannesbrief','2. Johannesbrief','3. Johannesbrief','Judasbrief','Offenbarung des Johannes'
  ]);
  
  const isNewTestament = newTestamentAbbr.has(databaseBookName) || newTestamentFullNames.has(databaseBookName);
  return isNewTestament ? 'NT' : 'OT';
};

console.log('Use this function in place of the current testament detection logic!');
console.log('');
console.log('Replace the current testament detection with:');
console.log('');
console.log('const testament = detectGospelTestament(databaseBookName, reading.type);');
console.log('query = query.eq("testament", testament);');