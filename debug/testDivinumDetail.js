const https = require('https');

// Test a specific request that should return actual office content
function fetchFullContent() {
  const url = 'https://www.divinumofficium.com/cgi-bin/horas/officium.pl?command=pray&horas=Laudes&version=Rubrics%201960&lang=English&date1=today';
  
  console.log(`Fetching full content from: ${url}`);
  
  const req = https.get(url, (res) => {
    let data = '';
    console.log(`Status: ${res.statusCode}`);
    console.log('Response headers:', JSON.stringify(res.headers, null, 2));
    
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`\nContent length: ${data.length}`);
      
      // Look for actual office content patterns
      const patterns = {
        'Forms/Links': /<form|<a\s+href|<input/gi,
        'Hour Names': /(Matutinum|Laudes|Prima|Tertia|Sexta|Nona|Vesperae|Completorium)/gi,
        'Latin Text': /(?:Deus|Dominus|Ave|Pater|Gloria|Alleluia|Amen)/gi,
        'Psalms': /Psalm\s*\d+|Psalmus|Antiphon/gi,
        'Prayers': /(Oratio|Prayer|Collecta|Postcommunio)/gi,
        'Errors': /(error|Error|ERROR|not found|404)/gi
      };
      
      Object.entries(patterns).forEach(([name, regex]) => {
        const matches = data.match(regex);
        if (matches) {
          console.log(`${name}: ${matches.length} matches - ${[...new Set(matches.slice(0, 5))].join(', ')}`);
        }
      });
      
      // Show different parts of the content
      console.log('\n--- HTML Structure ---');
      console.log('First 500 chars:', data.substring(0, 500));
      
      // Look for main content area
      const bodyMatch = data.match(/<body[^>]*>(.*?)<\/body>/si);
      if (bodyMatch) {
        const bodyContent = bodyMatch[1];
        console.log('\n--- Body Content (first 800 chars) ---');
        console.log(bodyContent.substring(0, 800));
        
        // Look for specific content containers
        const contentMatches = bodyContent.match(/<div[^>]*>(.*?)<\/div>/gi);
        if (contentMatches) {
          console.log(`\nFound ${contentMatches.length} div elements`);
        }
      }
      
      // Check for JavaScript or dynamic loading
      if (data.includes('<script')) {
        console.log('\n⚠️  Contains JavaScript - content might be dynamically loaded');
      }
      
      // Save full content to file for inspection
      const fs = require('fs');
      fs.writeFileSync('divinumOfficium_response.html', data);
      console.log('\nFull response saved to divinumOfficium_response.html');
    });
  });
  
  req.on('error', (err) => {
    console.log('❌ Error:', err.message);
  });
}

fetchFullContent();
