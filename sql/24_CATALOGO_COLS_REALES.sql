-- FIX: oferta_cliente_items NO tiene recomendado/categoria
-- Usa destacado, visible, prioridad

CREATE OR REPLACE FUNCTION public.get_public_catalogo(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.ofertas_cliente%ROWTYPE;
  v_items JSONB;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalido');
  END IF;

  SELECT * INTO v_offer
  FROM public.ofertas_cliente
  WHERE token = trim(p_token) AND COALESCE(activo, TRUE) = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalido');
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'prioridad')::int, x->>'producto_nombre'), '[]'::jsonb)
    INTO v_items
  FROM (
    SELECT jsonb_build_object(
             'sku_canon',       i.sku_canon,
             'producto_nombre', COALESCE(i.producto_nombre, i.sku_canon),
             'precio_lista',    COALESCE(i.precio_lista, 0),
             'precio_cliente',  COALESCE(i.precio_cliente, 0),
             'precio',          COALESCE(NULLIF(i.precio_cliente, 0), i.precio_lista, 0),
             'precio_origen',   CASE
                                  WHEN COALESCE(i.precio_cliente, 0) > 0 THEN 'negociado'
                                  WHEN COALESCE(i.precio_lista, 0) > 0 THEN 'lista'
                                  ELSE 'consultar'
                                END,
             'recomendado',     COALESCE(i.destacado, false),
             'destacado',       COALESCE(i.destacado, false),
             'prioridad',       COALESCE(i.prioridad, 0)
           ) AS x
    FROM public.oferta_cliente_items i
    WHERE i.oferta_id = v_offer.id
      AND COALESCE(i.visible, true) = true
  ) s;

  RETURN jsonb_build_object(
    'ok', true,
    'nombre_cliente', COALESCE(v_offer.nombre_cliente, 'Cliente'),
    'cliente_key', v_offer.cliente_key,
    'actualizado_en', v_offer.actualizado_en,
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END $$;

REVOKE ALL ON FUNCTION public.get_public_catalogo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_catalogo(TEXT) TO anon, authenticated;
