-- KEYFOODS COMMERCE V56.3
-- Oferta permanente por cliente + precios negociados + catálogo público + pedido público.

create extension if not exists pgcrypto;

-- 1) Extender stock para que el ciclo pueda publicar precio maestro junto al inventario.
alter table public.stock add column if not exists precio_unidad numeric;
alter table public.stock add column if not exists precio_caja numeric;
alter table public.stock add column if not exists precio_kilo numeric;
alter table public.stock add column if not exists marca text;
alter table public.stock add column if not exists unidad_venta text;

-- 2) Una oferta permanente por cliente.
create table if not exists public.ofertas_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_key text not null unique,
  ejecutivo_id uuid references auth.users(id),
  nombre_cliente text,
  token text not null unique,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists public.oferta_cliente_items (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas_cliente(id) on delete cascade,
  sku_canon text not null,
  producto_nombre text,
  precio_lista numeric,
  precio_cliente numeric,
  visible boolean not null default true,
  destacado boolean not null default false,
  prioridad integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique(oferta_id, sku_canon)
);

create index if not exists ofertas_cliente_ejecutivo_idx on public.ofertas_cliente(ejecutivo_id);
create index if not exists oferta_items_oferta_idx on public.oferta_cliente_items(oferta_id, prioridad);

alter table public.ofertas_cliente enable row level security;
alter table public.oferta_cliente_items enable row level security;

drop policy if exists ofertas_cliente_own on public.ofertas_cliente;
create policy ofertas_cliente_own on public.ofertas_cliente
for all using (
  ejecutivo_id = auth.uid()
  or exists (select 1 from public.ejecutivos e where e.id = auth.uid() and e.es_superadmin is true)
) with check (
  ejecutivo_id = auth.uid()
  or exists (select 1 from public.ejecutivos e where e.id = auth.uid() and e.es_superadmin is true)
);

drop policy if exists oferta_items_own on public.oferta_cliente_items;
create policy oferta_items_own on public.oferta_cliente_items
for all using (
  exists (
    select 1 from public.ofertas_cliente o
    where o.id = oferta_id
      and (o.ejecutivo_id = auth.uid()
        or exists (select 1 from public.ejecutivos e where e.id = auth.uid() and e.es_superadmin is true))
  )
) with check (
  exists (
    select 1 from public.ofertas_cliente o
    where o.id = oferta_id
      and (o.ejecutivo_id = auth.uid()
        or exists (select 1 from public.ejecutivos e where e.id = auth.uid() and e.es_superadmin is true))
  )
);

-- 3) Lectura pública por token. No expone cliente_key, ejecutivo_id ni token.
create or replace function public.get_public_catalogo(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_build_object(
    'nombre_cliente', o.nombre_cliente,
    'actualizado_en', o.actualizado_en,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sku_canon', i.sku_canon,
        'producto_nombre', coalesce(i.producto_nombre, s.producto_nombre, i.sku_canon),
        'subfamilia', s.subfamilia,
        'precio', coalesce(i.precio_cliente, i.precio_lista, s.precio_unidad, s.precio_caja),
        'precio_lista', coalesce(i.precio_lista, s.precio_unidad, s.precio_caja),
        'stock_disponible', coalesce(s.stock_operativo, 0) > 0 and coalesce(s.estado_stock, '') not in ('SIN_STOCK','VENCIDO'),
        'stock_operativo', coalesce(s.stock_operativo, 0),
        'estado_stock', s.estado_stock,
        'destacado', i.destacado,
        'prioridad', i.prioridad
      ) order by i.destacado desc, i.prioridad asc, i.producto_nombre asc)
      from public.oferta_cliente_items i
      left join public.stock s on s.sku_canon = i.sku_canon
      where i.oferta_id = o.id and i.visible = true
    ), '[]'::jsonb)
  ), '{}'::jsonb)
  from public.ofertas_cliente o
  where o.token = p_token and o.activo = true;
$$;

-- 4) Pedido desde el catálogo público.
create or replace function public.crear_pedido_publico(p_token text, p_lineas jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.ofertas_cliente%rowtype;
  v_id uuid;
  v_line jsonb;
  v_sku text;
  v_qty numeric;
  v_item public.oferta_cliente_items%rowtype;
  v_price numeric;
  v_validated jsonb := '[]'::jsonb;
begin
  select * into v_offer from public.ofertas_cliente where token = p_token and activo = true limit 1;
  if not found then raise exception 'CATALOGO_NO_DISPONIBLE'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'PEDIDO_VACIO'; end if;

  for v_line in select * from jsonb_array_elements(p_lineas) loop
    v_sku := trim(v_line->>'sku');
    v_qty := greatest(0, coalesce((v_line->>'cantidad')::numeric, 0));
    if v_sku is null or v_sku = '' or v_qty <= 0 then continue; end if;

    select * into v_item
    from public.oferta_cliente_items
    where oferta_id = v_offer.id and sku_canon = v_sku and visible = true
    limit 1;

    if not found then continue; end if;

    v_price := coalesce(v_item.precio_cliente, v_item.precio_lista, 0);
    v_validated := v_validated || jsonb_build_array(jsonb_build_object(
      'sku', v_item.sku_canon,
      'nombre', v_item.producto_nombre,
      'cantidad', v_qty,
      'precio', v_price
    ));
  end loop;

  if jsonb_array_length(v_validated) = 0 then raise exception 'PEDIDO_SIN_PRODUCTOS_VALIDOS'; end if;

  insert into public.pedidos (ejecutivo_id, cliente_key, nombre_cliente, lineas, nota, estado, fuente)
  values (v_offer.ejecutivo_id, v_offer.cliente_key, v_offer.nombre_cliente, v_validated, 'Pedido recibido desde catálogo público', 'recibido', 'catalogo_publico')
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.get_public_catalogo(text) to anon, authenticated;
grant execute on function public.crear_pedido_publico(text, jsonb) to anon, authenticated;

-- Evita que el anon pueda leer las tablas directamente.
revoke all on table public.ofertas_cliente from anon;
revoke all on table public.oferta_cliente_items from anon;
