// Utility to parse German Bible references in free text and map them to app display names
// Matches patterns like: Joh 3,16; Mt 5,3–12; Röm 8,28; 1Kor 13,4-7; vgl. Jak 2,14; Johannes 14,6; 1. Korinther 13,4–7

const ABBR_TO_DISPLAY = {
  // AT
  Gen: 'Genesis', Ex: 'Exodus', Lev: 'Levitikus', Num: 'Numeri', Dtn: 'Deuteronomium',
  Jos: 'Josua', Ri: 'Richter', Rut: 'Rut', '1Sam': '1. Samuel', '2Sam': '2. Samuel',
  '1Kön': '1. Könige', '2Kön': '2. Könige', '1Chr': '1. Chronik', '2Chr': '2. Chronik',
  Esra: 'Esra', Neh: 'Nehemia', Tob: 'Tobit', Jdt: 'Judit', Est: 'Ester',
  '1Makk': '1. Makkabäer', '2Makk': '2. Makkabäer', Ijob: 'Ijob', Ps: 'Psalmen',
  Spr: 'Sprichwörter', Koh: 'Kohelet', Hld: 'Hoheslied', Weish: 'Weisheit', Sir: 'Jesus Sirach',
  Jes: 'Jesaja', Jer: 'Jeremia', Klgl: 'Klagelieder', Bar: 'Baruch', Ez: 'Ezechiel',
  Dan: 'Daniel', Hos: 'Hosea', Joel: 'Joel', Am: 'Amos', Obd: 'Obadja', Jona: 'Jona',
  Mi: 'Micha', Nah: 'Nahum', Hab: 'Habakuk', Zef: 'Zefanja', Hag: 'Haggai', Sach: 'Sacharja', Mal: 'Maleachi',
  // NT
  Mt: 'Matthäus', Mk: 'Markus', Lk: 'Lukas', Joh: 'Johannes', Apg: 'Apostelgeschichte',
  Röm: 'Römer', '1Kor': '1. Korinther', '2Kor': '2. Korinther', Gal: 'Galater', Eph: 'Epheser',
  Phil: 'Philipper', Kol: 'Kolosser', '1Thess': '1. Thessalonicher', '2Thess': '2. Thessalonicher',
  '1Tim': '1. Timotheus', '2Tim': '2. Timotheus', Tit: 'Titus', Phlm: 'Philemon', Hebr: 'Hebräer',
  Jak: 'Jakobus', '1Petr': '1. Petrus', '2Petr': '2. Petrus', '1Joh': '1. Johannes', '2Joh': '2. Johannes', '3Joh': '3. Johannes',
  Jud: 'Judas', Offb: 'Offenbarung'
};

// Normalization: remove spaces/dots and normalize umlauts to handle variants (Kön -> Koen, Römer -> Roemer)
const norm = (s) => (s || '')
  .toString()
  .replace(/[\.\s]/g, '')
  .replace(/ä/g, 'ae').replace(/Ä/g, 'Ae')
  .replace(/ö/g, 'oe').replace(/Ö/g, 'Oe')
  .replace(/ü/g, 'ue').replace(/Ü/g, 'Ue')
  .replace(/ß/g, 'ss')
  .trim();

