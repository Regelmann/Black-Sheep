-- =============================================================================
-- BLACK SHEEP · Catálogo público completo V56.14
-- Problema: get_public_catalogo solo devolvía oferta_cliente_items (a veces 0–20 SKUs)
-- Solución: habituales/oferta personalizada + TODO el stock con precio de lista
-- + flags es_habitual / es_oferta / es_liquidacion
-- + crear_pedido_publico acepta cualquier SKU de stock (no solo ítems de oferta)
--
-- Ejecutar UNA vez en Supabase SQL Editor.
-- Reemplaza get_public_catalogo y crear_pedido_publico (V56.4).
-- =============================================================================

create or replace function public.get_public_catalogo(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with offer as (
    select o.id, o.cliente_key, o.nombre_cliente, o.actualizado_en
    from public.ofertas_cliente o
    where o.token = p_token
      and o.activo = true
    limit 1
  ),
  -- Histórico agregado de pedidos web del cliente (smart reorder suave)
  hist as (
    select
      x.sku_canon,
      count(*)::int as pedidos_previos,
      max(x.creado_en)::date as ultima_compra,
      avg(x.cantidad)::numeric as cantidad_promedio,
      percentile_cont(0.5) within group (order by x.cantidad)::numeric as cantidad_mediana
    from (
      select
        p.creado_en,
        nullif(trim(l.elem->>'sku'), '') as sku_canon,
        greatest(0, coalesce((l.elem->>'cantidad')::numeric, 0)) as cantidad
      from public.pedidos p
      cross join lateral jsonb_array_elements(coalesce(p.lineas, '[]'::jsonb)) as l(elem)
      where p.cliente_key = (select cliente_key from offer)
        and coalesce(p.estado, '') not in ('cancelado')
        and coalesce(p.fuente, '') in ('catalogo_publico', 'field_app', '')
    ) x
    where x.sku_canon is not null
      and x.cantidad > 0
    group by x.sku_canon
  ),
  personal as (
    select
      i.sku_canon,
      coalesce(i.producto_nombre, s.producto_nombre, i.sku_canon) as producto_nombre,
      coalesce(s.subfamilia, 'General') as subfamilia,
      s.marca,
      s.unidad_venta,
      coalesce(
        nullif(i.precio_cliente, 0),
        nullif(i.precio_lista, 0),
        nullif(s.precio_unidad, 0),
        nullif(s.precio_caja, 0),
        0
      ) as precio,
      coalesce(
        nullif(i.precio_lista, 0),
        nullif(s.precio_unidad, 0),
        nullif(s.precio_caja, 0),
        0
      ) as precio_lista,
      nullif(i.precio_cliente, 0) as precio_cliente,
      (coalesce(s.stock_operativo, 0) > 0
        and coalesce(s.estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')) as stock_disponible,
      coalesce(s.stock_operativo, 0) as stock_operativo,
      s.estado_stock,
      coalesce(i.destacado, false) as destacado,
      coalesce(i.prioridad, 100) as prioridad,
      s.imagen_url,
      s.resena,
      s.ficha_url,
      true as es_habitual,
      (coalesce(i.destacado, false) or coalesce(s.es_foco_mes, false)) as es_oferta,
      (
        coalesce(s.es_foco_mes, false)
        or upper(coalesce(s.estado_stock, '')) like '%CRIT%'
        or upper(coalesce(s.estado_stock, '')) like '%LIQUID%'
        or (coalesce(s.cobertura_dias, 999) < 7 and coalesce(s.stock_operativo, 0) > 0)
      ) as es_liquidacion,
      coalesce(h.pedidos_previos, 0) as pedidos_previos,
      h.ultima_compra,
      coalesce(h.cantidad_promedio, 0) as cantidad_promedio,
      coalesce(h.cantidad_mediana, 0) as cantidad_mediana,
      case
        when h.pedidos_previos is null then 0
        when coalesce(s.stock_operativo, 0) <= 0
          or coalesce(s.estado_stock, '') in ('SIN_STOCK', 'VENCIDO') then 0
        else greatest(
          1,
          round(coalesce(nullif(h.cantidad_mediana, 0), h.cantidad_promedio, 1))::int
        )
      end as cantidad_sugerida,
      case
        when h.pedidos_previos is null then null
        when coalesce(s.stock_operativo, 0) <= 0 then 'Sin stock'
        when h.pedidos_previos >= 3 then 'Basado en tus últimos pedidos'
        else 'Basado en tu historial'
      end as motivo_sugerencia
    from public.oferta_cliente_items i
    left join public.stock s on s.sku_canon = i.sku_canon
    left join hist h on h.sku_canon = i.sku_canon
    where i.oferta_id = (select id from offer)
      and i.visible = true
  ),
  -- Resto del catálogo: stock con precio, no duplicar personal
  general as (
    select
      s.sku_canon,
      coalesce(s.producto_nombre, s.sku_canon) as producto_nombre,
      coalesce(s.subfamilia, 'General') as subfamilia,
      s.marca,
      s.unidad_venta,
      coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), 0) as precio,
      coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), 0) as precio_lista,
      null::numeric as precio_cliente,
      (coalesce(s.stock_operativo, 0) > 0
        and coalesce(s.estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')) as stock_disponible,
      coalesce(s.stock_operativo, 0) as stock_operativo,
      s.estado_stock,
      coalesce(s.es_foco_mes, false) as destacado,
      500 as prioridad,
      s.imagen_url,
      s.resena,
      s.ficha_url,
      (h.pedidos_previos is not null and h.pedidos_previos > 0) as es_habitual,
      coalesce(s.es_foco_mes, false) as es_oferta,
      (
        coalesce(s.es_foco_mes, false)
        or upper(coalesce(s.estado_stock, '')) like '%CRIT%'
        or upper(coalesce(s.estado_stock, '')) like '%LIQUID%'
        or (coalesce(s.cobertura_dias, 999) < 7 and coalesce(s.stock_operativo, 0) > 0)
      ) as es_liquidacion,
      coalesce(h.pedidos_previos, 0) as pedidos_previos,
      h.ultima_compra,
      coalesce(h.cantidad_promedio, 0) as cantidad_promedio,
      coalesce(h.cantidad_mediana, 0) as cantidad_mediana,
      case
        when h.pedidos_previos is null then 0
        when coalesce(s.stock_operativo, 0) <= 0
          or coalesce(s.estado_stock, '') in ('SIN_STOCK', 'VENCIDO') then 0
        else greatest(
          1,
          round(coalesce(nullif(h.cantidad_mediana, 0), h.cantidad_promedio, 1))::int
        )
      end as cantidad_sugerida,
      case
        when h.pedidos_previos is null then null
        when coalesce(s.stock_operativo, 0) <= 0 then 'Sin stock'
        when h.pedidos_previos >= 3 then 'Basado en tus últimos pedidos'
        else 'Basado en tu historial'
      end as motivo_sugerencia
    from public.stock s
    left join hist h on h.sku_canon = s.sku_canon
    where (select id from offer) is not null
      and coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), 0) > 0
      and not exists (
        select 1 from personal p where p.sku_canon = s.sku_canon
      )
  ),
  unioned as (
    select * from personal
    union all
    select * from general
  ),
  items_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'sku_canon', u.sku_canon,
          'producto_nombre', u.producto_nombre,
          'subfamilia', u.subfamilia,
          'marca', u.marca,
          'unidad_venta', u.unidad_venta,
          'precio', u.precio,
          'precio_lista', u.precio_lista,
          'precio_cliente', u.precio_cliente,
          'stock_disponible', u.stock_disponible,
          'stock_operativo', u.stock_operativo,
          'estado_stock', u.estado_stock,
          'destacado', u.destacado,
          'prioridad', u.prioridad,
          'imagen_url', u.imagen_url,
          'resena', u.resena,
          'ficha_url', u.ficha_url,
          'es_habitual', u.es_habitual,
          'es_oferta', u.es_oferta,
          'es_liquidacion', u.es_liquidacion,
          'pedidos_previos', u.pedidos_previos,
          'ultima_compra', u.ultima_compra,
          'cantidad_promedio', u.cantidad_promedio,
          'cantidad_mediana', u.cantidad_mediana,
          'cantidad_sugerida', u.cantidad_sugerida,
          'motivo_sugerencia', u.motivo_sugerencia
        )
        order by
          u.es_liquidacion desc,
          u.es_oferta desc,
          u.es_habitual desc,
          (u.cantidad_sugerida > 0) desc,
          u.destacado desc,
          u.prioridad asc,
          u.stock_disponible desc,
          u.producto_nombre asc
      ),
      '[]'::jsonb
    ) as items
    from unioned u
  )
  select case
    when not exists (select 1 from offer) then '{}'::jsonb
    else jsonb_build_object(
      'nombre_cliente', (select nombre_cliente from offer),
      'actualizado_en', (select actualizado_en from offer),
      'items', (select items from items_json)
    )
  end;
