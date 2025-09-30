const https = require('https');
const querystring = require('querystring');

// Let's try with all the parameters from the hidden form fields
function testWithFullParams() {
  // Extract all the setup parameters from the original form
  const setupString = "general;;;$expand='tota';;$version='Rubrics 1960 - 1960';;$lang2='English';;$votive='Hodie';;;generalc;;;$expand='tota';;$version='Divino Afflatu';;$version2='Rubrics 1960 - 1960';;$langc='Latin';;$accented='plain';;;generalccheck;;;ooooo;;;generalcheck;;;oooo;;;parameters;;;$priest='0';;$building='0';;$lang1='Latin';;$psalmvar='0';;$whitebground='1';;$blackfont='';;$smallblack='-1';;$redfont=' italic red';;$initiale='+2 bold italic red';;$largefont='+1 bold italic red';;$smallfont='1 red';;$titlefont='+1 red';;$screenheight='1024';;$textwidth='100';;$oldhymns='0';;$nonumbers='0';;$nofancychars='0';;$noinnumbers='1';;$noflexa='1';;$langfb='English';;$testmode='Proper';;;parameterscheck;;;bbtbbbtcccccnnbbbbbtt;;;";
  
  const formData = {
    command: 'prayLaudes',
    date: '12-9-2025',
    date1: '12-9-2025',
    setup: setupString,
    expandnum: '',
    popup: '',
    popuplang: '',
    officium: 'officium.pl',
    browsertime: '',
    version: 'Rubrics 1960 - 1960',
    version2: '',
    caller: '',
    compare: '',
    plures: '',
    kmonth: '',
    searchvalue: '0'
  };
  
  console.log('Testing with full parameters...');
  console.log('Command:', formData.command);
  
  const postData = querystring.stringify(formData);
  console.log('POST data length:', postData.length);
  
  const options = {
    hostname: 'www.divinumofficium.com',
    port: 443,
    path: '/cgi-bin/horas/officium.pl',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': postData.length,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.divinumofficium.com/cgi-bin/horas/officium.pl',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  };
  
  const req = https.request(options, (res) => {
    let data = '';
    console.log(`Status: ${res.statusCode}`);
    console.log('Response headers:', Object.keys(res.headers));
    
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`Content length: ${data.length}`);
      
      // Check for error messages
      if (res.statusCode !== 200) {
        console.log('❌ Non-200 status code');
        console.log('Response:', data);
        return;
      }
      
      // Check content type
      const isHTML = data.trim().startsWith('<!DOCTYPE') || data.trim().startsWith('<html');
      console.log('Is HTML?', isHTML);
      
      if (isHTML) {
        // Look for liturgical content patterns
        const patterns = {
          'Form Elements': /<(form|input|select)/gi,
          'Hour Links': /onclick="hset/gi,
          'Psalm References': /psalm\s*\d+/gi,
          'Antiphons': /ant\.|antiphon/gi,
          'Latin Liturgy': /\b(gloria|alleluia|amen|dominus|deus)\b/gi,
          'Prayer Text': /(oremus|prayer|oratio)/gi
        };
        
        console.log('\nContent Analysis:');
        Object.entries(patterns).forEach(([name, regex]) => {
          const matches = data.match(regex);
          console.log(`${name}: ${matches ? matches.length : 0} matches`);
          if (matches && matches.length > 0) {
            console.log(`  Examples: ${[...new Set(matches.slice(0, 3))].join(', ')}`);
          }
        });
        
        // If it's still the interface, maybe try different approach
        if (data.includes('onclick="hset')) {
          console.log('\n❌ Still getting the main interface');
          console.log('Let me try a different date format...');
          tryDifferentDateFormat();
        } else {
          console.log('\n✅ This might be actual content!');
          // Save the response
          const fs = require('fs');
          fs.writeFileSync('divinum_laudes_full_params.html', data);
          console.log('Saved response to divinum_laudes_full_params.html');
          
          // Show a preview of the content
          const cleanText = data
            .replace(/<script[^>]*>.*?<\/script>/gs, '')
            .replace(/<style[^>]*>.*?<\/style>/gs, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          console.log('\nContent preview:', cleanText.substring(0, 400) + '...');
        }
      } else {
        console.log('❌ Response is not HTML');
        console.log('Response:', data);
      }
    });
  });
  
  req.on('error', (err) => {
    console.log('❌ Request error:', err.message);
  });
  
  req.write(postData);
  req.end();
}

function tryDifferentDateFormat() {
  console.log('\n--- Trying different date format ---');
  
  // Try with today's date in different format
  const today = new Date();
  const dateFormats = [
    today.toISOString().split('T')[0], // YYYY-MM-DD
    `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`, // DD-M-YYYY
    `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`, // M/DD/YYYY
    'today',
    ''
  ];
  
  console.log('Trying date formats:', dateFormats);
  
  // Just try the simplest possible request
  const simpleData = querystring.stringify({
    command: 'prayLaudes',
    date1: dateFormats[1],
    version: 'Rubrics 1960 - 1960'
  });
  
  const options = {
    hostname: 'www.divinumofficium.com',
    port: 443,
    path: '/cgi-bin/horas/officium.pl',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': simpleData.length
    }
  };
  
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`Simple request - Status: ${res.statusCode}, Length: ${data.length}`);
      
      if (res.statusCode === 200 && !data.includes('onclick="hset')) {
        console.log('✅ Simple request might have worked!');
        const fs = require('fs');
        fs.writeFileSync('divinum_simple_request.html', data);
      } else {
        console.log('❌ Simple request also returns interface');
      }
    });
  });
  
  req.write(simpleData);
  req.end();
}

testWithFullParams();
