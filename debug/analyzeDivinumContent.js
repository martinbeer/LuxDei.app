const https = require('https');
const querystring = require('querystring');

// Let's capture and analyze what we're actually getting
function captureAndAnalyze() {
  const formData = {
    command: 'prayLaudes',
    date1: '12-9-2025',
    version: 'Rubrics 1960 - 1960'
  };
  
  const postData = querystring.stringify(formData);
  
  const options = {
    hostname: 'www.divinumofficium.com',
    port: 443,
    path: '/cgi-bin/horas/officium.pl',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': postData.length
    }
  };
  
  console.log('Capturing full response for analysis...');
  
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`Status: ${res.statusCode}, Content length: ${data.length}`);
      
      // Force save the response regardless
      const fs = require('fs');
      fs.writeFileSync('divinum_analysis_response.html', data);
      console.log('Response saved to divinum_analysis_response.html');
      
      // Let's analyze what we actually have
      console.log('\n=== DETAILED ANALYSIS ===');
      
      // Look for the actual office content within the page
      const sections = {
        'Forms and Interface': data.match(/<form[\s\S]*?<\/form>/gi),
        'Hour Navigation': data.match(/onclick="hset[^"]*"/g),
        'Main Content Area': data.match(/<div[^>]*class[^>]*>[\s\S]*?<\/div>/gi),
        'Paragraphs with Text': data.match(/<p[^>]*>[\s\S]*?<\/p>/gi),
        'Table Rows': data.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi)
      };
      
      Object.entries(sections).forEach(([name, matches]) => {
        if (matches) {
          console.log(`${name}: ${matches.length} elements found`);
          if (name === 'Paragraphs with Text' && matches.length > 0) {
            // Show some paragraph content
            const textParagraphs = matches
              .map(p => p.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
              .filter(text => text.length > 20 && !text.includes('onclick'))
              .slice(0, 3);
            
            if (textParagraphs.length > 0) {
              console.log('  Sample paragraphs:');
              textParagraphs.forEach(p => console.log('   -', p.substring(0, 100) + '...'));
            }
          }
        }
      });
      
      // Look specifically for liturgical text patterns
      console.log('\n=== LITURGICAL CONTENT SEARCH ===');
      
      const liturgicalPatterns = {
        'Psalm Numbers': /Psalm\s+\d+|Psalmus\s+\d+/gi,
        'Antiphon Text': /Ant\.\s*[^<\n]+/gi,
        'Versicles': /V\.\s*[^<\n]+/gi,
        'Responses': /R\.\s*[^<\n]+/gi,
        'Prayer Headlines': /(Oratio|Prayer|Collecta)[\s:]+/gi,
        'Latin Phrases': /\b(Gloria Patri|Alleluia|Kyrie|Sanctus|Magnificat)\b/gi
      };
      
      Object.entries(liturgicalPatterns).forEach(([name, regex]) => {
        const matches = data.match(regex);
        if (matches && matches.length > 0) {
          console.log(`${name}: ${matches.length} found`);
          console.log(`  Examples: ${matches.slice(0, 2).join(' | ')}`);
        }
      });
      
      // Try to extract actual office content by looking for specific patterns
      console.log('\n=== CONTENT EXTRACTION ATTEMPT ===');
      
      // Look for content between specific markers
      const contentMarkers = [
        /<h2[^>]*>[\s\S]*?(?=<h2|$)/gi,
        /<div[^>]*>[\s\S]*?<\/div>/gi,
        /<td[^>]*>[\s\S]*?<\/td>/gi
      ];
      
      contentMarkers.forEach((marker, index) => {
        const matches = data.match(marker);
        if (matches) {
          console.log(`Pattern ${index + 1}: ${matches.length} sections`);
          
          // Look for sections that contain liturgical content
          const liturgicalSections = matches.filter(section => {
            const text = section.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            return text.length > 50 && (
              /psalm|antiphon|prayer|gloria|alleluia/i.test(text) ||
              /\bV\.\s|\bR\.\s|\bAnt\.\s/i.test(section)
            );
          });
          
          if (liturgicalSections.length > 0) {
            console.log(`  Liturgical sections: ${liturgicalSections.length}`);
            
            // Show first liturgical section
            const sample = liturgicalSections[0]
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            console.log(`  Sample: ${sample.substring(0, 200)}...`);
          }
        }
      });
    });
  });
  
  req.on('error', (err) => {
    console.log('Error:', err.message);
  });
  
  req.write(postData);
  req.end();
}

captureAndAnalyze();
