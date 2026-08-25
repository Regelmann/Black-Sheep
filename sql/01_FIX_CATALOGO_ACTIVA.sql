-- FIX catálogo: columnas activo/activa + RPC robusto
-- Correr en Supabase SQL Editor (idempotente)

alter table public.ofertas_cliente add column if not exists activa boolean default true;
alter table public.ofertas_cliente add column if not exists activo boolean default true;
alter table public.ofertas_cliente add column if not exists token text;
alter table public.ofertas_cliente add column if not exists nombre_cliente text;
alter table public.ofertas_cliente add column if not exists ejecutivo_id text;
alter table public.ofertas_cliente add column if not exists cliente_key text;
alter table public.ofertas_cliente add column if not exists actualizado_en timestamptz default now();

-- sincronizar ambos flags
update public.ofertas_cliente
set activa = coalesce(activa, activo, true),
    activo = coalesce(activo, activa, true)
where activa is distinct from coalesce(activo, true)
   or activo is distinct from coalesce(activa, true);

alter table public.oferta_cliente_items add column if not exists precio_lista numeric;
alter table public.oferta_cliente_items add column if not exists precio_cliente numeric;
alter table public.oferta_cliente_items add column if not exists visible boolean default true;
alter table public.oferta_cliente_items add column if not exists destacado boolean default false;
alter table public.oferta_cliente_items add column if not exists prioridad int default 0;
alter table public.oferta_cliente_items add column if not exists producto_nombre text;
alter table public.oferta_cliente_items add column if not exists sku_canon text;

create unique index if not exists ofertas_cliente_token_uidx on public.ofertas_cliente(token);

create or replace function public.get_public_catalogo(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cliente text;
  v_items jsonb;
begin
  select id, cliente_key into v_id, v_cliente
  from public.ofertas_cliente
  where token = p_token
    and coalesce(activa, activo, true) = true
  limit 1;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'token_invalido');
  end if;

  select coalesce(jsonb_agg(x.obj order by x.ord, x.nombre), '[]'::jsonb)
  into v_items
  from (
    select
      0 as ord,
      coalesce(i.producto_nombre, s.producto_nombre, i.sku_canon) as nombre,
      jsonb_build_object(
        'sku_canon', coalesce(i.sku_canon, s.sku_canon),
        'producto_nombre', coalesce(i.producto_nombre, s.producto_nombre),
        'precio', coalesce(nullif(i.precio_cliente,0), nullif(i.precio_lista,0), s.precio_unidad, s.precio_lista),
        'precio_lista', coalesce(s.precio_unidad, s.precio_lista, i.precio_lista),
        'precio_cliente', i.precio_cliente,
        'stock_operativo', s.stock_operativo,
        'origen', case when coalesce(i.precio_cliente,0) > 0 then 'cliente' else 'lista' end,
        'imagen_url', s.imagen_url,
        'resena', s.resena,
        'ficha_url', s.ficha_url,
        'es_foco_mes', coalesce(s.es_foco_mes, false),
        'visible', coalesce(i.visible, true)
      ) as obj
    from public.oferta_cliente_items i
    left join public.stock s on s.sku_canon = i.sku_canon
    where i.oferta_id = v_id
      and coalesce(i.visible, true) = true

    union all

    -- lista completa con precio si la oferta no trae items
    select
      1 as ord,
      s.producto_nombre as nombre,
      jsonb_build_object(
        'sku_canon', s.sku_canon,
        'producto_nombre', s.producto_nombre,
        'precio', coalesce(s.precio_unidad, s.precio_lista),
        'precio_lista', coalesce(s.precio_unidad, s.precio_lista),
        'stock_operativo', s.stock_operativo,
        'origen', 'lista',
        'imagen_url', s.imagen_url,
        'resena', s.resena,
        'ficha_url', s.ficha_url,
        'es_foco_mes', coalesce(s.es_foco_mes, false),
        'visible', true
      ) as obj
    from public.stock s
    where coalesce(s.precio_unidad, s.precio_lista, 0) > 0
      and not exists (
        select 1 from public.oferta_cliente_items i
        where i.oferta_id = v_id
      )
  ) x;

  return jsonb_build_object(
    'ok', true,
    'cliente_key', v_cliente,
    'items', coalesce(v_items, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_public_catalogo(text) to anon, authenticated;

-- Verificación
-- select column_name from information_schema.columns where table_name='ofertas_cliente';
