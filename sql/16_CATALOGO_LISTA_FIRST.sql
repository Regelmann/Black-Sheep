-- V16: Catálogo = LISTA DE PRECIOS primero, stock valida disponibilidad.
-- No se oculta un producto de lista solo porque stock=0; se marca sin stock.

create or replace function public.get_public_catalogo(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer_id uuid;
  v_cliente_key text;
  v_result jsonb;
begin
  select o.id, o.cliente_key into v_offer_id, v_cliente_key
  from public.ofertas_cliente o
  where o.token = p_token
    and coalesce(o.activa, true) = true
  limit 1;

  if v_offer_id is null then
    return jsonb_build_object('ok', false, 'error', 'token_invalido');
  end if;

  with hist_precio as (
    select distinct on (sku_canon)
      sku_canon,
      case when coalesce(cantidad,0) > 0
        then round((venta_neta_clp / nullif(cantidad,0))::numeric, 2)
        else null
      end as precio_unit,
      fecha as ultima_compra
    from public.ventas_lineas
    where cliente_key = v_cliente_key
      and sku_canon is not null
      and coalesce(venta_neta_clp,0) > 0
    order by sku_canon, fecha desc nulls last
  ),
  hist_ped as (
    select
      x.sku_canon,
      count(*)::int as pedidos_previos,
      max(x.fecha) as ultima_pedido
    from (
      select
        coalesce(l->>'sku_canon', l->>'sku') as sku_canon,
        p.creado_en::date as fecha
      from public.pedidos p
      cross join lateral jsonb_array_elements(coalesce(p.lineas, '[]'::jsonb)) l
      where p.cliente_key = v_cliente_key
    ) x
    where x.sku_canon is not null
    group by x.sku_canon
  ),
  -- BASE = todo lo que tiene precio de lista en stock (publicado desde Excel precios)
  -- o aparece en oferta del cliente
  base_lista as (
    select
      s.sku_canon,
      coalesce(s.producto_nombre, s.sku_canon) as producto_nombre,
      coalesce(s.subfamilia, s.categoria, s.familia, 'General') as subfamilia,
      s.marca,
      s.unidad_venta,
      coalesce(
        nullif(s.precio_unidad, 0),
        nullif(s.precio_caja, 0),
        nullif(s.precio_kilo, 0),
        0
      ) as precio_lista,
      coalesce(s.stock_operativo, 0) as stock_operativo,
      s.estado_stock,
      coalesce(s.es_foco_mes, false) as es_foco_mes,
      s.imagen_url,
      s.resena,
      s.ficha_url,
      s.cobertura_dias
    from public.stock s
    where coalesce(
      nullif(s.precio_unidad, 0),
      nullif(s.precio_caja, 0),
      nullif(s.precio_kilo, 0),
      0
    ) > 0
       or coalesce(s.stock_operativo, 0) > 0
  ),
  oferta_items as (
    select i.*
    from public.oferta_cliente_items i
    where i.oferta_id = v_offer_id
      and coalesce(i.visible, true) = true
  ),
  unified as (
    select
      b.sku_canon,
      coalesce(oi.producto_nombre, b.producto_nombre) as producto_nombre,
      b.subfamilia,
      b.marca,
      b.unidad_venta,
      coalesce(nullif(oi.precio_lista, 0), b.precio_lista) as precio_lista,
      nullif(oi.precio_cliente, 0) as precio_negociado,
      nullif(hp.precio_unit, 0) as precio_historico,
      coalesce(
        nullif(oi.precio_cliente, 0),
        nullif(hp.precio_unit, 0),
        nullif(oi.precio_lista, 0),
        nullif(b.precio_lista, 0),
        0
      ) as precio,
      case
        when nullif(oi.precio_cliente, 0) is not null then 'negociado'
        when nullif(hp.precio_unit, 0) is not null then 'historico'
        when coalesce(nullif(oi.precio_lista, 0), nullif(b.precio_lista, 0), 0) > 0 then 'lista'
        else 'consultar'
      end as precio_origen,
      coalesce(hp.ultima_compra, hped.ultima_pedido) as ultima_compra,
      (coalesce(b.stock_operativo, 0) > 0
        and coalesce(b.estado_stock, '') not in ('SIN_STOCK', 'VENCIDO')) as stock_disponible,
      coalesce(b.stock_operativo, 0) as stock_operativo,
      b.estado_stock,
      coalesce(b.es_foco_mes, false) as destacado,
      b.imagen_url,
      b.resena,
      b.ficha_url,
      (hped.pedidos_previos is not null and hped.pedidos_previos > 0)
        or nullif(hp.precio_unit, 0) is not null as es_habitual,
      case
        when nullif(oi.precio_cliente, 0) is not null then 10
        when nullif(hp.precio_unit, 0) is not null then 20
        when coalesce(b.es_foco_mes, false) then 30
        when coalesce(b.stock_operativo, 0) > 0 then 40
        else 50
      end as prioridad
    from base_lista b
    left join oferta_items oi on oi.sku_canon = b.sku_canon
    left join hist_precio hp on hp.sku_canon = b.sku_canon
    left join hist_ped hped on hped.sku_canon = b.sku_canon
  )
  select jsonb_build_object(
    'ok', true,
    'cliente_key', v_cliente_key,
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'sku_canon', u.sku_canon,
            'producto_nombre', u.producto_nombre,
            'subfamilia', u.subfamilia,
            'marca', u.marca,
            'unidad_venta', u.unidad_venta,
            'precio', u.precio,
            'precio_lista', u.precio_lista,
            'precio_cliente', coalesce(u.precio_negociado, u.precio_historico),
            'precio_origen', u.precio_origen,
            'ultima_compra', u.ultima_compra,
            'stock_disponible', u.stock_disponible,
            'stock_operativo', u.stock_operativo,
            'estado_stock', u.estado_stock,
            'destacado', u.destacado,
            'imagen_url', u.imagen_url,
            'resena', u.resena,
            'ficha_url', u.ficha_url,
            'es_habitual', u.es_habitual,
            'prioridad', u.prioridad,
            'etiqueta_precio', case u.precio_origen
              when 'negociado' then 'Negociado'
              when 'historico' then 'Tu precio'
              when 'lista' then 'Lista'
              else 'Consultar'
            end
          )
          order by u.prioridad, u.producto_nombre
        )
        from unified u
        where u.precio > 0 or u.stock_operativo > 0
      ),
      '[]'::jsonb
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_public_catalogo(text) to anon, authenticated;

comment on function public.get_public_catalogo(text) is
  'Catálogo: lista de precios como base; stock solo valida disponibilidad; sin ocultar sin stock';
