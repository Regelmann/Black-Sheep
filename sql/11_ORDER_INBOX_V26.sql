-- =============================================================================
-- BLACK SHEEP · Order Inbox V2.6 — cierra ciclo catálogo → ejecutivo
-- =============================================================================
-- 1) columnas de pedidos
-- 2) crear_pedido_publico con p_nota opcional
-- 3) RLS lectura por ejecutivo (si aplica)
-- =============================================================================

alter table public.pedidos add column if not exists estado text default 'recibido';
alter table public.pedidos add column if not exists fuente text;
alter table public.pedidos add column if not exists total_estimado numeric;
alter table public.pedidos add column if not exists token_catalogo text;
alter table public.pedidos add column if not exists ejecutivo_id text;
alter table public.pedidos add column if not exists nota text;
alter table public.pedidos add column if not exists creado_en timestamptz default now();
alter table public.pedidos add column if not exists actualizado_en timestamptz default now();

create index if not exists pedidos_fuente_estado_idx
  on public.pedidos (fuente, estado, creado_en desc);
create index if not exists pedidos_ejecutivo_fuente_idx
  on public.pedidos (ejecutivo_id, fuente, creado_en desc);
create index if not exists pedidos_ejecutivo_creado_idx
  on public.pedidos (ejecutivo_id, creado_en desc);

-- crear_pedido_publico con nota (compatible con catálogo V2.5)
create or replace function public.crear_pedido_publico(
  p_token text,
  p_lineas jsonb,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  l jsonb;
  v_sku text;
  v_qty numeric;
  v_name text;
  v_price numeric;
  v_lista numeric;
  v_oferta_cli numeric;
  v_stock_ok boolean;
  v_origen text;
  valid jsonb := '[]'::jsonb;
  total numeric := 0;
  pid uuid;
begin
  select * into o
  from public.ofertas_cliente
  where token = p_token and coalesce(activo, true) = true
  limit 1;

  if not found then
    raise exception 'CATALOGO_NO_DISPONIBLE';
  end if;

  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'PEDIDO_VACIO';
  end if;

  for l in select * from jsonb_array_elements(p_lineas)
  loop
    v_sku := nullif(trim(coalesce(l->>'sku', l->>'sku_canon', '')), '');
    v_qty := greatest(0, coalesce((l->>'cantidad')::numeric, 0));
    if v_sku is null or v_qty <= 0 then
      continue;
    end if;

    v_name := coalesce(nullif(trim(coalesce(l->>'nombre', l->>'producto_nombre', '')), ''), v_sku);
    v_price := coalesce(nullif((l->>'precio')::numeric, 0), 0);
    v_lista := 0;
    v_oferta_cli := null;
    v_stock_ok := true;
    v_origen := 'lista';

    -- precio desde oferta / stock
    begin
      select
        coalesce(i.producto_nombre, s.producto_nombre, v_name),
        nullif(i.precio_cliente, 0),
        coalesce(nullif(i.precio_lista, 0), nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), 0),
        (
          coalesce(s.stock_operativo, 0) > 0
          and coalesce(s.estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')
        )
      into v_name, v_oferta_cli, v_lista, v_stock_ok
      from public.oferta_cliente_items i
      left join public.stock s on s.sku_canon = i.sku_canon
      where i.oferta_id = o.id and i.sku_canon = v_sku
      limit 1;

      if found then
        v_price := coalesce(v_oferta_cli, nullif(v_price, 0), nullif(v_lista, 0), 0);
        v_origen := case when v_oferta_cli is not null then 'negociado' else 'lista' end;
      else
        select
          coalesce(s.producto_nombre, v_name),
          coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), nullif(s.precio_kilo, 0), 0),
          (
            coalesce(s.stock_operativo, 0) > 0
            and coalesce(s.estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')
          )
        into v_name, v_lista, v_stock_ok
        from public.stock s
        where s.sku_canon = v_sku
        limit 1;
        if found then
          v_price := coalesce(nullif(v_price, 0), nullif(v_lista, 0), 0);
          v_origen := 'lista';
        end if;
      end if;
    exception when others then
      -- sigue con precio del payload
      null;
    end;

    -- permitir precio 0 = consultar (no abortar todo el pedido)
    total := total + (coalesce(v_price, 0) * v_qty);
    valid := valid || jsonb_build_array(jsonb_build_object(
      'sku', v_sku,
      'sku_canon', v_sku,
      'producto_nombre', v_name,
      'nombre', v_name,
      'cantidad', v_qty,
      'precio', round(coalesce(v_price, 0)),
      'precio_lista', case when coalesce(v_lista, 0) > 0 then round(v_lista) else null end,
      'precio_origen', v_origen,
      'stock_disponible', coalesce(v_stock_ok, true)
    ));
  end loop;

  if jsonb_array_length(valid) = 0 then
    raise exception 'PEDIDO_SIN_PRODUCTOS_VALIDOS';
  end if;

  insert into public.pedidos (
    ejecutivo_id,
    cliente_key,
    nombre_cliente,
    lineas,
    nota,
    estado,
    fuente,
    total_estimado,
    token_catalogo,
    creado_en
  ) values (
    o.ejecutivo_id,
    o.cliente_key,
    coalesce(o.nombre_cliente, o.cliente_key),
    valid,
    nullif(trim(coalesce(p_nota, '')), ''),
    'recibido',
    'catalogo_publico',
    total,
    p_token,
    now()
  )
  returning id into pid;

  return pid;
end;
$$;

grant execute on function public.crear_pedido_publico(text, jsonb, text) to anon, authenticated;
grant execute on function public.crear_pedido_publico(text, jsonb) to anon, authenticated;

comment on function public.crear_pedido_publico(text, jsonb, text) is
  'Pedido desde catálogo web → pedidos.estado=recibido, fuente=catalogo_publico, ejecutivo desde oferta';