$$;

-- Pedido público: acepta SKUs de la oferta O del stock con precio
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
  v_name text;
  v_price numeric;
  v_validated jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_found boolean;
begin
  select * into v_offer
  from public.ofertas_cliente
  where token = p_token and activo = true
  limit 1;

  if not found then
    raise exception 'CATALOGO_NO_DISPONIBLE';
  end if;

  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'PEDIDO_VACIO';
  end if;

  for v_line in select * from jsonb_array_elements(p_lineas)
  loop
    v_sku := trim(v_line->>'sku');
    v_qty := greatest(0, coalesce((v_line->>'cantidad')::numeric, 0));
    if v_sku is null or v_sku = '' or v_qty <= 0 then
      continue;
    end if;

    v_found := false;
    v_price := 0;
    v_name := coalesce(nullif(trim(v_line->>'nombre'), ''), v_sku);

    -- 1) precio de oferta personalizada
    select
      true,
      coalesce(nullif(i.precio_cliente, 0), nullif(i.precio_lista, 0), 0),
      coalesce(i.producto_nombre, v_name)
    into v_found, v_price, v_name
    from public.oferta_cliente_items i
    where i.oferta_id = v_offer.id
      and i.sku_canon = v_sku
      and i.visible = true
    limit 1;

    -- 2) fallback stock (lista completa)
    if not v_found or v_price <= 0 then
      select
        true,
        coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), v_price, 0),
        coalesce(s.producto_nombre, v_name)
      into v_found, v_price, v_name
      from public.stock s
      where s.sku_canon = v_sku
      limit 1;
    end if;

    if not v_found then
      continue;
    end if;

    -- si aún sin precio, permitir 0 (consultar) pero no sumar
    v_total := v_total + (coalesce(v_price, 0) * v_qty);
    v_validated := v_validated || jsonb_build_array(jsonb_build_object(
      'sku', v_sku,
      'nombre', v_name,
      'cantidad', v_qty,
      'precio', coalesce(v_price, 0)
    ));
  end loop;

  if jsonb_array_length(v_validated) = 0 then
    raise exception 'PEDIDO_SIN_PRODUCTOS_VALIDOS';
  end if;

  insert into public.pedidos (
    ejecutivo_id, cliente_key, nombre_cliente, lineas, nota, estado, fuente, total_estimado
  ) values (
    v_offer.ejecutivo_id,
    v_offer.cliente_key,
    coalesce(v_offer.nombre_cliente, v_offer.cliente_key),
    v_validated,
    'Pedido recibido desde catálogo público',
    'recibido',
    'catalogo_publico',
    v_total
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.get_public_catalogo(text) to anon, authenticated;
grant execute on function public.crear_pedido_publico(text, jsonb) to anon, authenticated;

comment on function public.get_public_catalogo(text) is
  'V56.14: catálogo completo = oferta personalizada + stock con precio lista; flags habitual/oferta/liquidación; smart reorder agregado.';
