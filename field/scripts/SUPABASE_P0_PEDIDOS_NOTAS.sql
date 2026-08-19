-- =============================================================================
-- P0: pedidos + notas (correr UNA vez en Supabase SQL Editor)
-- =============================================================================

-- PEDIDOS
drop table if exists public.pedidos cascade;
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  ejecutivo_id uuid,
  cliente_key text,
  nombre_cliente text,
  lineas jsonb not null default '[]'::jsonb,
  nota text,
  estado text default 'borrador',
  fuente text default 'field_app',
  creado_en timestamptz default now()
);
create index pedidos_ejecutivo_idx on public.pedidos (ejecutivo_id);
create index pedidos_creado_idx on public.pedidos (creado_en desc);
create index pedidos_cliente_idx on public.pedidos (cliente_key);

alter table public.pedidos enable row level security;
create policy pedidos_select_auth on public.pedidos for select to authenticated using (true);
create policy pedidos_insert_auth on public.pedidos for insert to authenticated with check (true);
create policy pedidos_update_auth on public.pedidos for update to authenticated using (true);

-- NOTAS
create table if not exists public.notas_cliente (
  id uuid primary key default gen_random_uuid(),
  ejecutivo_id uuid,
  cliente_key text,
  nombre_local text,
  tipo text,
  texto text,
  creado_en timestamptz default now()
);
create index if not exists notas_cliente_ejecutivo_idx on public.notas_cliente (ejecutivo_id);
create index if not exists notas_cliente_creado_idx on public.notas_cliente (creado_en desc);

alter table public.notas_cliente enable row level security;
drop policy if exists notas_select on public.notas_cliente;
drop policy if exists notas_insert on public.notas_cliente;
create policy notas_select on public.notas_cliente for select to authenticated using (true);
create policy notas_insert on public.notas_cliente for insert to authenticated with check (true);

notify pgrst, 'reload schema';
