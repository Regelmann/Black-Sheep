-- ============================================================
-- V9.3.2 — Catálogo público + verificación de aislamiento
-- Idempotente. Correr en Supabase SQL Editor.
-- ============================================================

-- 1) activo canónico
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ofertas_cliente' AND column_name='activo'
  ) THEN
    ALTER TABLE public.ofertas_cliente ADD COLUMN activo BOOLEAN DEFAULT TRUE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ofertas_cliente' AND column_name='activa'
  ) THEN
    EXECUTE 'UPDATE public.ofertas_cliente SET activo = COALESCE(activo, activa, TRUE)';
  END IF;
END $$;

UPDATE public.ofertas_cliente SET activo = TRUE WHERE activo IS NULL;

-- 2) RPC catálogo (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_public_catalogo(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
  WHERE token = trim(p_token)
    AND COALESCE(activo, TRUE) = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalido');
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'producto_nombre'), '[]'::jsonb)
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
             'recomendado',     COALESCE(i.recomendado, false),
             'categoria',       i.categoria
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

-- 3) RLS
ALTER TABLE public.ofertas_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oc_public_read" ON public.ofertas_cliente;
CREATE POLICY "oc_public_read" ON public.ofertas_cliente
  FOR SELECT TO anon USING (COALESCE(activo, true) = true);

ALTER TABLE public.oferta_cliente_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oci_public_read" ON public.oferta_cliente_items;
CREATE POLICY "oci_public_read" ON public.oferta_cliente_items
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM public.ofertas_cliente o
      WHERE o.id = oferta_cliente_items.oferta_id
        AND COALESCE(o.activo, true) = true
    )
  );

-- 4) Diagnóstico: token de prueba (mirá el resultado)
SELECT
  token,
  nombre_cliente,
  COALESCE(activo, true) AS activo,
  (SELECT COUNT(*) FROM oferta_cliente_items i WHERE i.oferta_id = o.id) AS items
FROM ofertas_cliente o
ORDER BY actualizado_en DESC NULLS LAST
LIMIT 5;

-- 5) Verificar función
SELECT public.get_public_catalogo(
  (SELECT token FROM ofertas_cliente WHERE COALESCE(activo,true) LIMIT 1)
) AS prueba_rpc;
