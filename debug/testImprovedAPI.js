const { DivinumOfficiumAPI } = require('../lib/divinumOfficiumAPI');

async function testAPI() {
  const api = new DivinumOfficiumAPI();
  
  try {
    console.log('=== TESTING DIVINUM OFFICIUM API ===\n');
    
    const lauds = await api.fetchHour('lauds', 'English');
    
    console.log('LAUDS STRUCTURE:');
    console.log('- Title:', lauds.content.title);
    console.log('- Opening items:', lauds.content.opening?.length || 0);
    console.log('- Psalms:', lauds.content.psalms?.length || 0);
    console.log('- Canticle:', lauds.content.canticle ? lauds.content.canticle.type : 'none');
    console.log('- Prayers:', lauds.content.prayers?.length || 0);
    console.log('- Closing items:', lauds.content.closing?.length || 0);
    console.log('');
    
    if (lauds.content.opening?.length > 0) {
      console.log('=== OPENING ===');
      lauds.content.opening.forEach((item, i) => {
        console.log(`${i+1}. ${item.type.toUpperCase()}`);
        console.log(`   ${item.latin}`);
        if (item.response) console.log(`   ${item.response}`);
        console.log(`   (${item.english})`);
        console.log('');
      });
    }
    
    if (lauds.content.psalms?.length > 0) {
      console.log('=== FIRST PSALM ===');
      const psalm = lauds.content.psalms[0];
      console.log(`Psalm ${psalm.number}`);
      console.log(`Antiphon: ${psalm.antiphon?.latin || 'N/A'}`);
      console.log(`Verses: ${psalm.verses?.length || 0}`);
      if (psalm.verses?.length > 0) {
        console.log('First few verses:');
        psalm.verses.slice(0, 3).forEach(verse => {
          console.log(`  ${verse.chapter}:${verse.verse} ${verse.text}`);
        });
      }
      console.log('');
    }
    
    console.log('✅ API test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAPI();
