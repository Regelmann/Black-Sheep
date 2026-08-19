-- Asegura columnas de precio en stock (si faltan, el ciclo las omite al upsert)
alter table public.stock add column if not exists precio_unidad numeric;
alter table public.stock add column if not exists precio_caja numeric;
alter table public.stock add column if not exists precio_kilo numeric;
alter table public.stock add column if not exists subfamilia text;
alter table public.stock add column if not exists imagen_url text;
alter table public.stock add column if not exists ficha_url text;
alter table public.stock add column if not exists resena text;

-- Diagnóstico
select
  count(*) as total,
  count(*) filter (where coalesce(precio_unidad,0) > 0) as con_precio_unidad,
  count(*) filter (where coalesce(precio_caja,0) > 0) as con_precio_caja
from public.stock;
