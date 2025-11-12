-- Schema for storing council documents in Supabase
create extension if not exists "pgcrypto";

create table if not exists council (
    slug text primary key,
    title text not null,
    ordinal smallint,
    start_year smallint,
    end_year smallint,
    location text,
    convened_by text,
    metadata jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists council_document (
    id uuid primary key default gen_random_uuid(),
    council_slug text not null references council(slug) on delete cascade,
    doc_slug text not null,
    title text not null,
    doc_type text,
    promulgation_date date,
    source_url text not null,
    source_license text,
    language text not null default 'de',
    content_html text not null,
    content_text text not null,
    content_hash text not null,
    metadata jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (council_slug, doc_slug)
);

create table if not exists council_document_section (
    id uuid primary key default gen_random_uuid(),
    document_id uuid not null references council_document(id) on delete cascade,
    section_slug text not null,
    heading text,
    order_index int not null,
    content_html text not null,
    content_text text not null,
    unique (document_id, section_slug)
);

alter table council enable row level security;
alter table council_document enable row level security;
alter table council_document_section enable row level security;

-- service role policy for read/write operations
drop policy if exists council_service_role on council;
create policy council_service_role on council
    for all using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists council_document_service_role on council_document;
create policy council_document_service_role on council_document
    for all using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

drop policy if exists council_document_section_service_role on council_document_section;
create policy council_document_section_service_role on council_document_section
    for all using (auth.role() = 'service_role')
    with check (auth.role() = 'service_role');

-- public read access for anon key
drop policy if exists council_public_select on council;
create policy council_public_select on council
    for select using (true);

drop policy if exists council_document_public_select on council_document;
create policy council_document_public_select on council_document
    for select using (true);

drop policy if exists council_document_section_public_select on council_document_section;
create policy council_document_section_public_select on council_document_section
    for select using (true);
