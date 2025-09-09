export const prayerCategories = [
  { id: 'all', name: 'Alle' },
  { id: 'daily', name: 'Täglich' },
  { id: 'marian', name: 'Marianisch' },
  { id: 'rosary', name: 'Rosenkranz' },
  { id: 'liturgical', name: 'Liturgisch' },
  { id: 'other', name: 'Weitere' },
];

export const prayers = [
  {
    id: 'morning-prayer',
    title: 'Morgengebet',
    category: 'daily',
    text:
      'Guter Gott, ich danke dir für diesen neuen Tag. Stärke mich in allem, was kommt. Schenke mir ein waches Herz, Liebe im Handeln und Hoffnung im Denken. Sei du bei mir und bei allen, die ich liebe. Amen.',
  },
  {
    id: 'evening-prayer',
    title: 'Abendgebet',
    category: 'daily',
    text:
      'Herr, am Ende dieses Tages danke ich dir für alles Gute. Vergib mir, wo ich versagt habe, und schenke mir ruhigen Schlaf. Behüte alle Menschen, deren Wege sich mit meinen kreuzen. Amen.',
  },
  {
    id: 'trust-prayer',
    title: 'Gebet des Vertrauens',
    category: 'other',
    text:
      'Herr, in deine Hände lege ich meine Pläne und Sorgen. Du kennst meinen Weg. Führe mich Schritt für Schritt, gib mir Mut zum Guten und Geduld in der Not. Amen.',
  },
  {
    id: 'mary-intercession',
    title: 'Maria – Fürbitte',
    category: 'marian',
    text:
      'Maria, Mutter des Herrn, begleite mich mit deinem Vertrauen. Bitte für mich bei deinem Sohn, dass ich im Glauben wachse, die Hoffnung nicht verliere und die Liebe nicht erkalten lasse. Amen.',
  },
  {
    id: 'short-kyrie',
    title: 'Kyrie-Ruf',
    category: 'liturgical',
    text:
      'Herr, erbarme dich. Christus, erbarme dich. Herr, erbarme dich.',
  },
  {
    id: 'thanksgiving',
    title: 'Dankgebet',
    category: 'other',
    text:
      'Gott, Quelle allen Lebens, ich danke dir für die Menschen an meiner Seite, für das Gute, das ich empfangen habe, und für jeden Augenblick deiner Nähe. Lehre mich, dankbar zu leben. Amen.',
  },
];

export function filterPrayers({ query = '', category = 'all' } = {}) {
  const q = query.trim().toLowerCase();
  return prayers.filter((p) => {
    const byCategory = category === 'all' || p.category === category;
    if (!byCategory) return false;
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      (p.text && p.text.toLowerCase().includes(q))
    );
  });
}
