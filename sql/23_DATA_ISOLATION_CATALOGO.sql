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
-- get_public_catalogo() → definición única en 25_CATALOGO_FINAL.sql


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
