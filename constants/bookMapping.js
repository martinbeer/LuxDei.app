// Mapping zwischen angezeigten Namen und Datenbank-Namen
export const BOOK_NAME_MAPPING = {
  // Altes Testament - Geschichtsbücher
  'Genesis': 'Genesis',
  'Exodus': 'Exodus',
  'Levitikus': 'Levitikus',
  'Numeri': 'Numeri',
  'Deuteronomium': 'Deuteronomium',
  'Josua': 'Das Buch Josua',
  'Richter': 'Das Buch der Richter',
  'Rut': 'Das Buch Rut',
  '1. Samuel': 'Das 1. Buch Samuel',
  '2. Samuel': 'Das 2. Buch Samuel',
  '1. Könige': 'Das 1. Buch der Koenige',
  '2. Könige': 'Das 2. Buch der KKoenige',
  '1. Chronik': 'Das 1. Buch der Chronik',
  '2. Chronik': 'Das 2. Buch der Chronik',
  'Esra': 'Das Buch der Esra',
  'Nehemia': 'Das Buch Nehemias',
  'Tobit': 'Das Buch Tobit',
  'Judit': 'Das Buch Judit',
  'Ester': 'Das Buch Ester',
  '1. Makkabäer': 'Das 1. Buch der Makkabaeer',
  '2. Makkabäer': 'Das 2. Buch der  Makkabaeer',

  // Altes Testament - Lehrbücher
  'Ijob': 'Das Buch Ijob',
  'Psalmen': 'Die Psalmen',
  'Sprichwörter': 'Das Buch der Sprichwoerter',
  'Kohelet': 'Das Buch Kohelet',
  'Hoheslied': 'Das Hohelied',
  'Weisheit': 'Das Buch der Weisheit',
  'Jesus Sirach': 'Das Buch Jesus Sirach',
  
  // Altes Testament - Prophetenbücher
  'Jesaja': 'Das Buch Jesaja',
  'Jeremia': 'Das Buch Jeremia',
  'Klagelieder': 'Die Klagelieder des Jeremia',
  'Baruch': 'Das Buch Baruch',
  'Ezechiel': 'Das Buch Ezechiel',
  'Daniel': 'Das Buch Daniel',
  'Hosea': 'Das Buch Hosea',
  'Joel': 'Das Buch Joel',
  'Amos': 'Das Buch Amos',
  'Obadja': 'Das Buch Obadja',
  'Jona': 'Das Buch Jona',
  'Micha': 'Das Buch Micha',
  'Nahum': 'Das Buch Nahum',
  'Habakuk': 'Das Buch Habakuk',
  'Zefanja': 'Das Buch Zefania',
  'Haggai': 'Das Buch Haggai',
  'Sacharja': 'Das Buch Sacharja',
  'Maleachi': 'Das Buch Maleachi',
  
  // Neues Testament - Evangelien
  'Matthäus': 'Matthaeusevangelium',
  'Markus': 'Markusevangelium',
  'Lukas': 'Lukasevangelium',
  'Johannes': 'Johannesevangelium',
  
  // Neues Testament - Apostelgeschichte
  'Apostelgeschichte': 'Apostelgeschichte',
  
  // Neues Testament - Paulusbriefe
  'Römer': 'Roemerbrief',
  '1. Korinther': '1. Korintherbrief',
  '2. Korinther': '2. Korintherbrief',
  'Galater': 'Galaterbrief',
  'Epheser': 'Epheserbrief',
  'Philipper': 'Philipperbrief',
  'Kolosser': 'Kolosserbrief',
  '1. Thessalonicher': '1. Thessalonicherbrief',
  '2. Thessalonicher': '2. Thessalonicherbrief',
  '1. Timotheus': '1. Timotheusbrief',
  '2. Timotheus': '2. Timotheusbrief',
  'Titus': 'Titusbrief',
  'Philemon': 'Philemonbrief',
  'Hebräer': 'Hebraerbrief',

  // Neues Testament - Katholische Briefe
  'Jakobus': 'Jakobusbrief',
  '1. Petrus': '1. Petrusbrief',
  '2. Petrus': '2. Petrusbrief',
  '1. Johannes': '1. Johannesbrief',
  '2. Johannes': '2. Johannesbrief',
  '3. Johannes': '3. Johannesbrief',
  'Judas': 'Judasbrief',
  
  // Neues Testament - Offenbarung
  'Offenbarung': 'Offenbarung des Johannes',
};

// Funktion um angezeigten Namen in Datenbank-Namen zu konvertieren
export const getDbBookName = (displayName) => {
  return BOOK_NAME_MAPPING[displayName] || displayName;
};

// Funktion um Datenbank-Namen in angezeigten Namen zu konvertieren
export const getDisplayBookName = (dbName) => {
  const entry = Object.entries(BOOK_NAME_MAPPING).find(([display, db]) => db === dbName);
  return entry ? entry[0] : dbName;
};
