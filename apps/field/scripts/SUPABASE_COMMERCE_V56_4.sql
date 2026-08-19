-- Black Sheep Commerce V56.4 — catálogo rico (foto, reseña, ficha) + precios
create extension if not exists pgcrypto;

alter table public.stock add column if not exists precio_unidad numeric;
alter table public.stock add column if not exists precio_caja numeric;
alter table public.stock add column if not exists precio_kilo numeric;
alter table public.stock add column if not exists marca text;
alter table public.stock add column if not exists unidad_venta text;
alter table public.stock add column if not exists imagen_url text;
alter table public.stock add column if not exists resena text;
alter table public.stock add column if not exists ficha_url text;
-- subfamilia ya existe en muchos schemas; se usa como categoría

create table if not exists public.ofertas_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_key text not null,
  nombre_cliente text,
  ejecutivo_id uuid,
  token text not null unique,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists ofertas_cliente_cliente_idx on public.ofertas_cliente (cliente_key);
create index if not exists ofertas_cliente_token_idx on public.ofertas_cliente (token);

create table if not exists public.oferta_cliente_items (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas_cliente(id) on delete cascade,
  sku_canon text not null,
  producto_nombre text,
  precio_lista numeric,
  precio_cliente numeric,
  visible boolean not null default true,
  destacado boolean not null default false,
  prioridad int not null default 100,
  unique (oferta_id, sku_canon)
);

alter table public.pedidos add column if not exists fuente text;
alter table public.pedidos add column if not exists total_estimado numeric;
alter table public.pedidos add column if not exists nombre_cliente text;

alter table public.ofertas_cliente enable row level security;
alter table public.oferta_cliente_items enable row level security;

drop policy if exists ofertas_cliente_owner on public.ofertas_cliente;
create policy ofertas_cliente_owner on public.ofertas_cliente
  for all to authenticated
  using (
    ejecutivo_id = auth.uid()
    or exists (select 1 from public.ejecutivos e where e.id = auth.uid() and coalesce(e.es_superadmin,false) is true)
  )
  with check (
    ejecutivo_id = auth.uid()
    or exists (select 1 from public.ejecutivos e where e.id = auth.uid() and coalesce(e.es_superadmin,false) is true)
  );

drop policy if exists oferta_items_owner on public.oferta_cliente_items;
create policy oferta_items_owner on public.oferta_cliente_items
  for all to authenticated
  using (
    exists (
      select 1 from public.ofertas_cliente o
      where o.id = oferta_id and (
        o.ejecutivo_id = auth.uid()
        or exists (select 1 from public.ejecutivos e where e.id = auth.uid() and coalesce(e.es_superadmin,false) is true)
      )
    )
  )
  with check (
    exists (
      select 1 from public.ofertas_cliente o
      where o.id = oferta_id and (
        o.ejecutivo_id = auth.uid()
        or exists (select 1 from public.ejecutivos e where e.id = auth.uid() and coalesce(e.es_superadmin,false) is true)
      )
    )
  );

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
        'subfamilia', coalesce(s.subfamilia, 'General'),
        'marca', s.marca,
        'precio', coalesce(nullif(i.precio_cliente,0), nullif(i.precio_lista,0), nullif(s.precio_unidad,0), nullif(s.precio_caja,0), 0),
        'precio_lista', coalesce(nullif(i.precio_lista,0), nullif(s.precio_unidad,0), nullif(s.precio_caja,0), 0),
        'stock_disponible', coalesce(s.stock_operativo, 0) > 0 and coalesce(s.estado_stock, '') not in ('SIN_STOCK','VENCIDO'),
        'stock_operativo', coalesce(s.stock_operativo, 0),
        'estado_stock', s.estado_stock,
        'destacado', i.destacado,
        'prioridad', i.prioridad,
        'imagen_url', s.imagen_url,
        'resena', s.resena,
        'ficha_url', s.ficha_url,
        'unidad_venta', s.unidad_venta
      ) order by i.destacado desc, i.prioridad asc,
               (coalesce(s.stock_operativo,0) > 0) desc,
               i.producto_nombre asc)
      from public.oferta_cliente_items i
      left join public.stock s on s.sku_canon = i.sku_canon
      where i.oferta_id = o.id and i.visible = true
    ), '[]'::jsonb)
  ), '{}'::jsonb)
  from public.ofertas_cliente o
  where o.token = p_token and o.activo = true;
$$;

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
  v_total numeric := 0;
begin
  select * into v_offer from public.ofertas_cliente where token = p_token and activo = true limit 1;
  if not found then raise exception 'CATALOGO_NO_DISPONIBLE'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'PEDIDO_VACIO'; end if;

  for v_line in select * from jsonb_array_elements(p_lineas) loop
    v_sku := trim(v_line->>'sku');
    v_qty := greatest(0, coalesce((v_line->>'cantidad')::numeric, 0));
    if v_sku is null or v_sku = '' or v_qty <= 0 then continue; end if;

    select * into v_item from public.oferta_cliente_items
    where oferta_id = v_offer.id and sku_canon = v_sku and visible = true limit 1;
    if not found then continue; end if;

    v_price := coalesce(nullif(v_item.precio_cliente,0), nullif(v_item.precio_lista,0), 0);
    if v_price <= 0 then
      select coalesce(nullif(precio_unidad,0), nullif(precio_caja,0), 0) into v_price
      from public.stock where sku_canon = v_sku limit 1;
      v_price := coalesce(v_price, 0);
    end if;

    v_total := v_total + (v_price * v_qty);
    v_validated := v_validated || jsonb_build_array(jsonb_build_object(
      'sku', v_item.sku_canon,
      'nombre', v_item.producto_nombre,
      'cantidad', v_qty,
      'precio', v_price
    ));
  end loop;

  if jsonb_array_length(v_validated) = 0 then raise exception 'PEDIDO_SIN_PRODUCTOS_VALIDOS'; end if;

  insert into public.pedidos (
    ejecutivo_id, cliente_key, nombre_cliente, lineas, nota, estado, fuente, total_estimado
  ) values (
    v_offer.ejecutivo_id, v_offer.cliente_key, coalesce(v_offer.nombre_cliente, v_offer.cliente_key),
    v_validated, 'Pedido recibido desde catálogo público', 'recibido', 'catalogo_publico', v_total
  ) returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.get_public_catalogo(text) to anon, authenticated;
grant execute on function public.crear_pedido_publico(text, jsonb) to anon, authenticated;
revoke all on table public.ofertas_cliente from anon;
revoke all on table public.oferta_cliente_items from anon;
