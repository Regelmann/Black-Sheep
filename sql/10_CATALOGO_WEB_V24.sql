-- =============================================================================
-- BLACK SHEEP · Catálogo web cliente V2.4 (argumento de venta)
-- =============================================================================
-- Prioridad de precio:
--   1) Negociado (oferta_cliente_items.precio_cliente)
--   2) Histórico del cliente (última venta en ventas_lineas)
--   3) Lista (stock.precio_unidad / precio_caja desde Excel lista de precios)
--   4) 0 → "Consultar" en la UI
--
-- Media: stock.imagen_url, stock.resena, stock.ficha_url (ciclo + PRODUCTOS_MEDIA)
-- Incluye TODO el stock operativo (aunque precio=0) para que el catálogo no quede vacío.
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
      and coalesce(o.activo, true) = true
    limit 1
  ),

  -- Último precio histórico por SKU desde ventas_lineas del cliente
  hist_precio as (
    select distinct on (sku_canon)
      sku_canon,
      precio_unit,
      fecha as ultima_compra
    from (
      select
        nullif(trim(v.sku_canon), '') as sku_canon,
        case
          when coalesce(v.cantidad, 0) > 0 and coalesce(v.venta_neta_clp, 0) > 0
            then round((v.venta_neta_clp / nullif(v.cantidad, 0))::numeric, 0)
          else null
        end as precio_unit,
        v.fecha::date as fecha
      from public.ventas_lineas v
      where v.cliente_key = (select cliente_key from offer)
        and nullif(trim(v.sku_canon), '') is not null
    ) x
    where x.precio_unit is not null and x.precio_unit > 0
    order by sku_canon, fecha desc nulls last
  ),

  -- Reorder suave desde pedidos web/app
  hist_ped as (
    select
      x.sku_canon,
      count(*)::int as pedidos_previos,
      max(x.creado_en)::date as ultima_pedido,
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
    ) x
    where x.sku_canon is not null and x.cantidad > 0
    group by x.sku_canon
  ),

  personal as (
    select
      i.sku_canon,
      coalesce(i.producto_nombre, s.producto_nombre, i.sku_canon) as producto_nombre,
      coalesce(s.subfamilia, s.categoria, 'General') as subfamilia,
      s.marca,
      s.unidad_venta,
      -- lista
      coalesce(
        nullif(i.precio_lista, 0),
        nullif(s.precio_unidad, 0),
        nullif(s.precio_caja, 0),
        nullif(s.precio_kilo, 0),
        0
      ) as precio_lista,
      -- cliente: negociado oferta o histórico ventas
      coalesce(
        nullif(i.precio_cliente, 0),
        nullif(hp.precio_unit, 0)
      ) as precio_cliente,
      -- precio mostrado
      coalesce(
        nullif(i.precio_cliente, 0),
        nullif(hp.precio_unit, 0),
        nullif(i.precio_lista, 0),
        nullif(s.precio_unidad, 0),
        nullif(s.precio_caja, 0),
        nullif(s.precio_kilo, 0),
        0
      ) as precio,
      case
        when nullif(i.precio_cliente, 0) is not null then 'negociado'
        when nullif(hp.precio_unit, 0) is not null then 'historico'
        when coalesce(nullif(i.precio_lista, 0), nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), 0) > 0 then 'lista'
        else 'consultar'
      end as precio_origen,
      coalesce(hp.ultima_compra, hped.ultima_pedido) as ultima_compra,
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
        upper(coalesce(s.estado_stock, '')) like '%CRIT%'
        or upper(coalesce(s.estado_stock, '')) like '%LIQUID%'
        or (coalesce(s.cobertura_dias, 999) < 7 and coalesce(s.stock_operativo, 0) > 0)
      ) as es_liquidacion,
      coalesce(hped.pedidos_previos, 0) as pedidos_previos,
      coalesce(hped.cantidad_promedio, 0) as cantidad_promedio,
      coalesce(hped.cantidad_mediana, 0) as cantidad_mediana,
      case
        when coalesce(s.stock_operativo, 0) <= 0 then 0
        when hped.cantidad_mediana > 0 then greatest(1, round(hped.cantidad_mediana)::int)
        when hped.cantidad_promedio > 0 then greatest(1, round(hped.cantidad_promedio)::int)
        else 1
      end as cantidad_sugerida,
      case
        when nullif(i.precio_cliente, 0) is not null then 'Precio negociado'
        when nullif(hp.precio_unit, 0) is not null then 'Tu último precio'
        when coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), 0) > 0 then 'Precio lista'
        else null
      end as motivo_sugerencia
    from public.oferta_cliente_items i
    left join public.stock s on s.sku_canon = i.sku_canon
    left join hist_precio hp on hp.sku_canon = i.sku_canon
    left join hist_ped hped on hped.sku_canon = i.sku_canon
    where i.oferta_id = (select id from offer)
      and coalesce(i.visible, true) = true
  ),

  general as (
    select
      s.sku_canon,
      coalesce(s.producto_nombre, s.sku_canon) as producto_nombre,
      coalesce(s.subfamilia, s.categoria, 'General') as subfamilia,
      s.marca,
      s.unidad_venta,
      coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), nullif(s.precio_kilo, 0), 0) as precio_lista,
      nullif(hp.precio_unit, 0) as precio_cliente,
      coalesce(
        nullif(hp.precio_unit, 0),
        nullif(s.precio_unidad, 0),
        nullif(s.precio_caja, 0),
        nullif(s.precio_kilo, 0),
        0
      ) as precio,
      case
        when nullif(hp.precio_unit, 0) is not null then 'historico'
        when coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), nullif(s.precio_kilo, 0), 0) > 0 then 'lista'
        else 'consultar'
      end as precio_origen,
      coalesce(hp.ultima_compra, hped.ultima_pedido) as ultima_compra,
      (coalesce(s.stock_operativo, 0) > 0
        and coalesce(s.estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')) as stock_disponible,
      coalesce(s.stock_operativo, 0) as stock_operativo,
      s.estado_stock,
      coalesce(s.es_foco_mes, false) as destacado,
      500 as prioridad,
      s.imagen_url,
      s.resena,
      s.ficha_url,
      (hped.pedidos_previos is not null and hped.pedidos_previos > 0) as es_habitual,
      coalesce(s.es_foco_mes, false) as es_oferta,
      (
        upper(coalesce(s.estado_stock, '')) like '%CRIT%'
        or upper(coalesce(s.estado_stock, '')) like '%LIQUID%'
        or (coalesce(s.cobertura_dias, 999) < 7 and coalesce(s.stock_operativo, 0) > 0)
      ) as es_liquidacion,
      coalesce(hped.pedidos_previos, 0) as pedidos_previos,
      coalesce(hped.cantidad_promedio, 0) as cantidad_promedio,
      coalesce(hped.cantidad_mediana, 0) as cantidad_mediana,
      case
        when coalesce(s.stock_operativo, 0) <= 0 then 0
        when hped.cantidad_mediana > 0 then greatest(1, round(hped.cantidad_mediana)::int)
        when hped.cantidad_promedio > 0 then greatest(1, round(hped.cantidad_promedio)::int)
        else 0
      end as cantidad_sugerida,
      case
        when nullif(hp.precio_unit, 0) is not null then 'Tu último precio'
        when coalesce(nullif(s.precio_unidad, 0), nullif(s.precio_caja, 0), 0) > 0 then 'Precio lista'
        else null
      end as motivo_sugerencia
    from public.stock s
    left join hist_precio hp on hp.sku_canon = s.sku_canon
    left join hist_ped hped on hped.sku_canon = s.sku_canon
    where (select id from offer) is not null
      -- mostrar catálogo completo; UI marca "Consultar" si precio=0
      and not exists (select 1 from personal p where p.sku_canon = s.sku_canon)
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
          'precio_origen', u.precio_origen,
          'ultima_compra', u.ultima_compra,
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
          'es_reposicion', (u.cantidad_sugerida > 0 and u.es_habitual),
          'pedidos_previos', u.pedidos_previos,
          'cantidad_sugerida', u.cantidad_sugerida,
          'motivo_sugerencia', u.motivo_sugerencia
        )
        order by
          u.es_liquidacion desc,
          u.es_oferta desc,
          u.es_habitual desc,
          (u.cantidad_sugerida > 0) desc,
          (u.precio > 0) desc,
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
      'cliente_key', (select cliente_key from offer),
      'actualizado_en', (select actualizado_en from offer),
      'items', (select items from items_json)
    )
  end;
$$;

grant execute on function public.get_public_catalogo(text) to anon, authenticated;

comment on function public.get_public_catalogo(text) is
  'Catálogo web V2.4: negociado → histórico ventas → lista; media imagen/resena/ficha; catálogo completo';
