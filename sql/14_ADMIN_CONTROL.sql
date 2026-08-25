-- =============================================================================
-- BLACK SHEEP · Panel de control completo (Admin V2.8.1)
-- Media productos + metas + focos + RLS de escritura
-- =============================================================================

-- Columnas media en stock
alter table public.stock add column if not exists imagen_url text;
alter table public.stock add column if not exists resena text;
alter table public.stock add column if not exists ficha_url text;
alter table public.stock add column if not exists es_foco_mes boolean default false;
alter table public.stock add column if not exists precio_unidad numeric;
alter table public.stock add column if not exists precio_caja numeric;
alter table public.stock add column if not exists precio_kilo numeric;

-- zonas_comunas
create table if not exists public.zonas_comunas (
  comuna text primary key,
  zona text not null
);
alter table public.zonas_comunas enable row level security;
drop policy if exists zonas_comunas_select on public.zonas_comunas;
drop policy if exists zonas_comunas_write on public.zonas_comunas;
create policy zonas_comunas_select on public.zonas_comunas for select to authenticated using (true);
create policy zonas_comunas_write on public.zonas_comunas for all to authenticated using (true) with check (true);

-- Escritura operativa (gerente desde la app)
drop policy if exists cartera_update_admin on public.cartera;
create policy cartera_update_admin on public.cartera for update to authenticated using (true) with check (true);

drop policy if exists stock_update_admin on public.stock;
create policy stock_update_admin on public.stock for update to authenticated using (true) with check (true);

drop policy if exists prospectos_update_admin on public.prospectos;
create policy prospectos_update_admin on public.prospectos for update to authenticated using (true) with check (true);

-- Metas
alter table public.metas add column if not exists meta_mensual numeric;
alter table public.metas add column if not exists venta_mtd numeric;
alter table public.metas add column if not exists pct_avance numeric;
alter table public.metas add column if not exists mes date;
alter table public.metas add column if not exists ejecutivo_id text;
alter table public.metas add column if not exists fecha_snapshot date;

alter table public.metas enable row level security;
drop policy if exists metas_select on public.metas;
drop policy if exists metas_write on public.metas;
create policy metas_select on public.metas for select to authenticated using (true);
create policy metas_write on public.metas for all to authenticated using (true) with check (true);

-- Focos
alter table public.focos add column if not exists foco text;
alter table public.focos add column if not exists meta_unidad numeric;
alter table public.focos add column if not exists vendido_unidad numeric;
alter table public.focos add column if not exists unidad_meta text;
alter table public.focos add column if not exists pct_avance numeric;
alter table public.focos add column if not exists estado_ritmo text;
alter table public.focos add column if not exists ejecutivo_id text;
alter table public.focos add column if not exists fecha_snapshot date;

alter table public.focos enable row level security;
drop policy if exists focos_select on public.focos;
drop policy if exists focos_write on public.focos;
create policy focos_select on public.focos for select to authenticated using (true);
create policy focos_write on public.focos for all to authenticated using (true) with check (true);

-- Bucket Storage para fotos (ejecutar en Dashboard → Storage si falla por permisos)
-- insert into storage.buckets (id, name, public) values ('productos', 'productos', true)
--   on conflict (id) do nothing;

comment on column public.stock.imagen_url is 'Foto catálogo (URL pública o Storage productos/)';
comment on column public.stock.ficha_url is 'Ficha técnica PDF';
comment on column public.stock.resena is 'Descripción corta comercial';
