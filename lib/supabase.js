import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bpjikoubhxsmsswgixix.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamlrb3ViaHhzbXNzd2dpeGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2NTg1NTIsImV4cCI6MjA2NzIzNDU1Mn0.VZQZ-H0hllmqqe-ceGJpjCMY-l0yoo8Cqds9OK_oOZc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
