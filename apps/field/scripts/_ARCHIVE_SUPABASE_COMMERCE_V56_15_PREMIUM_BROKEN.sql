-- =============================================================================
-- KEYFOODS V56.15 — COMMERCE PREMIUM / SMART REPLENISHMENT
-- Ejecutar DESPUES de SUPABASE_FIX_STOCK_PRECIOS.sql y V56.4.
-- Idempotente.
-- =============================================================================

alter table public.stock add column if not exists es_foco_mes boolean default false;
alter table public.stock add column if not exists cobertura_dias numeric;
alter table public.stock add column if not exists estado_stock text;

alter table public.pedidos add column if not exists estado text default 'recibido';
alter table public.pedidos add column if not exists fuente text;
alter table public.pedidos add column if not exists total_estimado numeric;
alter table public.pedidos add column if not exists nombre_cliente text;
alter table public.pedidos add column if not exists cargado_externo_en timestamptz;
alter table public.pedidos add column if not exists keylogistics_order_id text;

create index if not exists pedidos_cliente_fecha_idx
  on public.pedidos(cliente_key, creado_en desc);
create index if not exists pedidos_fuente_estado_idx
  on public.pedidos(fuente, estado, creado_en desc);

create or replace function public.get_public_catalogo(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_offer record;
  v_items jsonb;
begin
  select o.* into v_offer
  from public.ofertas_cliente o
  where o.token=p_token and o.activo=true
  limit 1;

  if not found then
    return '{}'::jsonb;
  end if;

  with raw_lines as (
    select
      p.creado_en,
      trim(x->>'sku') sku,
      greatest(0,coalesce((x->>'cantidad')::numeric,0)) cantidad
    from public.pedidos p
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(p.lineas)='array' then p.lineas else '[]'::jsonb end
    ) x
    where p.cliente_key=v_offer.cliente_key
      and lower(coalesce(p.estado,'')) not in ('cancelado','anulado','rechazado')
      and lower(coalesce(p.fuente,'')) <> 'catalogo_test'
      and trim(coalesce(x->>'sku',''))<>''
  ),
  sku_stats as (
    select
      sku,
      count(*)::int pedidos_previos,
      sum(cantidad) unidades_historicas,
      round(avg(cantidad),1) cantidad_promedio,
      round(percentile_cont(0.5) within group(order by cantidad)::numeric,1) cantidad_mediana,
      max(creado_en) ultima_compra
    from raw_lines
    where cantidad>0
    group by sku
  ),
  dates as (
    select
      sku,
      array_agg(distinct creado_en::date order by creado_en::date) fechas
    from raw_lines
    where cantidad>0
    group by sku
  ),
  cadence as (
    select
      d.sku,
      s.*,
      coalesce(
        (
          select percentile_cont(0.5) within group(order by (d2-d1))
          from (
            select
              d.fechas[i] d1,
              d.fechas[i+1] d2
            from generate_subscripts(d.fechas,1) i
            where i < array_length(d.fechas,1)
          ) gaps
        ), 30
      )::numeric cadence_dias
    from dates d join sku_stats s using(sku)
  ),
  base as (
    select
      i.*,
      s.producto_nombre s_nombre,
      s.subfamilia,
      s.marca,
      s.unidad_venta,
      s.stock_operativo,
      s.estado_stock,
      s.cobertura_dias,
      s.es_foco_mes,
      s.imagen_url,
      s.resena,
      s.ficha_url,
      coalesce(nullif(i.precio_cliente,0),nullif(c.precio_hist,0),nullif(i.precio_lista,0),nullif(s.precio_unidad,0),nullif(s.precio_caja,0),0) precio_final,
      coalesce(nullif(i.precio_lista,0),nullif(s.precio_unidad,0),nullif(s.precio_caja,0),0) precio_lista_final,
      c.pedidos_previos,
      c.unidades_historicas,
      c.cantidad_promedio,
      c.cantidad_mediana,
      c.ultima_compra,
      c.cadence_dias
    from public.oferta_cliente_items i
    left join public.stock s on s.sku_canon=i.sku_canon
    left join cadence c on c.sku=i.sku_canon
    where i.oferta_id=v_offer.id and i.visible=true
  ),
  enriched as (
    select *,
      greatest(0,extract(day from (now()-ultima_compra))) dias_sin_comprar,
      case
        when pedidos_previos>=2 and ultima_compra is not null and cadence_dias>0
        then greatest(0,extract(day from (now()-ultima_compra))) / cadence_dias
        else 0
      end ratio_reposicion
    from base
  ),
  final as (
    select *,
      (coalesce(pedidos_previos,0)>=2) es_habitual,
      (
        coalesce(pedidos_previos,0)>=2
        and coalesce(stock_operativo,0)>0
        and coalesce(estado_stock,'') not in ('SIN_STOCK','VENCIDO')
        and coalesce(ratio_reposicion,0)>=0.85
      ) es_reposicion,
      (coalesce(destacado,false) or coalesce(es_foco_mes,false)) es_oferta,
      (
        lower(coalesce(estado_stock,'')) like '%CRIT%'
        or lower(coalesce(estado_stock,'')) like '%LIQ%'
        or (coalesce(cobertura_dias,9999)>0 and cobertura_dias<7 and coalesce(stock_operativo,0)>0)
      ) es_liquidacion
    from enriched
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'sku_canon',sku_canon,
    'producto_nombre',coalesce(producto_nombre,s_nombre,sku_canon),
    'subfamilia',coalesce(subfamilia,'General'),
    'marca',marca,
    'unidad_venta',unidad_venta,
    'precio',precio_final,
    'precio_lista',precio_lista_final,
    'precio_cliente',nullif(precio_cliente,0),
    'precio_origen',
      case
        when nullif(precio_cliente,0) is not null
          and precio_lista_final is not null
          and abs(precio_cliente-precio_lista_final)>0.5 then 'negociado'
        when nullif(precio_cliente,0) is not null then 'historico'
        when precio_lista_final is not null then 'lista'
        else 'consultar'
      end,
    'stock_disponible',coalesce(stock_operativo,0)>0 and coalesce(estado_stock,'') not in ('SIN_STOCK','VENCIDO'),
    'stock_operativo',coalesce(stock_operativo,0),
    'estado_stock',estado_stock,
    'cobertura_dias',cobertura_dias,
    'destacado',destacado,
    'es_foco_mes',coalesce(es_foco_mes,false),
    'es_habitual',es_habitual,
    'es_reposicion',es_reposicion,
    'es_oferta',es_oferta,
    'es_liquidacion',es_liquidacion,
    'pedidos_previos',coalesce(pedidos_previos,0),
    'ultima_compra',ultima_compra,
    'dias_sin_comprar',coalesce(dias_sin_comprar,0),
    'cadencia_dias',coalesce(cadence_dias,0),
    'ratio_reposicion',round(coalesce(ratio_reposicion,0),2),
    'cantidad_promedio',coalesce(cantidad_promedio,0),
    'cantidad_mediana',coalesce(cantidad_mediana,0),
    'cantidad_sugerida',
      case
        when coalesce(stock_operativo,0)<=0 then 0
        when coalesce(cantidad_mediana,0)>0 then greatest(1,round(cantidad_mediana)::int)
        when coalesce(cantidad_promedio,0)>0 then greatest(1,round(cantidad_promedio)::int)
        else 1
      end,
    'imagen_url',imagen_url,
    'resena',resena,
    'ficha_url',ficha_url
  ) order by
    es_reposicion desc,
    es_habitual desc,
    es_oferta desc,
    es_liquidacion desc,
    prioridad asc,
    producto_nombre asc),'[]'::jsonb)
  into v_items from final;

  return jsonb_build_object(
    'nombre_cliente',v_offer.nombre_cliente,
    'actualizado_en',v_offer.actualizado_en,
    'cliente_key',v_offer.cliente_key,
    'items',v_items
  );
