import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bpjikoubhxsmsswgixix.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamlrb3ViaHhzbXNzd2dpeGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2NTg1NTIsImV4cCI6MjA2NzIzNDU1Mn0.VZQZ-H0hllmqqe-ceGJpjCMY-l0yoo8Cqds9OK_oOZc';

const supabase = createClient(supabaseUrl, supabaseKey);

const main = async () => {
  const { data, error } = await supabase
    .from('kirchenvaeter')
    .select('author, work_title')
    .limit(20);

  if (error) {
    console.error('Supabase error:', error);
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
};

main();
