-- =============================================================================
-- KEYFOODS · Health check commerce (V56.16)
-- Correr en SQL Editor después del ciclo de producción
-- =============================================================================

-- 1) Cobertura de precios y media
select
  count(*) as stock_total,
  count(*) filter (where coalesce(precio_unidad, 0) > 0) as con_precio_unidad,
  count(*) filter (where coalesce(precio_caja, 0) > 0) as con_precio_caja,
  count(*) filter (where coalesce(precio_kilo, 0) > 0) as con_precio_kilo,
  count(*) filter (where nullif(trim(imagen_url), '') is not null) as con_imagen,
  count(*) filter (where nullif(trim(ficha_url), '') is not null) as con_ficha,
  count(*) filter (
    where coalesce(stock_operativo, 0) > 0
      and coalesce(estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')
  ) as stock_operativo_ok,
  count(*) filter (
    where coalesce(stock_operativo, 0) > 0
      and coalesce(estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')
      and coalesce(precio_unidad, 0) <= 0
  ) as operativo_sin_precio
from public.stock;

-- 2) Top SKUs operativos sin precio (a resolver en próxima lista)
select sku_canon, producto_nombre, stock_operativo, estado_stock, cobertura_dias
from public.stock
where coalesce(stock_operativo, 0) > 0
  and coalesce(estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')
  and coalesce(precio_unidad, 0) <= 0
order by stock_operativo desc
limit 20;

-- 3) Distribución de origen de precio (si hay ofertas activas)
-- select precio_origen, count(*) from ... (via get_public_catalogo en app)

-- 4) Columnas requeridas (idempotente reminder)
-- alter table public.stock add column if not exists precio_unidad numeric;
-- alter table public.stock add column if not exists precio_caja numeric;
-- alter table public.stock add column if not exists precio_kilo numeric;
-- alter table public.stock add column if not exists imagen_url text;
-- alter table public.stock add column if not exists ficha_url text;
