// Lightweight Divine Office RSS fetcher and mapper
// We only use metadata (titles, categories, audio enclosure, link) to avoid copying text content.

// Debugging toggle: set to false to silence logs
const DEBUG_DIVINE = true;
const dlog = (...args) => { if (DEBUG_DIVINE) console.log('[DivineOffice]', ...args); };
const peek = (str, n = 500) => {
  if (!str) return '';
  const s = String(str).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
};

const FEED_URL = 'https://divineoffice.org/feed/';
const ALT_FEEDS = {
  Morning: 'https://divineoffice.org/tag/morning-prayer/feed/',
  Evening: 'https://divineoffice.org/tag/evening-prayer/feed/',
  OfficeOfReadings: 'https://divineoffice.org/category/daily-prayer/office-of-readings/feed/',
};

// Simple XML to JSON extraction for RSS items (safe subset)
function getTag(text, tag) {
  const m = text.match(new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i'));
  return m ? m[1] : null;
}

function getAllTags(text, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

function decode(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractCDATA(str) {
  if (!str) return str;
  // Extract content from CDATA sections
  const cdataMatch = str.match(/<!\[CDATA\[(.*?)\]\]>/);
  return cdataMatch ? cdataMatch[1] : str;
}

function parseItems(xml) {
  const items = xml.split('<item').slice(1).map(part => '<item' + part.split('</item>')[0] + '</item>');
  return items.map((itemXml) => {
    const title = decode(extractCDATA(getTag(itemXml, 'title') || '')).trim();
    const link = decode(extractCDATA(getTag(itemXml, 'link') || '')).trim();
    const categories = getAllTags(itemXml, 'category').map(cat => decode(extractCDATA(cat)));
    // Get enclosure src
    const enclosureMatch = itemXml.match(/<enclosure[^>]*url=\"([^\"]+)\"/i);
    const audio = enclosureMatch ? enclosureMatch[1] : null;
    const pubDate = decode(extractCDATA(getTag(itemXml, 'pubDate') || ''));
    return { title, link, categories, audio, pubDate };
  });
}

// Map to canonical hours
const hourMap = {
  en: {
    Invitatory: ['Invitatory'],
    OfficeOfReadings: ['Office of Readings'],
    Lauds: ['Morning Prayer'],
    Terce: ['Midmorning Prayer'],
    Sext: ['Midday Prayer'],
    None: ['Midafternoon Prayer'],
    Vespers: ['Evening Prayer', 'Evening Prayer I', 'Evening Prayer II'],
    Compline: ['Night Prayer', 'Night Prayer I', 'Night Prayer II']
  },
  de: {
    Invitatory: 'Invitatorium',
    OfficeOfReadings: 'Lesehore',
    Lauds: 'Laudes',
    Terce: 'Terz',
    Sext: 'Sext',
    None: 'Non',
    Vespers: 'Vesper',
    Compline: 'Komplet'
  },
  la: {
    Invitatory: 'Invitatorium',
    OfficeOfReadings: 'Officium lectionis',
    Lauds: 'Laudes',
    Terce: 'Tertia',
    Sext: 'Sexta',
    None: 'Nona',
    Vespers: 'Vesperae',
    Compline: 'Completorium'
  }
};

function detectHourKey(title, categories) {
  const t = (title || '').toLowerCase();
  const cats = (categories || []).map(c => c.toLowerCase());
  const contains = (arr) => arr.some(k => t.includes(k.toLowerCase()) || cats.includes(k.toLowerCase()));
  const m = hourMap.en;
  // Prefer explicit hour names in titles first
  if (contains(m.Lauds)) return 'Lauds';
  if (contains(m.Vespers)) return 'Vespers';
  if (contains(m.Compline)) return 'Compline';
  if (contains(m.OfficeOfReadings)) return 'OfficeOfReadings';
  if (contains(m.Terce)) return 'Terce';
  if (contains(m.Sext)) return 'Sext';
  if (contains(m.None)) return 'None';
  if (contains(m.Invitatory)) return 'Invitatory';
  return null;
}

export async function fetchTodayHours() {
  try {
    const commonHeaders = {
      'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
      'User-Agent': 'LuxDei/1.0 (+https://example.local)'
    };

    dlog('Fetching main feed', FEED_URL);
    const res = await fetch(FEED_URL, { headers: commonHeaders });
    const ct = res.headers?.get ? res.headers.get('content-type') : undefined;
    dlog('Main feed response', { status: res.status, contentType: ct || 'unknown' });
    const text = await res.text();
    dlog('Main feed length', text?.length || 0, 'preview:', peek(text));
    const items = parseItems(text);
    dlog('Parsed main feed items:', items.length, 'sample titles:', items.slice(0, 5).map(i => i.title));

    // Group by hour, take latest per hour (feed is reverse chronological)
    const byHour = {};
    for (const it of items) {
      const key = detectHourKey(it.title, it.categories);
      if (!key) continue;
      if (!byHour[key]) byHour[key] = it; // first occurrence is latest
    }
    dlog('Detected hours from main feed:', Object.keys(byHour).map(k => `${k}${byHour[k]?.audio ? ' (audio)' : ''}`));

    // Fallbacks for key hours if missing
    const needed = ['Lauds', 'Vespers', 'OfficeOfReadings'];
    const missing = needed.filter(k => !byHour[k]);
    if (missing.length > 0) {
      dlog('Missing hours after main feed:', missing);
      for (const miss of missing) {
        let url = null;
        if (miss === 'Lauds') url = ALT_FEEDS.Morning;
        if (miss === 'Vespers') url = ALT_FEEDS.Evening;
        if (miss === 'OfficeOfReadings') url = ALT_FEEDS.OfficeOfReadings;
        if (!url) continue;
        try {
          dlog('Fetching fallback for', miss, '->', url);
          const r = await fetch(url, { headers: commonHeaders });
          const ct2 = r.headers?.get ? r.headers.get('content-type') : undefined;
          dlog('Fallback response', { status: r.status, contentType: ct2 || 'unknown' });
          const t2 = await r.text();
          dlog('Fallback length', t2?.length || 0, 'preview:', peek(t2));
          const items2 = parseItems(t2);
          dlog('Parsed fallback items:', items2.length, 'sample titles:', items2.slice(0, 3).map(i => i.title));
          const it = items2.find(i => detectHourKey(i.title, i.categories) === miss);
          if (it) byHour[miss] = it;
        } catch {}
      }
    }

    dlog('Final detected hours:', Object.keys(byHour).map(k => ({ key: k, title: byHour[k]?.title, hasAudio: !!byHour[k]?.audio })));
    return byHour; // keys subset of Invitatory, OfficeOfReadings, Lauds, Terce, Sext, None, Vespers, Compline
  } catch (e) {
    console.warn('Divine Office feed error', e);
    return {};
  }
}

export function getHourLabels(locale = 'de') {
  const map = locale === 'la' ? hourMap.la : hourMap.de;
  return map;
}

export function listHoursInOrder(byHour, locale = 'de') {
  const order = ['Invitatory', 'OfficeOfReadings', 'Lauds', 'Terce', 'Sext', 'None', 'Vespers', 'Compline'];
  const labels = getHourLabels(locale);
  return order
    .filter((k) => byHour[k])
    .map((k) => ({ key: k, label: labels[k], item: byHour[k] }));
}
