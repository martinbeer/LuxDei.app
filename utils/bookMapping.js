// Mapping zwischen den Namen in der App und den Namen in der Datenbank
export const bookNameMapping = {
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
  '1. Könige': 'Das 1. Buch der Könige',
  '2. Könige': 'Das 2. Buch der Könige',
  '1. Chronik': 'Das 1. Buch der Chronik',
  '2. Chronik': 'Das 2. Buch der Chronik',
  'Esra': 'Das Buch der Esra',
  'Nehemia': 'Das Buch Nehemias',
  'Tobit': 'Das Buch Tobit',
  'Judit': 'Das Buch Judit',
  'Ester': 'Das Buch Ester',
  '1. Makkabäer': 'Das 1. Buch der Makkabäer',
  '2. Makkabäer': 'Das 2. Buch der  Makkabäer',
  
  // Altes Testament - Lehrbücher
  'Ijob': 'Das Buch Ijob',
  'Psalmen': 'Die Psalmen',
  'Sprichwörter': 'Das Buch der Sprichwörter',
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
  'Matthäus': 'Matthäusevangelium',
  'Markus': 'Markusevangelium',
  'Lukas': 'Lukasevangelium',
  'Johannes': 'Johannesevangelium',
  
  // Neues Testament - Apostelgeschichte
  'Apostelgeschichte': 'Apostelgeschichte',
  
  // Neues Testament - Paulusbriefe
  'Römer': 'Römerbrief',
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
  'Hebräer': 'Hebräerbrief',
  
  // Neues Testament - Katholische Briefe
  'Jakobus': 'Jakobusbrief',
  '1. Petrus': '1. Petrusbrief',
  '2. Petrus': '2. Petrusbrief',
  '1. Johannes': '1. Johannesbrief',
  '2. Johannes': '2. Johannesbrief',
  '3. Johannes': '3. Johannesbrief',
  'Judas': 'Judasbrief',
  
  // Neues Testament - Offenbarung
  'Offenbarung': 'Offenbarung des Johannes'
};

// Funktion um den Datenbank-Namen für ein Buch zu bekommen
export const getDatabaseBookName = (displayName) => {
  return bookNameMapping[displayName] || displayName;
};
