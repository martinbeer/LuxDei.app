const https = require('https');
const querystring = require('querystring');

// Now that I understand the structure, let's try the correct API calls
function testCorrectAPI() {
  // Based on the JS analysis, we need to POST with command="prayLaudes" etc.
  const hours = [
    'Laudes',
    'Vesperae', 
    'Tertia',
    'Sexta',
    'Nona',
    'Matutinum',
    'Prima',
    'Completorium'
  ];
  
  console.log('Testing DivinumOfficium with correct API calls...\n');
  
  testHour(hours[0]); // Start with Laudes
}

function testHour(hour) {
  const formData = {
    command: `pray${hour}`,
    date1: '12-9-2025',
    version: 'Rubrics 1960 - 1960',
    lang2: 'English',
    // Include some of the setup parameters from the hidden field
    setup: "general;;;$expand='tota';;$version='Rubrics 1960 - 1960';;$lang2='English';;$votive='Hodie';"
  };
  
  const postData = querystring.stringify(formData);
  
  const options = {
    hostname: 'www.divinumofficium.com',
    port: 443,
    path: '/cgi-bin/horas/officium.pl',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': postData.length,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
  
  console.log(`--- Testing ${hour} ---`);
  console.log(`Command: ${formData.command}`);
  
  const req = https.request(options, (res) => {
    let data = '';
    console.log(`Status: ${res.statusCode}`);
    
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`Content length: ${data.length}`);
      
      // Check if this looks like actual office content vs. the main interface
      const contentIndicators = {
        'Interface Elements': data.match(/<input|<select|onclick=/gi)?.length || 0,
        'Liturgical Content': data.match(/(psalm|antiphon|reading|prayer|gloria|alleluia)/gi)?.length || 0,
        'Latin Text': data.match(/\b(deus|dominus|maria|jesus|christus|sanctus)\b/gi)?.length || 0,
        'Paragraphs': data.match(/<p[^>]*>/gi)?.length || 0
      };
      
      console.log('Content analysis:', contentIndicators);
      
      // Look for actual office text patterns
      if (contentIndicators['Liturgical Content'] > 5) {
        console.log('✅ This looks like actual office content!');
        
        // Extract some sample content
        const bodyMatch = data.match(/<body[^>]*>(.*?)<\/body>/si);
        if (bodyMatch) {
          const bodyText = bodyMatch[1]
            .replace(/<[^>]+>/g, ' ')  // Remove HTML tags
            .replace(/\s+/g, ' ')      // Normalize whitespace
            .trim();
          
          console.log('Sample text:', bodyText.substring(0, 300) + '...');
        }
        
        // Save the working response
        const fs = require('fs');
        fs.writeFileSync(`divinum_${hour.toLowerCase()}_content.html`, data);
        console.log(`✅ Saved ${hour} content to divinum_${hour.toLowerCase()}_content.html`);
        
      } else {
        console.log('❌ Still getting interface page');
      }
      
      console.log(''); // Empty line for readability
    });
  });
  
  req.on('error', (err) => {
    console.log('❌ Error:', err.message);
  });
  
  req.write(postData);
  req.end();
}

testCorrectAPI();
