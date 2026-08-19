-- Fix get_public_catalogo: no usar s.familia si no existe
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
               coalesce(i.producto_nombre, s.producto_nombre) asc)
      from public.oferta_cliente_items i
      left join public.stock s on s.sku_canon = i.sku_canon
      where i.oferta_id = o.id and i.visible = true
    ), '[]'::jsonb)
  ), '{}'::jsonb)
  from public.ofertas_cliente o
  where o.token = p_token and o.activo = true;
$$;

grant execute on function public.get_public_catalogo(text) to anon, authenticated;
