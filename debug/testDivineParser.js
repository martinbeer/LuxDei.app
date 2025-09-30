// Enhanced debug probe to simulate our parsing logic
(async () => {
  const FEED_URL = 'https://divineoffice.org/feed/';
  
  // Our parsing functions
  function getTag(text, tag) {
    const m = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? m[1] : null;
  }

  function getAllTags(text, tag) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
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

  function parseItems(xml) {
    const items = xml.split('<item').slice(1).map(part => '<item' + part.split('</item>')[0] + '</item>');
    return items.map((itemXml) => {
      const title = decode(getTag(itemXml, 'title') || '').trim();
      const link = decode(getTag(itemXml, 'link') || '').trim();
      const categories = getAllTags(itemXml, 'category').map(decode);
      // Get enclosure src
      const enclosureMatch = itemXml.match(/<enclosure[^>]*url=\"([^\"]+)\"/i);
      const audio = enclosureMatch ? enclosureMatch[1] : null;
      const pubDate = decode(getTag(itemXml, 'pubDate') || '');
      return { title, link, categories, audio, pubDate };
    });
  }

  // Hour detection
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

  try {
    console.log('Fetching', FEED_URL);
    const res = await fetch(FEED_URL, {
      headers: {
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
        'User-Agent': 'LuxDei/1.0 (debug probe)'
      }
    });
    const ct = res.headers.get('content-type');
    const text = await res.text();
    console.log(`Status: ${res.status}, Content-Type: ${ct}`);
    console.log(`Body length: ${text.length}`);
    
    const items = parseItems(text);
    console.log(`\nParsed ${items.length} items`);
    
    // Show first few items with hour detection
    console.log('\nFirst 10 items with hour detection:');
    items.slice(0, 10).forEach((item, i) => {
      const hour = detectHourKey(item.title, item.categories);
      console.log(`${i+1}. Title: "${item.title}"`);
      console.log(`   Categories: [${item.categories.join(', ')}]`);
      console.log(`   Detected hour: ${hour || 'NONE'}`);
      console.log(`   Has audio: ${!!item.audio}`);
      console.log('');
    });
    
    // Group by hour
    const byHour = {};
    for (const it of items) {
      const key = detectHourKey(it.title, it.categories);
      if (!key) continue;
      if (!byHour[key]) byHour[key] = it; // first occurrence is latest
    }
    
    console.log('\nDetected hours from feed:');
    Object.keys(byHour).forEach(key => {
      const item = byHour[key];
      console.log(`${key}: "${item.title}" (audio: ${!!item.audio})`);
    });
    
  } catch (e) {
    console.error('ERROR fetching', e);
  }
})();
