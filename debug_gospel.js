// Debugging tool für Supabase Gospel Queries
import { createClient } from '@supabase/supabase-js';

// Supabase config aus der App
const supabaseUrl = 'https://dagnzrplrbtnkboyqrfj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhZ256cnBscmJ0bmtib3lxcmZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTgxNjY5NzQsImV4cCI6MjAzMzc0Mjk3NH0.k8wbUKd2laO_KtnpqT6TMuWQjzGBU_1Ah1P0JhZPCsE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testGospelQueries() {
  console.log('=== GOSPEL DATABASE DEBUG TEST ===\n');
  
  const gospelTests = [
    { book: 'Matthaeusevangelium', table: 'bibelverse', testament: null },
    { book: 'Mt', table: 'bibelverse_schoenigh', testament: 'NT' },
    { book: 'Mt', table: 'bibelverse_einheit', testament: 'NT' }
  ];
  
  const chapter = 5;
  const startVerse = 1;
  const endVerse = 12;
  
  for (const test of gospelTests) {
    console.log(`--- Testing ${test.table} ---`);
    console.log(`Book: ${test.book}`);
    console.log(`Chapter: ${chapter}, Verses: ${startVerse}-${endVerse}`);
    console.log(`Testament filter: ${test.testament || 'None'}`);
    
    try {
      let query = supabase
        .from(test.table)
        .select('*')
        .eq('buch', test.book)
        .eq('kapitel', chapter)
        .gte('vers', startVerse)
        .lte('vers', endVerse);
      
      if (test.testament) {
        query = query.eq('testament', test.testament);
      }
      
      const { data, error } = await query.order('vers');
      
      console.log(`✅ Query successful:`);
      console.log(`   Returned ${data?.length || 0} verses`);
      if (error) {
        console.log(`❌ Error: ${error.message}`);
      }
      if (data && data.length > 0) {
        console.log(`   First verse: ${data[0].text?.substring(0, 100)}...`);
        console.log(`   Verse numbers: ${data.map(v => v.vers).join(', ')}`);
      }
      
    } catch (err) {
      console.log(`❌ Exception: ${err.message}`);
    }
    
    console.log('');
  }
  
  // Zusätzlich: Teste alle verfügbaren Bücher in jeder Tabelle
  console.log('=== AVAILABLE BOOKS TEST ===\n');
  
  for (const test of gospelTests) {
    console.log(`--- Available books in ${test.table} ---`);
    try {
      const { data, error } = await supabase
        .from(test.table)
        .select('buch')
        .limit(1000);
      
      if (error) {
        console.log(`❌ Error: ${error.message}`);
      } else {
        const uniqueBooks = [...new Set(data.map(row => row.buch))];
        console.log(`Found ${uniqueBooks.length} unique books:`);
        const gospelBooks = uniqueBooks.filter(book => 
          book.toLowerCase().includes('matt') || 
          book.toLowerCase().includes('mark') || 
          book.toLowerCase().includes('luk') || 
          book.toLowerCase().includes('johan') ||
          book === 'Mt' || book === 'Mk' || book === 'Lk' || book === 'Joh'
        );
        console.log(`Gospel books: ${gospelBooks.join(', ')}`);
      }
    } catch (err) {
      console.log(`❌ Exception: ${err.message}`);
    }
    console.log('');
  }
}

testGospelQueries();