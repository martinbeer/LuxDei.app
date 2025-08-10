// Quick test script to verify Supabase image access
import { supabase } from '../lib/supabase.js';

const testSupabaseImages = async () => {
  console.log('🔍 Testing Supabase connection...');
  
  try {
    // Test 1: List files in bilder bucket
    const { data: files, error } = await supabase.storage
      .from('bilder')
      .list('', {
        limit: 10,
        offset: 0
      });

    if (error) {
      console.error('❌ Error listing files:', error);
      return;
    }

    console.log(`📁 Found ${files.length} files:`);
    files.forEach((file, index) => {
      console.log(`${index + 1}. ${file.name}`);
    });

    // Test 2: Generate URLs for first few files
    if (files.length > 0) {
      console.log('\n🔗 Testing URL generation:');
      for (let i = 0; i < Math.min(3, files.length); i++) {
        const file = files[i];
        const { data } = supabase.storage
          .from('bilder')
          .getPublicUrl(file.name);
        
        console.log(`URL for ${file.name}: ${data.publicUrl}`);
      }
    }

    // Test 3: Try to access your specific file
    console.log('\n🎯 Testing specific file:');
    const { data: specificFile } = supabase.storage
      .from('bilder')
      .getPublicUrl('300px-Hl._Hilarius_von_Poitiers.png');
    
    console.log(`Specific file URL: ${specificFile.publicUrl}`);

  } catch (error) {
    console.error('❌ General error:', error);
  }
};

testSupabaseImages();
