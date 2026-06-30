-- ════════════════════════════════════════════════════════
-- COPIA TODO ESTE BLOQUE Y PÉGALO EN:
-- Supabase → menú izquierdo → "SQL Editor" → "New query"
-- Luego presiona el botón "Run" (o Ctrl+Enter)
-- ════════════════════════════════════════════════════════

create table kv_store (
  key text primary key,
  value text not null,
  updated_at timestamp with time zone default now()
);

alter table kv_store enable row level security;

create policy "Allow all access"
on kv_store
for all
using (true)
with check (true);