// Build normalized abbreviation map for lookup from tokens like "1 Kor" or "1. Kor" -> "1Kor"
const ABBR_NORM_MAP = Object.fromEntries(
  Object.entries(ABBR_TO_DISPLAY).flatMap(([abbr, display]) => {
    const variants = [abbr, abbr.replace('Kön', 'Koen'), abbr.replace('Ö', 'O').replace('ö', 'o')];
    const normed = new Set(variants.map(norm));
    // Also add spaced/dotted variants for ordinals (e.g., 1 Kor, 1. Kor)
    if (/^[12]Kor$/.test(abbr)) {
      const n = abbr[0];
      const base = 'Kor';
      normed.add(norm(`${n} ${base}`));
      normed.add(norm(`${n}. ${base}`));
    }
    if (/^[12]Sam$/.test(abbr)) {
      const n = abbr[0];
      const base = 'Sam';
      normed.add(norm(`${n} ${base}`));
      normed.add(norm(`${n}. ${base}`));
    }
    if (/^[12]Kön$/.test(abbr)) {
      const n = abbr[0];
      const base = 'Kön';
      normed.add(norm(`${n} ${base}`));
      normed.add(norm(`${n}. ${base}`));
      normed.add(norm(`${n} Koen`));
      normed.add(norm(`${n}. Koen`));
    }
    if (/^[12]Chr$/.test(abbr)) {
      const n = abbr[0];
      const base = 'Chr';
      normed.add(norm(`${n} ${base}`));
      normed.add(norm(`${n}. ${base}`));
    }
    if (/^[12]Makk$/.test(abbr)) {
      const n = abbr[0];
      const base = 'Makk';
      normed.add(norm(`${n} ${base}`));
      normed.add(norm(`${n}. ${base}`));
    }
    if (/^[123]Joh$/.test(abbr)) {
      const n = abbr[0];
      const base = 'Joh';
      normed.add(norm(`${n} ${base}`));
      normed.add(norm(`${n}. ${base}`));
    }
    if (/^[12]Petr$/.test(abbr)) {
      const n = abbr[0];
      const base = 'Petr';
      normed.add(norm(`${n} ${base}`));
      normed.add(norm(`${n}. ${base}`));
    }
    if (/^[12]Thess$/.test(abbr)) {
      const n = abbr[0];
      const base = 'Thess';
      normed.add(norm(`${n} ${base}`));
      normed.add(norm(`${n}. ${base}`));
    }
    if (/^[12]Tim$/.test(abbr)) {
      const n = abbr[0];
      const base = 'Tim';
      normed.add(norm(`${n} ${base}`));
      normed.add(norm(`${n}. ${base}`));
    }
    return Array.from(normed).map((k) => [k, display]);
  })
);

// Full German names mapping to display names
const FULL_TO_DISPLAY = {
  // Altes Testament
  Genesis: 'Genesis', Exodus: 'Exodus', Levitikus: 'Levitikus', Numeri: 'Numeri', Deuteronomium: 'Deuteronomium',
  Josua: 'Josua', Richter: 'Richter', Rut: 'Rut', '1. Samuel': '1. Samuel', '2. Samuel': '2. Samuel',
  '1. Könige': '1. Könige', '2. Könige': '2. Könige', '1. Chronik': '1. Chronik', '2. Chronik': '2. Chronik',
  Esra: 'Esra', Nehemia: 'Nehemia', Tobit: 'Tobit', Judit: 'Judit', Ester: 'Ester', '1. Makkabäer': '1. Makkabäer', '2. Makkabäer': '2. Makkabäer',
  Ijob: 'Ijob', Psalmen: 'Psalmen', 'Sprichwörter': 'Sprichwörter', Kohelet: 'Kohelet', Hoheslied: 'Hoheslied', Weisheit: 'Weisheit', 'Jesus Sirach': 'Jesus Sirach',
  Jesaja: 'Jesaja', Jeremia: 'Jeremia', Klagelieder: 'Klagelieder', Baruch: 'Baruch', Ezechiel: 'Ezechiel', Daniel: 'Daniel', Hosea: 'Hosea', Joel: 'Joel', Amos: 'Amos', Obadja: 'Obadja', Jona: 'Jona', Micha: 'Micha', Nahum: 'Nahum', Habakuk: 'Habakuk', Zefanja: 'Zefanja', Haggai: 'Haggai', Sacharja: 'Sacharja', Maleachi: 'Maleachi',
  // Neues Testament
  Matthäus: 'Matthäus', Markus: 'Markus', Lukas: 'Lukas', Johannes: 'Johannes', Apostelgeschichte: 'Apostelgeschichte',
  Römer: 'Römer', '1. Korinther': '1. Korinther', '2. Korinther': '2. Korinther', Galater: 'Galater', Epheser: 'Epheser', Philipper: 'Philipper', Kolosser: 'Kolosser',
  '1. Thessalonicher': '1. Thessalonicher', '2. Thessalonicher': '2. Thessalonicher', '1. Timotheus': '1. Timotheus', '2. Timotheus': '2. Timotheus', Titus: 'Titus', Philemon: 'Philemon', Hebräer: 'Hebräer',
  Jakobus: 'Jakobus', '1. Petrus': '1. Petrus', '2. Petrus': '2. Petrus', '1. Johannes': '1. Johannes', '2. Johannes': '2. Johannes', '3. Johannes': '3. Johannes', Judas: 'Judas', Offenbarung: 'Offenbarung',
};

