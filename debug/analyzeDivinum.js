const https = require('https');

// Try to understand how DivinumOfficium works by examining the form structure
function analyzeInterface() {
  // First get the main page to understand the form structure
  const url = 'https://www.divinumofficium.com/cgi-bin/horas/officium.pl';
  
  console.log('Analyzing DivinumOfficium interface...');
  
  const req = https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`Status: ${res.statusCode}, Content length: ${data.length}`);
      
      // Extract form parameters
      const inputMatches = data.match(/<input[^>]+>/gi);
      if (inputMatches) {
        console.log('\n--- Form Inputs ---');
        inputMatches.forEach(input => {
          const nameMatch = input.match(/name="([^"]+)"/i);
          const valueMatch = input.match(/value="([^"]*)"/i);
          const typeMatch = input.match(/type="([^"]+)"/i);
          
          if (nameMatch) {
            console.log(`${nameMatch[1]}: ${typeMatch?.[1] || 'text'} = "${valueMatch?.[1] || ''}"`);
          }
        });
      }
      
      // Look for JavaScript functions that might show us the API
      const scriptContent = data.match(/<script[^>]*>(.*?)<\/script>/si);
      if (scriptContent) {
        console.log('\n--- JavaScript Functions ---');
        const functions = scriptContent[1].match(/function\s+\w+\([^)]*\)|onclick="[^"]+"/g);
        if (functions) {
          functions.slice(0, 10).forEach(fn => console.log(fn));
        }
      }
      
      // Try to understand what parameters are needed
      console.log('\n--- Trying direct POST request ---');
      tryDirectPost();
    });
  });
  
  req.on('error', (err) => console.log('Error:', err.message));
}

function tryDirectPost() {
  const postData = 'command=pray&hora=Laudes&date1=12-9-2025&version=Rubrics%201960&lang=English&calsize=100';
  
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
  
  const req = https.request(options, (res) => {
    let data = '';
    console.log(`POST Status: ${res.statusCode}`);
    
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`POST Content length: ${data.length}`);
      
      // Look for actual liturgical content
      const liturgicalPatterns = {
        'Psalms': /psalm\s*\d+/gi,
        'Antiphons': /(ant\.|antiphon)/gi,
        'Readings': /(lectio|reading)/gi,
        'Prayers': /(oremus|let us pray|prayer)/gi,
        'Latin Text': /(?:dominus|deus|gloria|alleluia|amen)\s+(?:vobiscum|patri|in|tecum)/gi
      };
      
      Object.entries(liturgicalPatterns).forEach(([name, regex]) => {
        const matches = data.match(regex);
        if (matches) {
          console.log(`${name}: ${matches.length} matches`);
        }
      });
      
      // Save this response too
      const fs = require('fs');
      fs.writeFileSync('divinumOfficium_post_response.html', data);
      console.log('POST response saved to divinumOfficium_post_response.html');
      
      // Show first part of response
      console.log('\n--- POST Response Preview ---');
      console.log(data.substring(0, 800));
    });
  });
  
  req.on('error', (err) => console.log('POST Error:', err.message));
  req.write(postData);
  req.end();
}

analyzeInterface();
