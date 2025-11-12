import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';

const SUPABASE_URL = 'https://bpjikoubhxsmsswgixix.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!OPENAI_KEY) {
  console.error('Missing OPENAI_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

const BATCH_SIZE = parseInt(process.env.EMBED_BATCH || '50', 10);
const MAX_TEXT_LENGTH = 6000;

const toVector = (embedding) => `[${embedding.map((v) => v.toFixed(8)).join(',')}]`;

const fetchBatch = async () => {
  const { data, error } = await supabase.rpc('next_passage_embedding_batch', {
    batch_size: BATCH_SIZE,
  });
  if (error) throw error;
  return data || [];
};

const upsertEmbeddings = async (rows, embeddings) => {
  const payload = rows.map((row, idx) => ({
    passage_id: row.id,
    embedding: toVector(embeddings[idx].embedding),
  }));

  const { error } = await supabase
    .from('passage_embeddings')
    .upsert(payload, { onConflict: 'passage_id' });

  if (error) throw error;
};

const run = async () => {
  while (true) {
    const rows = await fetchBatch();
    if (!rows.length) {
      console.log('All passages processed.');
      break;
    }

    const inputs = rows.map((row) => row.plain_text.slice(0, MAX_TEXT_LENGTH));
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: inputs,
    });

    await upsertEmbeddings(rows, response.data);
    console.log(`Inserted/updated ${rows.length} embeddings.`);
  }
};

run().catch((err) => {
  console.error('Failed to generate embeddings:', err);
  process.exit(1);
});

