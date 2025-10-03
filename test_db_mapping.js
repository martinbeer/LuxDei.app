// Test des getDatabaseBookName mapping
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
    console.warn(`No mapping found for book: ${appBookName}`);
    return null;
  }
  
  const databaseName = mapping[tableName];
  if (!databaseName) {
    console.warn(`No database name found for book: ${appBookName} in table: ${tableName}`);
    return null;
  }
  
  return databaseName;
};

// Test alle Übersetzungen für Evangelien
const gospelBooks = ['Matthäus', 'Markus', 'Lukas', 'Johannes'];
const translations = [
  { name: 'Allioli-Arndt', table: 'bibelverse' },
  { name: 'Schöningh', table: 'bibelverse_schoenigh' },
  { name: 'Einheitsübersetzung', table: 'bibelverse_einheit' }
];

console.log('=== GOSPEL DATABASE MAPPING TEST ===\n');

for (const gospel of gospelBooks) {
  console.log(`--- ${gospel} ---`);
  for (const translation of translations) {
    const dbName = getDatabaseBookName(gospel, translation.table);
    console.log(`${translation.name} (${translation.table}): ${dbName}`);
  }
  console.log('');
}