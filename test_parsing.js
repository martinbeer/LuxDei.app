// Test parsing von Gospel Referenz
const parseBibleReference = (reference) => {
  if (!reference) return null;
  
  // Remove common prefixes and clean up
  let cleaned = reference
    .replace(/^vgl\.\s*/i, '') 
    .replace(/^(Lesung aus|Evangelium nach|Psalm)\s+/i, '') 
    .trim();
  
  cleaned = cleaned.replace(/[–—−]/g, '-');
  
  console.log('Parsing reference:', reference, '-> cleaned:', cleaned);
  
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
      
      console.log('Matched book reference:', {
        original: part,
        bookAbbr: abbrNorm,
        fullBookName,
        chapter,
        verses
      });
      
      if (fullBookName) {
        allReferences.push({
          book: fullBookName,
          chapter: parseInt(chapter),
          verses: verses.trim()
        });
      }
    }
  }
  
  return allReferences.length > 0 ? allReferences : null;
};

const mapBookAbbreviation = (abbr) => {
  const bookMappings = {
    'Mt': 'Matthäus', 'Mk': 'Markus', 'Lk': 'Lukas', 'Joh': 'Johannes'
  };
  
  return bookMappings[abbr] || abbr;
};

// Test mit Gospel Referenz
console.log('=== TEST 1: Mt 5, 1-12a ===');
const result1 = parseBibleReference("Mt 5, 1-12a");
console.log('Result:', result1);

console.log('\n=== TEST 2: Evangelium nach Mt 5, 1-12a ===');  
const result2 = parseBibleReference("Evangelium nach Mt 5, 1-12a");
console.log('Result:', result2);

console.log('\n=== TEST 3: Lk 10, 25-37 ===');
const result3 = parseBibleReference("Lk 10, 25-37");
console.log('Result:', result3);