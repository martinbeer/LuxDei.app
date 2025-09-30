const https = require('https');

// Test different URLs for DivinumOfficium.com
const testUrls = [
  'https://www.divinumofficium.com/cgi-bin/horas/officium.pl?command=pray&lang=English&version=Rubrics%201960&testmode=on&date1=21%2F11%2F2024',
  'https://www.divinumofficium.com/cgi-bin/horas/officium.pl?command=pray&horas=Laudes',
  'https://www.divinumofficium.com/cgi-bin/horas/officium.pl?command=pray&horas=Vesperae',
  'https://www.divinumofficium.com/cgi-bin/horas/officium.pl?command=pray&horas=Tertia',
  'https://www.divinumofficium.com/cgi-bin/horas/officium.pl?command=pray&horas=Sexta',
  'https://www.divinumofficium.com/cgi-bin/horas/officium.pl?command=pray&horas=Nona',
  'https://www.divinumofficium.com/cgi-bin/horas/officium.pl?command=pray&horas=Matutinum',
  'https://www.divinumofficium.com/cgi-bin/horas/officium.pl?command=pray&horas=Prima',
  'https://www.divinumofficium.com/cgi-bin/horas/officium.pl?command=pray&horas=Completorium'
];

async function testUrl(url) {
  return new Promise((resolve, reject) => {
    console.log(`\n--- Testing: ${url} ---`);
    
    const req = https.get(url, (res) => {
      let data = '';
      console.log(`Status: ${res.statusCode}`);
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`Content length: ${data.length}`);
        
        // Look for hour names or specific content
        const hourMatches = data.match(/(Matutinum|Laudes|Prima|Tertia|Sexta|Nona|Vesperae|Completorium)/gi);
        if (hourMatches) {
          console.log(`Found hours: ${[...new Set(hourMatches)].join(', ')}`);
        }
        
        // Check for error messages
        if (data.includes('error') || data.includes('Error') || data.includes('ERROR')) {
          console.log('⚠️  Contains error messages');
        }
        
        // Show first part of content
        console.log(`First 200 chars: ${data.substring(0, 200).replace(/\n/g, '\\n')}`);
        
        resolve({ url, status: res.statusCode, length: data.length, data: data.substring(0, 500) });
      });
    });
    
    req.on('error', (err) => {
      console.log(`❌ Error: ${err.message}`);
      reject(err);
    });
    
    req.setTimeout(10000, () => {
      console.log('⏱️  Request timeout');
      req.abort();
      reject(new Error('Timeout'));
    });
  });
}

async function main() {
  console.log('Testing DivinumOfficium.com endpoints...\n');
  
  for (const url of testUrls) {
    try {
      await testUrl(url);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between requests
    } catch (err) {
      console.log(`Failed to test ${url}: ${err.message}`);
    }
  }
}

main();
