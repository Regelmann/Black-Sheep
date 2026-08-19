-- Fixes seguros (NO borra datos). Correr en SQL Editor.

-- 1) gerencia_clientes: asegurar columnas que usa el ciclo y la app
create table if not exists public.gerencia_clientes (
  id uuid primary key default gen_random_uuid(),
  ejecutivo text,
  canal text,
  cliente_key text not null,
  nombre_cliente text,
  comuna text,
  venta_mtd numeric,
  pct_zona numeric,
  fecha_snapshot date
);

alter table public.gerencia_clientes add column if not exists ejecutivo text;
alter table public.gerencia_clientes add column if not exists canal text;
alter table public.gerencia_clientes add column if not exists pct_zona numeric;
alter table public.gerencia_clientes add column if not exists nombre_cliente text;
alter table public.gerencia_clientes add column if not exists comuna text;
alter table public.gerencia_clientes add column if not exists venta_mtd numeric;
alter table public.gerencia_clientes add column if not exists fecha_snapshot date;

-- Si solo hay canal, copiar a ejecutivo (la app filtra por ejecutivo)
update public.gerencia_clientes
set ejecutivo = canal
where (ejecutivo is null or ejecutivo = '') and canal is not null and canal <> '';

update public.gerencia_clientes
set canal = ejecutivo
where (canal is null or canal = '') and ejecutivo is not null and ejecutivo <> '';

create unique index if not exists gerencia_clientes_ej_ck
  on public.gerencia_clientes (ejecutivo, cliente_key);

alter table public.gerencia_clientes enable row level security;
drop policy if exists gerencia_clientes_auth_select on public.gerencia_clientes;
create policy gerencia_clientes_auth_select on public.gerencia_clientes
  for select to authenticated using (true);

-- 2) pedidos: agregar columnas faltantes SIN dropear la tabla
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid()
);
alter table public.pedidos add column if not exists ejecutivo_id uuid;
alter table public.pedidos add column if not exists cliente_key text;
alter table public.pedidos add column if not exists nombre_cliente text;
alter table public.pedidos add column if not exists lineas jsonb default '[]'::jsonb;
alter table public.pedidos add column if not exists nota text;
alter table public.pedidos add column if not exists estado text default 'borrador';
alter table public.pedidos add column if not exists fuente text default 'field_app';
alter table public.pedidos add column if not exists creado_en timestamptz default now();

create index if not exists pedidos_ejecutivo_idx on public.pedidos (ejecutivo_id);
create index if not exists pedidos_creado_idx on public.pedidos (creado_en desc);

alter table public.pedidos enable row level security;
drop policy if exists pedidos_select_auth on public.pedidos;
drop policy if exists pedidos_insert_auth on public.pedidos;
drop policy if exists pedidos_update_auth on public.pedidos;
create policy pedidos_select_auth on public.pedidos for select to authenticated using (true);
create policy pedidos_insert_auth on public.pedidos for insert to authenticated with check (true);
create policy pedidos_update_auth on public.pedidos for update to authenticated using (true);

-- 3) notas
create table if not exists public.notas_cliente (
  id uuid primary key default gen_random_uuid(),
  ejecutivo_id uuid,
  cliente_key text,
  nombre_local text,
  tipo text,
  texto text,
  creado_en timestamptz default now()
);
alter table public.notas_cliente add column if not exists creado_en timestamptz default now();

notify pgrst, 'reload schema';
