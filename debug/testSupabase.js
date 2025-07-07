// Debug script to test Supabase Storage connection
import { supabase } from '../lib/supabase.js';

async function testSupabaseStorage() {
  console.log('🔍 Testing Supabase Storage connection...');
  
  try {
    // Test 1: Basic connection
    console.log('\n1. Testing basic connection...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.warn('⚠️ Auth session error (expected for public bucket):', sessionError.message);
    } else {
      console.log('✅ Auth session check passed');
    }
    
    // Test 2: List buckets
    console.log('\n2. Listing all buckets...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (bucketsError) {
      console.error('❌ Error listing buckets:', bucketsError);
    } else {
      console.log('📂 Available buckets:', buckets.map(b => b.name));
    }
    
    // Test 3: Check if 'bilder' bucket exists
    console.log('\n3. Testing access to "bilder" bucket...');
    const { data: bilderFiles, error: bilderError } = await supabase.storage
      .from('bilder')
      .list('', {
        limit: 100,
        offset: 0
      });
    
    // Test 3b: Also try to list with search pattern for common image types
    console.log('\n3b. Testing with search for image files...');
    const { data: searchFiles, error: searchError } = await supabase.storage
      .from('bilder')
      .list('', {
        limit: 100,
        offset: 0,
        search: '.jpg'
      });
    
    if (bilderError) {
      console.error('❌ Error accessing "bilder" bucket:', bilderError);
      console.error('Full error details:', JSON.stringify(bilderError, null, 2));
    } else {
      console.log(`✅ "bilder" bucket accessible! Found ${bilderFiles?.length || 0} files`);
      if (bilderFiles && bilderFiles.length > 0) {
        console.log('📁 First few files:');
        bilderFiles.slice(0, 5).forEach(file => {
          console.log(`   - ${file.name} (${file.metadata?.size || 'unknown size'})`);
        });
      }
    }
    
    if (searchError) {
      console.error('❌ Error searching for images:', searchError);
    } else {
      console.log(`🔍 Search for .jpg files found: ${searchFiles?.length || 0} files`);
      if (searchFiles && searchFiles.length > 0) {
        console.log('📷 Found images:');
        searchFiles.slice(0, 5).forEach(file => {
          console.log(`   - ${file.name} (${file.metadata?.size || 'unknown size'})`);
        });
      }
    }
    
    // Test 4: Try to get public URL for first file (if any)
    const testFiles = bilderFiles && bilderFiles.length > 0 ? bilderFiles : searchFiles;
    if (testFiles && testFiles.length > 0) {
      console.log('\n4. Testing public URL generation...');
      const firstFile = testFiles[0];
      const { data: urlData } = supabase.storage
        .from('bilder')
        .getPublicUrl(firstFile.name);
      
      if (urlData?.publicUrl) {
        console.log(`✅ Public URL generated: ${urlData.publicUrl}`);
        
        // Test if URL is accessible
        try {
          const response = await fetch(urlData.publicUrl, { method: 'HEAD' });
          console.log(`📡 URL accessibility test: ${response.status} ${response.statusText}`);
        } catch (fetchError) {
          console.warn('⚠️ URL fetch test failed:', fetchError.message);
        }
      } else {
        console.error('❌ Failed to generate public URL');
      }
    }
    
  } catch (error) {
    console.error('❌ General error:', error);
  }
}

// Run the test
testSupabaseStorage()
  .then(() => {
    console.log('\n🏁 Supabase test completed');
  })
  .catch(error => {
    console.error('💥 Test failed:', error);
  });