// Build normalized map for full names, including variants without dots/spaces and with umlaut replacements
const FULL_NORM_MAP = (() => {
  const entries = [];
  const ordinalBases = [
    ['Samuel', 'Samuel'], ['Könige', 'Könige'], ['Chronik', 'Chronik'], ['Makkabäer', 'Makkabäer'],
    ['Korinther', 'Korinther'], ['Thessalonicher', 'Thessalonicher'], ['Timotheus', 'Timotheus'], ['Petrus', 'Petrus'], ['Johannes', 'Johannes']
  ];
  const ordNums = ['1', '2', '3'];
  // Add given full keys
  for (const [k, v] of Object.entries(FULL_TO_DISPLAY)) {
    entries.push([norm(k), v]);
  }
  // Generate ordinal variants like "1 Korinther", "1. Korinther", etc.
  ordinalBases.forEach(([base, displayBase]) => {
    ordNums.forEach((n) => {
      const disp = `${n}. ${displayBase}`;
      entries.push([norm(`${n}. ${base}`), `${n}. ${displayBase}`]);
      entries.push([norm(`${n} ${base}`), `${n}. ${displayBase}`]);
    });
  });
  return Object.fromEntries(entries);
})();

// Build token alternation for regex (abbreviations + full names + ordinal forms)
const TOKEN_ALTS = [
  ...Object.keys(ABBR_TO_DISPLAY),
  ...Object.keys(FULL_TO_DISPLAY),
  // Patterns for ordinals with abbreviations and full names
  '[12]\\.\\s*(?:Kor|Petr|Joh|Sam|Kön|Chr|Makk)',
  '[12]\\s*(?:Kor|Petr|Joh|Sam|Kön|Chr|Makk)',
  '[123]\\.\\s*(?:Joh)',
  '[123]\\s*(?:Joh)',
  '[12]\\.\\s*(?:Korinther|Petrus|Johannes|Samuel|Könige|Chronik|Makkabäer|Thessalonicher|Timotheus)',
  '[12]\\s*(?:Korinther|Petrus|Johannes|Samuel|Könige|Chronik|Makkabäer|Thessalonicher|Timotheus)'
]
  .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // escape literal names
  .map((k) => k) // keep regex fragments as-is
  .sort((a, b) => b.length - a.length)
  .join('|');

// Regex to find citations. Accept comma or colon between chapter and verse, dashes for ranges, optional "vgl." prefix.
const TOKEN_RE = new RegExp(
  `(?:vgl\\.\\s*)?(` + TOKEN_ALTS + `)` +
  `\\s*(\\d{1,3})\\s*[,.:]\\s*(\\d{1,3})(?:\\s*[–-]\\s*(\\d{1,3}))?`,
  'giu'
);

export const findBibleRefs = (text) => {
  if (!text) return [];
  const res = [];
  let m;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const [full, tokenRaw, chapterStr, startStr, endStr] = m;
  const token = tokenRaw.trim();
  const normToken = norm(token);
  const display = ABBR_NORM_MAP[normToken] || FULL_NORM_MAP[normToken] || ABBR_TO_DISPLAY[token] || FULL_TO_DISPLAY[token] || null;
    if (!display) continue;
    const chapter = parseInt(chapterStr, 10);
    const startVerse = parseInt(startStr, 10);
    const endVerse = endStr ? parseInt(endStr, 10) : startVerse;
    res.push({
      index: m.index,
      length: full.length,
      label: full,
      displayName: display,
      chapter,
      startVerse,
      endVerse,
    });
  }
  return res;
};
