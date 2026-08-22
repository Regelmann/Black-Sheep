-- Columnas canónicas de precios y media en stock (idempotente)
alter table public.stock add column if not exists precio_unidad numeric;
alter table public.stock add column if not exists precio_caja numeric;
alter table public.stock add column if not exists precio_kilo numeric;
alter table public.stock add column if not exists subfamilia text;
alter table public.stock add column if not exists imagen_url text;
alter table public.stock add column if not exists ficha_url text;
alter table public.stock add column if not exists resena text;
alter table public.stock add column if not exists es_foco_mes boolean default false;
alter table public.stock add column if not exists cobertura_dias numeric;
alter table public.stock add column if not exists estado_stock text;

select
  count(*) as total,
  count(*) filter (where coalesce(precio_unidad,0) > 0) as con_precio_unidad,
  count(*) filter (where coalesce(precio_caja,0) > 0) as con_precio_caja,
  count(*) filter (where nullif(trim(imagen_url),'') is not null) as con_imagen
from public.stock;
