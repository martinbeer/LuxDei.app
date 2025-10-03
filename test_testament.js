// Test Testament Detection für Allioli Evangelien
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

// Test Allioli Evangelien (mit ae statt ä)
const allioli_gospels = [
  'Matthaeusevangelium',  // <-- Das ist der Allioli Name
  'Markusevangelium',
  'Lukasevangelium', 
  'Johannesevangelium'
];

console.log('=== ALLIOLI TESTAMENT DETECTION TEST ===\n');

for (const gospel of allioli_gospels) {
  const inAbbr = newTestamentAbbr.has(gospel);
  const inFullNames = newTestamentFullNames.has(gospel);
  const isNewTestament = inAbbr || inFullNames;
  
  console.log(`${gospel}:`);
  console.log(`  In abbreviations: ${inAbbr}`);
  console.log(`  In full names: ${inFullNames}`);
  console.log(`  Is New Testament: ${isNewTestament}`);
  console.log('');
}

console.log('=== SCHÖNINGH/EINHEIT TESTAMENT DETECTION TEST ===\n');

const modern_gospels = ['Mt', 'Mk', 'Lk', 'Joh'];

for (const gospel of modern_gospels) {
  const inAbbr = newTestamentAbbr.has(gospel);
  const inFullNames = newTestamentFullNames.has(gospel);
  const isNewTestament = inAbbr || inFullNames;
  
  console.log(`${gospel}:`);
  console.log(`  In abbreviations: ${inAbbr}`);
  console.log(`  In full names: ${inFullNames}`);
  console.log(`  Is New Testament: ${isNewTestament}`);
  console.log('');
}