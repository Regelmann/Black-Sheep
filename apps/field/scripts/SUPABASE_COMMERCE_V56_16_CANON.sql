-- =============================================================================
-- KEYFOODS V56.16 CANON — Commerce Premium + Catálogo completo + Pedido seguro
-- Ejecutar DESPUÉS de SUPABASE_FIX_STOCK_PRECIOS.sql
-- Idempotente. Reemplaza get_public_catalogo / crear_pedido_publico.
-- =============================================================================
-- Contrato:
--   Excel → stock.precio_* → RPC → front (precios.js)
--   Precio: negociado → histórico → lista → consultar
--   Orden: habitual → reposición → ofertas/focos → corta fecha → resto
--   Catálogo = oferta_cliente_items ∪ stock con precio (operativo)
--   Pedido: valida SKU + stock + recalcula precio en servidor
-- =============================================================================

alter table public.stock add column if not exists es_foco_mes boolean default false;
alter table public.stock add column if not exists cobertura_dias numeric;
alter table public.stock add column if not exists estado_stock text;
alter table public.stock add column if not exists precio_unidad numeric;
alter table public.stock add column if not exists precio_caja numeric;
alter table public.stock add column if not exists precio_kilo numeric;
alter table public.stock add column if not exists imagen_url text;
alter table public.stock add column if not exists ficha_url text;
alter table public.stock add column if not exists resena text;

alter table public.pedidos add column if not exists estado text default 'recibido';
alter table public.pedidos add column if not exists fuente text;
alter table public.pedidos add column if not exists total_estimado numeric;
alter table public.pedidos add column if not exists nombre_cliente text;
alter table public.pedidos add column if not exists cargado_externo_en timestamptz;
alter table public.pedidos add column if not exists keylogistics_order_id text;
alter table public.pedidos add column if not exists token_catalogo text;

create index if not exists pedidos_cliente_fecha_idx
  on public.pedidos(cliente_key, creado_en desc);
create index if not exists pedidos_fuente_estado_idx
  on public.pedidos(fuente, estado, creado_en desc);

