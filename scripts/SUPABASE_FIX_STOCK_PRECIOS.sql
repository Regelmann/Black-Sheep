-- Columnas de precio en stock (idempotente)
alter table public.stock add column if not exists precio_unidad numeric;
alter table public.stock add column if not exists precio_caja numeric;
alter table public.stock add column if not exists precio_kilo numeric;
alter table public.stock add column if not exists marca text;
alter table public.stock add column if not exists unidad_venta text;
alter table public.stock add column if not exists subfamilia text;
alter table public.stock add column if not exists imagen_url text;
alter table public.stock add column if not exists resena text;
alter table public.stock add column if not exists ficha_url text;

-- Diagnóstico
select
  count(*) as total,
  count(*) filter (where coalesce(precio_unidad, 0) > 0) as con_precio_unidad,
  count(*) filter (where coalesce(precio_caja, 0) > 0) as con_precio_caja,
  count(*) filter (where coalesce(precio_kilo, 0) > 0) as con_precio_kilo,
  count(*) filter (
    where coalesce(precio_unidad, 0) > 0
       or coalesce(precio_caja, 0) > 0
       or coalesce(precio_kilo, 0) > 0
  ) as con_cualquier_precio
from public.stock;

-- Muestra SKUs sin precio
select sku_canon, producto_nombre, precio_unidad, precio_caja, precio_kilo
from public.stock
order by coalesce(precio_unidad,0) asc, sku_canon
limit 20;
