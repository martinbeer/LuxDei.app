import { supabase } from '../lib/supabase.js';

const run = async () => {
  console.log('== Supabase quick health check ==');
  try {
    // 1) List buckets
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (bucketsError) {
      console.error('Buckets list error:', bucketsError);
    } else {
      console.log('Buckets:', buckets.map(b => `${b.name}${b.public ? ' (public)' : ''}`).join(', ') || '(none)');
    }

    const bucketsToCheck = ['bilder', 'kirchenvaeter-images'];

    for (const b of bucketsToCheck) {
      const { data: list, error: listErr } = await supabase.storage.from(b).list('', { limit: 20 });
      if (listErr) {
        console.log(`Bucket ${b}: list error ->`, listErr.message || listErr);
      } else {
        console.log(`Bucket ${b}: ${list?.length || 0} objects`);
        if (list && list.length) {
          const names = list.slice(0, 5).map(x => x.name);
          console.log(`  first objects: ${names.join(', ')}`);
        }
      }
    }

    // 2) Try public URL for a sample file in both buckets
    const sample = '300px-Hl._Hilarius_von_Poitiers.png';
    for (const b of bucketsToCheck) {
      const { data } = supabase.storage.from(b).getPublicUrl(sample);
      console.log(`Public URL [${b}/${sample}]: ${data.publicUrl}`);
    }

    // 3) Simple table probe (first row) for key tables used in app
    const tables = [
      'kirchenvater',        // current target table name in app
      'kirchenvaeter',       // legacy/plural variant from converters
      'bibelverse',          // Allioli
      'bibelverse_schoenigh',// Schöningh
      'bibelverse_einheit',  // Einheitsübersetzung
      'bilder'               // optional helper table if exists
    ];
    for (const t of tables) {
      const { data, error } = await supabase.from(t).select('*').limit(1);
      if (error) {
        console.log(`Table ${t}: SELECT error ->`, error.message || error);
      } else {
        console.log(`Table ${t}: ${data?.length || 0} rows (first row preview)`);
        if (data && data[0]) {
          const preview = Object.fromEntries(Object.entries(data[0]).slice(0, 5));
          console.log(`  columns: ${Object.keys(preview).join(', ')}`);
        }
      }
    }
  } catch (e) {
    console.error('General error:', e);
  }
};

run();