-- ---------------------------------------------------------------------------
-- get_public_catalogo
-- ---------------------------------------------------------------------------
create or replace function public.get_public_catalogo(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer record;
  v_items jsonb;
begin
  select o.* into v_offer
  from public.ofertas_cliente o
  where o.token = p_token and o.activo = true
  limit 1;

  if not found then
    return '{}'::jsonb;
  end if;

  with
  -- Líneas históricas del cliente (solo agregados; no historial crudo al cliente)
  raw_lines as (
    select
      p.creado_en,
      nullif(trim(coalesce(x->>'sku', x->>'sku_canon', '')), '') as sku,
      greatest(0, coalesce((x->>'cantidad')::numeric, 0)) as cantidad,
      nullif(coalesce((x->>'precio')::numeric, 0), 0) as precio_linea
    from public.pedidos p
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(p.lineas) = 'array' then p.lineas else '[]'::jsonb end
    ) x
    where p.cliente_key = v_offer.cliente_key
      and lower(coalesce(p.estado, '')) not in ('cancelado', 'anulado', 'rechazado')
      and lower(coalesce(p.fuente, '')) <> 'catalogo_test'
  ),
  sku_stats as (
    select
      sku,
      count(*)::int as pedidos_previos,
      sum(cantidad) as unidades_historicas,
      round(avg(cantidad), 1) as cantidad_promedio,
      round(
        (percentile_cont(0.5) within group (order by cantidad))::numeric,
        1
      ) as cantidad_mediana,
      max(creado_en) as ultima_compra
    from raw_lines
    where sku is not null and cantidad > 0
    group by sku
  ),
  last_price as (
    select distinct on (sku)
      sku,
      precio_linea as precio_hist
    from raw_lines
    where sku is not null
      and precio_linea is not null
      and precio_linea > 0
    order by sku, creado_en desc
  ),
  dates as (
    select
      sku,
      array_agg(distinct creado_en::date order by creado_en::date) as fechas
    from raw_lines
    where sku is not null and cantidad > 0
    group by sku
  ),
  cadence as (
    select
      d.sku,
      s.pedidos_previos,
      s.unidades_historicas,
      s.cantidad_promedio,
      s.cantidad_mediana,
      s.ultima_compra,
      lp.precio_hist,
      coalesce(
        (
          select percentile_cont(0.5) within group (order by (g.d2 - g.d1))
          from (
            select
              d.fechas[i] as d1,
              d.fechas[i + 1] as d2
            from generate_subscripts(d.fechas, 1) i
            where i < array_length(d.fechas, 1)
          ) g
        ),
        30
      )::numeric as cadence_dias
    from dates d
    join sku_stats s using (sku)
    left join last_price lp using (sku)
  ),
  -- Ítems de la oferta del ejecutivo
  personal as (
    select
      i.sku_canon,
      coalesce(i.producto_nombre, s.producto_nombre, i.sku_canon) as producto_nombre,
      coalesce(s.subfamilia, 'General') as subfamilia,
      s.marca,
      s.unidad_venta,
      s.stock_operativo,
      s.estado_stock,
      s.cobertura_dias,
      coalesce(s.es_foco_mes, false) as es_foco_mes,
      s.imagen_url,
      s.resena,
      s.ficha_url,
      coalesce(i.destacado, false) as destacado,
      nullif(i.precio_cliente, 0) as precio_cliente_oferta,
      nullif(i.precio_lista, 0) as precio_lista_oferta,
      true as en_oferta
    from public.oferta_cliente_items i
    left join public.stock s on s.sku_canon = i.sku_canon
    where i.oferta_id = v_offer.id
      and coalesce(i.visible, true) = true
  ),
  -- Stock general con precio de lista (catálogo completo)
  stock_lista as (
    select
      s.sku_canon,
      coalesce(s.producto_nombre, s.sku_canon) as producto_nombre,
      coalesce(s.subfamilia, 'General') as subfamilia,
      s.marca,
      s.unidad_venta,
      s.stock_operativo,
      s.estado_stock,
      s.cobertura_dias,
      coalesce(s.es_foco_mes, false) as es_foco_mes,
      s.imagen_url,
      s.resena,
      s.ficha_url,
      false as destacado,
      null::numeric as precio_cliente_oferta,
      null::numeric as precio_lista_oferta,
      false as en_oferta
    from public.stock s
    where coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), nullif(s.precio_kilo, 0), 0) > 0
      and not exists (
        select 1 from personal p where p.sku_canon = s.sku_canon
      )
  ),
  unioned as (
    select * from personal
    union all
    select * from stock_lista
  ),
  base as (
    select
      u.*,
      s.precio_unidad as stock_precio_unidad,
      s.precio_caja as stock_precio_caja,
      s.precio_kilo as stock_precio_kilo,
      c.pedidos_previos,
      c.unidades_historicas,
      c.cantidad_promedio,
      c.cantidad_mediana,
      c.ultima_compra,
      c.precio_hist,
      c.cadence_dias,
      -- lista canónica
      coalesce(
        nullif(u.precio_lista_oferta, 0),
        nullif(s.precio_unidad, 0),
        nullif(s.precio_caja, 0),
        nullif(s.precio_kilo, 0),
        0
      ) as precio_lista_final,
      -- precio mostrado (prioridad comercial)
      coalesce(
        nullif(u.precio_cliente_oferta, 0),
        nullif(c.precio_hist, 0),
        nullif(u.precio_lista_oferta, 0),
        nullif(s.precio_unidad, 0),
        nullif(s.precio_caja, 0),
        nullif(s.precio_kilo, 0),
        0
      ) as precio_final
    from unioned u
    left join public.stock s on s.sku_canon = u.sku_canon
    left join cadence c on c.sku = u.sku_canon
  ),
  enriched as (
    select
      b.*,
      case
        when b.ultima_compra is null then null
        else greatest(0, extract(day from (now() - b.ultima_compra)))
      end as dias_sin_comprar,
      case
        when coalesce(b.pedidos_previos, 0) >= 2
          and b.ultima_compra is not null
          and coalesce(b.cadence_dias, 0) > 0
        then greatest(0, extract(day from (now() - b.ultima_compra))) / b.cadence_dias
        else 0
      end as ratio_reposicion,
      -- origen de precio (alineado con precios.js)
      case
        when nullif(b.precio_cliente_oferta, 0) is not null
          and b.precio_lista_final > 0
          and abs(b.precio_cliente_oferta - b.precio_lista_final) > 0.5
          and (
            b.precio_hist is null
            or abs(b.precio_cliente_oferta - coalesce(b.precio_hist, 0)) > 0.5
          )
        then 'negociado'
        when nullif(b.precio_cliente_oferta, 0) is not null
          and b.precio_hist is not null
          and abs(b.precio_cliente_oferta - b.precio_hist) <= 0.5
        then 'historico'
        when nullif(b.precio_hist, 0) is not null
          and b.precio_lista_final > 0
          and abs(b.precio_hist - b.precio_lista_final) > 0.5
        then 'historico'
        when b.precio_final > 0 and b.precio_lista_final > 0
          and abs(b.precio_final - b.precio_lista_final) <= 0.5
        then 'lista'
        when b.precio_final > 0 then 'lista'
        else 'consultar'
      end as precio_origen,
      coalesce(
        nullif(b.precio_cliente_oferta, 0),
        nullif(b.precio_hist, 0)
      ) as precio_cliente_out
    from base b
  ),
  final as (
    select
      e.*,
      (coalesce(e.pedidos_previos, 0) >= 1) as es_habitual,
      (
        coalesce(e.pedidos_previos, 0) >= 2
        and coalesce(e.stock_operativo, 0) > 0
        and coalesce(e.estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')
        and coalesce(e.ratio_reposicion, 0) >= 0.85
      ) as es_reposicion,
      (coalesce(e.destacado, false) or coalesce(e.es_foco_mes, false)) as es_oferta,
      (
        coalesce(e.cobertura_dias, 999) < 7
        or upper(coalesce(e.estado_stock, '')) like '%CRIT%'
        or upper(coalesce(e.estado_stock, '')) like '%LIQUID%'
        or upper(coalesce(e.estado_stock, '')) like '%CORTA%'
      ) as es_liquidacion,
      (
        coalesce(e.stock_operativo, 0) > 0
        and coalesce(e.estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')
      ) as stock_disponible,
      -- cantidad sugerida: mediana → promedio → 1
      case
        when coalesce(e.cantidad_mediana, 0) > 0 then round(e.cantidad_mediana)
        when coalesce(e.cantidad_promedio, 0) > 0 then round(e.cantidad_promedio)
        else 1
      end as cantidad_sugerida
    from enriched e
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sku_canon', f.sku_canon,
        'producto_nombre', f.producto_nombre,
        'subfamilia', f.subfamilia,
        'marca', f.marca,
        'unidad_venta', f.unidad_venta,
        'precio', case when f.precio_final > 0 then round(f.precio_final) else null end,
        'precio_lista', case when f.precio_lista_final > 0 then round(f.precio_lista_final) else null end,
        'precio_cliente', case when f.precio_cliente_out is not null then round(f.precio_cliente_out) else null end,
        'precio_origen', f.precio_origen,
        'precio_unidad', f.stock_precio_unidad,
        'precio_caja', f.stock_precio_caja,
        'precio_kilo', f.stock_precio_kilo,
        'stock_operativo', coalesce(f.stock_operativo, 0),
        'estado_stock', f.estado_stock,
        'cobertura_dias', f.cobertura_dias,
        'stock_disponible', f.stock_disponible,
        'es_habitual', f.es_habitual,
        'es_reposicion', f.es_reposicion,
        'es_oferta', f.es_oferta,
        'es_liquidacion', f.es_liquidacion,
        'es_foco_mes', f.es_foco_mes,
        'destacado', f.destacado,
        'pedidos_previos', coalesce(f.pedidos_previos, 0),
        'cantidad_promedio', f.cantidad_promedio,
        'cantidad_mediana', f.cantidad_mediana,
        'cantidad_sugerida', f.cantidad_sugerida,
        'ultima_compra', f.ultima_compra,
        'dias_sin_comprar', f.dias_sin_comprar,
        'ratio_reposicion', round(coalesce(f.ratio_reposicion, 0)::numeric, 2),
        'cadence_dias', f.cadence_dias,
        'imagen_url', f.imagen_url,
        'ficha_url', f.ficha_url,
        'resena', f.resena
      )
      order by
        f.es_habitual desc,
        f.es_reposicion desc,
        f.es_oferta desc,
        f.es_liquidacion desc,
        coalesce(f.ratio_reposicion, 0) desc,
        f.producto_nombre
    ),
    '[]'::jsonb
  )
  into v_items
  from final f
  where
    -- mostrar: con stock operativo O en oferta personal (consultar)
    f.stock_disponible
    or f.en_oferta
    or coalesce(f.precio_final, 0) > 0;

  return jsonb_build_object(
    'cliente_key', v_offer.cliente_key,
    'nombre_cliente', coalesce(v_offer.nombre_cliente, v_offer.cliente_key),
    'token', p_token,
    'actualizado_en', v_offer.actualizado_en,
    'items', coalesce(v_items, '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- crear_pedido_publico — valida stock, recalcula precio, no confía en el browser
-- ---------------------------------------------------------------------------
create or replace function public.crear_pedido_publico(p_token text, p_lineas jsonb)
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
  v_hist numeric;
  v_oferta_cli numeric;
  v_oferta_lista numeric;
  v_stock_ok boolean;
  v_origen text;
  v_found boolean;
  valid jsonb := '[]'::jsonb;
  total numeric := 0;
  pid uuid;
begin
  select * into o
  from public.ofertas_cliente
  where token = p_token and activo = true
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

    v_found := false;
    v_name := v_sku;
    v_price := 0;
    v_lista := 0;
    v_hist := null;
    v_oferta_cli := null;
    v_oferta_lista := null;
    v_stock_ok := false;
    v_origen := 'consultar';

    -- 1) ítem de oferta
    select
      coalesce(i.producto_nombre, s.producto_nombre, v_sku),
      nullif(i.precio_cliente, 0),
      nullif(i.precio_lista, 0),
      coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), nullif(s.precio_kilo, 0), 0),
      (
        coalesce(s.stock_operativo, 0) > 0
        and coalesce(s.estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')
      )
    into v_name, v_oferta_cli, v_oferta_lista, v_lista, v_stock_ok
    from public.oferta_cliente_items i
    left join public.stock s on s.sku_canon = i.sku_canon
    where i.oferta_id = o.id
      and i.sku_canon = v_sku
      and coalesce(i.visible, true) = true
    limit 1;

    if found then
      v_found := true;
    else
      -- 2) stock general con precio
      select
        coalesce(s.producto_nombre, v_sku),
        coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), nullif(s.precio_kilo, 0), 0),
        (
          coalesce(s.stock_operativo, 0) > 0
          and coalesce(s.estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')
        )
      into v_name, v_lista, v_stock_ok
      from public.stock s
      where s.sku_canon = v_sku
        and coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), nullif(s.precio_kilo, 0), 0) > 0
      limit 1;

      if found then
        v_found := true;
      end if;
    end if;

    if not v_found then
      continue; -- SKU desconocido: se ignora
    end if;

    -- Hard gate stock
    if not coalesce(v_stock_ok, false) then
      raise exception 'SIN_STOCK:%', v_sku;
    end if;

    -- Histórico real (último precio de línea del cliente)
    select nullif(coalesce((x->>'precio')::numeric, 0), 0)
    into v_hist
    from public.pedidos p
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(p.lineas) = 'array' then p.lineas else '[]'::jsonb end
    ) x
    where p.cliente_key = o.cliente_key
      and lower(coalesce(p.estado, '')) not in ('cancelado', 'anulado', 'rechazado')
      and nullif(trim(coalesce(x->>'sku', x->>'sku_canon', '')), '') = v_sku
      and coalesce((x->>'precio')::numeric, 0) > 0
    order by p.creado_en desc
    limit 1;

    -- Precio final (misma jerarquía que catálogo / precios.js)
    v_price := coalesce(v_oferta_cli, v_hist, nullif(v_oferta_lista, 0), nullif(v_lista, 0), 0);

    if v_oferta_cli is not null
       and v_lista > 0
       and abs(v_oferta_cli - v_lista) > 0.5
       and (v_hist is null or abs(v_oferta_cli - coalesce(v_hist, 0)) > 0.5)
    then
      v_origen := 'negociado';
    elsif v_oferta_cli is not null and v_hist is not null and abs(v_oferta_cli - v_hist) <= 0.5 then
      v_origen := 'historico';
    elsif v_hist is not null and v_lista > 0 and abs(v_hist - v_lista) > 0.5 then
      v_origen := 'historico';
      v_price := coalesce(v_oferta_cli, v_hist, v_lista);
    elsif v_price > 0 then
      v_origen := 'lista';
    else
      v_origen := 'consultar';
    end if;

    if coalesce(v_price, 0) <= 0 then
      raise exception 'SIN_PRECIO:%', v_sku;
    end if;

    total := total + (v_price * v_qty);
    valid := valid || jsonb_build_array(jsonb_build_object(
      'sku', v_sku,
      'sku_canon', v_sku,
      'producto_nombre', v_name,
      'nombre', v_name,
      'cantidad', v_qty,
      'precio', round(v_price),
      'precio_lista', case when v_lista > 0 then round(v_lista) else null end,
      'precio_origen', v_origen,
      'stock_disponible', true
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
    token_catalogo
  ) values (
    o.ejecutivo_id,
    o.cliente_key,
    coalesce(o.nombre_cliente, o.cliente_key),
    valid,
    'Pedido recibido desde catálogo público',
    'recibido',
    'catalogo_publico',
    total,
    p_token
  )
  returning id into pid;

  return pid;
exception
  when undefined_column then
    insert into public.pedidos (
      cliente_key,
      nombre_cliente,
      lineas,
      estado,
      fuente,
      total_estimado
    ) values (
      o.cliente_key,
      coalesce(o.nombre_cliente, o.cliente_key),
      valid,
      'recibido',
      'catalogo_publico',
      total
    )
    returning id into pid;
    return pid;
end;
$$;

grant execute on function public.get_public_catalogo(text) to anon, authenticated;
grant execute on function public.crear_pedido_publico(text, jsonb) to anon, authenticated;

-- Order Bridge (Keylogistics)
create or replace function public.marcar_pedido_externo(
  p_pedido_id uuid,
  p_estado text,
  p_keylogistics_order_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pedidos
  set
    estado = lower(trim(p_estado)),
    keylogistics_order_id = coalesce(
      nullif(trim(p_keylogistics_order_id), ''),
      keylogistics_order_id
    ),
    cargado_externo_en = case
      when lower(trim(p_estado)) = 'cargado_externo' then now()
      else cargado_externo_en
    end
  where id = p_pedido_id;
  return found;
end;
$$;

grant execute on function public.marcar_pedido_externo(uuid, text, text) to authenticated;
