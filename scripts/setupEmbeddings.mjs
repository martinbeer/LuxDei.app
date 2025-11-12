import { Client } from 'pg';

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamlrb3ViaHhzbXNzd2dpeGl4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTY1ODU1MiwiZXhwIjoyMDY3MjM0NTUyfQ.GiM-rfWsV0sun4JKO0nJg1UQwsXWCirz5FtM74g6eUk';

const PG_HOST = process.env.SUPABASE_DB_HOST || 'db.bpjikoubhxsmsswgixix.supabase.co';
const PG_PORT = process.env.SUPABASE_DB_PORT || '5432';
const PG_DATABASE = process.env.SUPABASE_DB_NAME || 'postgres';
const PG_USER = process.env.SUPABASE_DB_USER || 'postgres';

const connectionString = `postgresql://${encodeURIComponent(PG_USER)}:${encodeURIComponent(
  SERVICE_ROLE_KEY,
)}@${PG_HOST}:${PG_PORT}/${PG_DATABASE}?sslmode=require`;

const statements = [
  `create extension if not exists vector;`,
  `create table if not exists passage_embeddings (
    passage_id uuid primary key references passages(id) on delete cascade,
    embedding vector(1536) not null,
    updated_at timestamptz default now()
  );`,
  `create index if not exists passage_embeddings_embedding_idx
    on passage_embeddings
    using ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`,
  `create or replace function public.match_passages (
      query_embedding vector(1536),
      match_limit int default 12,
      min_similarity float default 0.20
    )
    returns table (
      passage_id uuid,
      author text,
      work_title text,
      plain_text text,
      similarity float
    )
    language sql
    stable
  as $function$
    select
      p.id as passage_id,
      a.name as author,
      coalesce(w.title, w.title_original) as work_title,
      p.plain_text,
      1 - (e.embedding <=> query_embedding) as similarity
    from passage_embeddings e
    join passages p on p.id = e.passage_id
    join sections s on s.id = p.section_id
    join works w on w.id = s.work_id
    join authors a on a.id = w.author_id
    where query_embedding <=> e.embedding <= (1 - min_similarity)
    order by e.embedding <-> query_embedding
    limit match_limit;
  $function$;`,
  `grant execute on function public.match_passages(vector(1536), int, float) to anon, authenticated;`,
];

const run = async () => {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const sql of statements) {
      console.log(`Executing: ${sql.split('\n')[0]}...`);
      await client.query(sql);
    }
    console.log('Setup complete.');
  } finally {
    await client.end();
  }
};

run().catch((err) => {
  console.error('Failed to run setupEmbeddings:', err);
  process.exit(1);
});
