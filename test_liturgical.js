const today = new Date().toISOString().slice(0, 10);
console.log('Fetching liturgical data for:', today);

async function fetchLiturgicalData() {
  try {
    const response = await fetch(`https://pub.holstein.app/calendar?date=${today}`);
    const data = await response.json();
    console.log('Liturgical data response:', JSON.stringify(data, null, 2));
    
    if (data.readings) {
      const gospel = data.readings.find(r => r.type === 'gospel');
      console.log('\nGospel reading:', gospel);
      
      if (gospel) {
        console.log('\nGospel reference:', gospel.reference);
        console.log('Gospel title:', gospel.title);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

fetchLiturgicalData();