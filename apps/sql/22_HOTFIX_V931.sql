-- ============================================================
-- V9.3.1 HOTFIX — catálogo público + columnas que rompen selects
-- Idempotente. Correr en Supabase SQL Editor → Run
-- ============================================================

-- A) ofertas_cliente: columna activo (canónica)
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
    UPDATE public.ofertas_cliente SET activo = COALESCE(activo, activa, TRUE);
  END IF;
END $$;

UPDATE public.ofertas_cliente SET activo = TRUE WHERE activo IS NULL;

-- B) RPC canónica (SECURITY DEFINER — el token es la credencial)
-- get_public_catalogo() → definición única en 25_CATALOGO_FINAL.sql


REVOKE ALL ON FUNCTION public.get_public_catalogo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_catalogo(TEXT) TO anon, authenticated;

-- C) RLS lectura pública del catálogo
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

-- D) Verificación
SELECT p.oid::regprocedure AS funcion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_public_catalogo';

SELECT COUNT(*) AS ofertas_activas
FROM public.ofertas_cliente
WHERE COALESCE(activo, true) = true;
