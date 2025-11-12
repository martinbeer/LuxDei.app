import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://bpjikoubhxsmsswgixix.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamlrb3ViaHhzbXNzd2dpeGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2NTg1NTIsImV4cCI6MjA2NzIzNDU1Mn0.VZQZ-H0hllmqqe-ceGJpjCMY-l0yoo8Cqds9OK_oOZc";

const supabase = createClient(supabaseUrl, supabaseKey);

const encodePattern = (value) => encodeURIComponent(value.replace(/[%_]/g, ' '));

const main = async () => {
  const variants = [
    encodePattern('Joh 3,16'),
    encodePattern('Johannes 3,16'),
    encodePattern('Joh 3 : 16')
  ];

  const clauses = variants.map((v) => `plain_text.ilike.*${v}*`).join(',');

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
    .or(clauses)
    .limit(10);

  if (error) {
    console.error('Supabase error:', error);
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
};

main();