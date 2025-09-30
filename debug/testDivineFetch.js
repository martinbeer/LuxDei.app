// Quick probe to check DivineOffice feeds from Node
(async () => {
  const urls = [
    'https://divineoffice.org/feed/',
    'https://divineoffice.org/tag/morning-prayer/feed/',
    'https://divineoffice.org/category/daily-prayer/office-of-readings/feed/'
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u, {
        headers: {
          'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
          'User-Agent': 'LuxDei/1.0 (debug probe)'
        }
      });
      const ct = res.headers.get('content-type');
      const text = await res.text();
      const preview = text.replace(/\s+/g, ' ').slice(0, 240);
      console.log(`\nURL: ${u}\nStatus: ${res.status}\nContent-Type: ${ct}\nPreview: ${preview}\n`);
    } catch (e) {
      console.error('ERROR fetching', u, e);
    }
  }
})();
