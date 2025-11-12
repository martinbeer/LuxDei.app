import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://bpjikoubhxsmsswgixix.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamlrb3ViaHhzbXNzd2dpeGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2NTg1NTIsImV4cCI6MjA2NzIzNDU1Mn0.VZQZ-H0hllmqqe-ceGJpjCMY-l0yoo8Cqds9OK_oOZc";

const supabase = createClient(supabaseUrl, supabaseKey);

const variants = [
  'Joh 3,16',
  'Johannes 3,16',
  'Joh 3 : 16'
];

const main = async () => {
  const results = new Map();

  for (const variant of variants) {
    const sanitized = variant.replace(/\s+/g, ' ').trim();
    if (!sanitized) continue;

    const { data, error } = await supabase
      .from('passages')
      .select(`
        id,
        plain_text,
        sections(
          works(
            title,
            title_original,
            authors(
              name
            )
          )
        )
      `)
      .ilike('plain_text', `%${sanitized}%`)
      .limit(5);

    if (error) {
      console.error('Supabase error:', error);
      continue;
    }

    (data || []).forEach((row) => {
      if (!results.has(row.id)) {
        results.set(row.id, row);
      }
    });
  }

  console.log(JSON.stringify(Array.from(results.values()), null, 2));
};

main();