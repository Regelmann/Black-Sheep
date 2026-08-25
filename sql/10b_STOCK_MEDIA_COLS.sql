-- Columnas de media en stock (idempotente)
alter table public.stock add column if not exists imagen_url text;
alter table public.stock add column if not exists resena text;
alter table public.stock add column if not exists ficha_url text;
alter table public.stock add column if not exists precio_unidad numeric;
alter table public.stock add column if not exists precio_caja numeric;
alter table public.stock add column if not exists precio_kilo numeric;
alter table public.stock add column if not exists marca text;
alter table public.stock add column if not exists subfamilia text;
alter table public.stock add column if not exists categoria text;
alter table public.stock add column if not exists unidad_venta text;

comment on column public.stock.imagen_url is 'URL pública foto producto (Drive uc?export=view o CDN)';
comment on column public.stock.ficha_url is 'URL ficha técnica PDF';
comment on column public.stock.resena is 'Descripción corta comercial';
