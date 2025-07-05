const { supabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

async function importAllioli() {
  console.log('Starting Allioli import...');
  
  // First, clear the bibelverse table
  console.log('Clearing bibelverse table...');
  const { error: deleteError } = await supabase
    .from('bibelverse')
    .delete()
    .neq('id', 0); // Delete all rows
  
  if (deleteError) {
    console.error('Error clearing table:', deleteError);
    return;
  }
  
  // Read the CSV file
  const csvPath = path.join('..', 'bibelverse_allioli.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  console.log('Found', lines.length - 1, 'verses in CSV');
  
  // Parse CSV and prepare data
  const verses = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(',');
    
    if (parts.length >= 4) {
      const buch = parts[0];
      const kapitel = parseInt(parts[1]);
      const vers = parseInt(parts[2]);
      const text = parts.slice(3).join(',').replace(/^"|"$/g, ''); // Remove quotes
      
      verses.push({
        buch: buch,
        kapitel: kapitel,
        vers: vers,
        text: text
      });
    }
  }
  
  console.log('Parsed', verses.length, 'verses');
  
  // Insert in batches
  const batchSize = 1000;
  for (let i = 0; i < verses.length; i += batchSize) {
    const batch = verses.slice(i, i + batchSize);
    console.log('Importing batch', Math.floor(i / batchSize) + 1, 'of', Math.ceil(verses.length / batchSize));
    
    const { error: insertError } = await supabase
      .from('bibelverse')
      .insert(batch);
    
    if (insertError) {
      console.error('Error inserting batch:', insertError);
      return;
    }
  }
  
  console.log('Import completed successfully!');
}

importAllioli().catch(console.error);
