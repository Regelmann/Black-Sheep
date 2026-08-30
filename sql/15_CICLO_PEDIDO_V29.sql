-- ⚠️  ATENCIÓN · las políticas `using (true)` de este archivo quedan
--     REEMPLAZADAS por 28_RLS_ESTRICTO.sql.
--     `using (true)` = cualquier usuario autenticado ve TODO. Con un
--     solo tenant no duele; con el segundo es fuga entre empresas.
--     Correr 28 SIEMPRE después de este archivo.

-- Pedido lifecycle + índices (V2.9)
alter table public.pedidos add column if not exists estado text default 'borrador';
alter table public.pedidos add column if not exists fuente text;
alter table public.pedidos add column if not exists nota text;
alter table public.pedidos add column if not exists ejecutivo_id text;
alter table public.pedidos add column if not exists cliente_key text;
alter table public.pedidos add column if not exists total_estimado numeric;
alter table public.pedidos add column if not exists actualizado_en timestamptz default now();

create index if not exists pedidos_estado_idx on public.pedidos (estado);
create index if not exists pedidos_ejecutivo_estado_idx on public.pedidos (ejecutivo_id, estado);
create index if not exists pedidos_cliente_idx on public.pedidos (cliente_key);

comment on column public.pedidos.estado is
  'borrador|recibido|confirmado|preparado|enviado|entregado|cancelado';

-- Ejecutivos: lectura + escritura admin
alter table public.ejecutivos add column if not exists email text;
alter table public.ejecutivos add column if not exists rol text default 'ejecutivo';
alter table public.ejecutivos enable row level security;
drop policy if exists ejecutivos_select on public.ejecutivos;
drop policy if exists ejecutivos_write on public.ejecutivos;
create policy ejecutivos_select on public.ejecutivos for select to authenticated using (true);
create policy ejecutivos_write on public.ejecutivos for all to authenticated using (true) with check (true);
