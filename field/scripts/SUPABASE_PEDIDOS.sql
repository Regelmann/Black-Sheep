-- Pedidos en terreno (ejecutivo field)
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  ejecutivo_id uuid references auth.users(id),
  cliente_key text,
  nombre_cliente text,
  lineas jsonb not null default '[]'::jsonb,
  nota text,
  estado text default 'borrador',
  fuente text default 'field_app',
  creado_en timestamptz default now()
);

alter table public.pedidos enable row level security;

drop policy if exists pedidos_select_own on public.pedidos;
create policy pedidos_select_own on public.pedidos
  for select using (
    ejecutivo_id = auth.uid()
    or exists (select 1 from public.ejecutivos e where e.id = auth.uid() and e.es_superadmin is true)
  );

drop policy if exists pedidos_insert_own on public.pedidos;
create policy pedidos_insert_own on public.pedidos
  for insert with check (
    ejecutivo_id = auth.uid()
    or exists (select 1 from public.ejecutivos e where e.id = auth.uid() and e.es_superadmin is true)
  );

drop policy if exists pedidos_update_own on public.pedidos;
create policy pedidos_update_own on public.pedidos
  for update using (
    ejecutivo_id = auth.uid()
    or exists (select 1 from public.ejecutivos e where e.id = auth.uid() and e.es_superadmin is true)
  );

create index if not exists pedidos_ejecutivo_idx on public.pedidos (ejecutivo_id, creado_en desc);