end;
$$;

create or replace function public.crear_pedido_publico(p_token text,p_lineas jsonb)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  o record;
  l jsonb;
  item record;
  v_qty numeric;
  v_price numeric;
  valid jsonb:='[]'::jsonb;
  total numeric:=0;
  pid uuid;
begin
  select * into o from public.ofertas_cliente where token=p_token and activo=true limit 1;
  if not found then raise exception 'CATALOGO_NO_DISPONIBLE'; end if;
  if jsonb_typeof(p_lineas)<>'array' or jsonb_array_length(p_lineas)=0 then raise exception 'PEDIDO_VACIO'; end if;

  for l in select * from jsonb_array_elements(p_lineas) loop
    select i.*,s.stock_operativo,s.estado_stock
      into item
    from public.oferta_cliente_items i
    left join public.stock s on s.sku_canon=i.sku_canon
    where i.oferta_id=o.id
      and i.sku_canon=trim(l->>'sku')
      and i.visible=true
    limit 1;

    if not found then continue; end if;
    v_qty:=greatest(0,coalesce((l->>'cantidad')::numeric,0));
    if v_qty<=0 then continue; end if;

    if coalesce(item.stock_operativo,0)<=0
       or coalesce(item.estado_stock,'') in ('SIN_STOCK','VENCIDO') then
      raise exception 'SIN_STOCK:%',item.sku_canon;
    end if;

    v_price:=coalesce(nullif(item.precio_cliente,0),nullif(item.precio_lista,0),0);
    if v_price<=0 then
      select coalesce(nullif(precio_unidad,0),nullif(precio_caja,0),nullif(precio_kilo,0),0)
      into v_price from public.stock where sku_canon=item.sku_canon limit 1;
    end if;

    total:=total+(coalesce(v_price,0)*v_qty);
    valid:=valid||jsonb_build_array(jsonb_build_object(
      'sku',item.sku_canon,
      'nombre',coalesce(item.producto_nombre,item.sku_canon),
      'cantidad',v_qty,
      'precio',coalesce(v_price,0),
      'precio_origen',case
        when nullif(item.precio_cliente,0) is not null then 'negociado'
        when nullif(item.precio_lista,0) is not null then 'lista'
        else 'consultar' end
    ));
  end loop;

  if jsonb_array_length(valid)=0 then raise exception 'PEDIDO_SIN_PRODUCTOS_VALIDOS'; end if;

  insert into public.pedidos(ejecutivo_id,cliente_key,nombre_cliente,lineas,nota,estado,fuente,total_estimado)
  values(o.ejecutivo_id,o.cliente_key,coalesce(o.nombre_cliente,o.cliente_key),valid,'Pedido recibido desde catálogo público','recibido','catalogo_publico',total)
  returning id into pid;

  return pid;
end;
$$;

grant execute on function public.get_public_catalogo(text) to anon,authenticated;
grant execute on function public.crear_pedido_publico(text,jsonb) to anon,authenticated;

-- Order Bridge
create or replace function public.marcar_pedido_externo(p_pedido_id uuid,p_estado text,p_keylogistics_order_id text default null)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.pedidos
  set estado=lower(trim(p_estado)),
      keylogistics_order_id=coalesce(nullif(trim(p_keylogistics_order_id),''),keylogistics_order_id),
      cargado_externo_en=case when lower(trim(p_estado))='cargado_externo' then now() else cargado_externo_en end
  where id=p_pedido_id;
  return found;
end;
$$;
