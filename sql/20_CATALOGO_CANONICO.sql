-- ============================================================
-- 20_CATALOGO_CANONICO.sql  ·  v-BS-PLATFORM-V9.0
--
-- PROBLEMA QUE RESUELVE
-- ---------------------
-- Cuatro archivos redefinían public.get_public_catalogo(text):
--   05_CATALOGO_PUBLICO.sql
--   10_CATALOGO_WEB_V24.sql
--   16_CATALOGO_LISTA_FIRST.sql
--   19_CATALOGO_OFERTA_CLIENTE.sql
-- La que quedaba viva era la del último script ejecutado. Nadie sabía cuál.
--
-- BUG RAÍZ del "Link inválido o catálogo no disponible":
--   19 crea la tabla con la columna  activo  (BOOLEAN)
--   16 consulta                      coalesce(o.activa, true)
--   → Postgres: column o.activa does not exist
--   → la función aborta → el front cae al mensaje de token inválido.
-- El catálogo existía y el link era correcto.
--
-- ESTE ARCHIVO ES LA ÚNICA FUENTE DE VERDAD. Ejecutar después de 19.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Normalizar el esquema: dejar SIEMPRE la columna `activo`.
--    Si una corrida vieja creó `activa`, se migra y se elimina.
-- ------------------------------------------------------------
DO $$
BEGIN
  -- Asegurar que exista `activo`
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ofertas_cliente'
      AND column_name = 'activo'
  ) THEN
    ALTER TABLE public.ofertas_cliente ADD COLUMN activo BOOLEAN DEFAULT TRUE;
  END IF;

  -- Si además existe `activa`, copiar su valor y descartarla.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ofertas_cliente'
      AND column_name = 'activa'
  ) THEN
    UPDATE public.ofertas_cliente
       SET activo = COALESCE(activo, activa, TRUE);
    ALTER TABLE public.ofertas_cliente DROP COLUMN activa;
    RAISE NOTICE 'Columna duplicada `activa` migrada a `activo` y eliminada.';
  END IF;
END $$;

-- Ningún catálogo debe quedar en NULL: NULL nunca cumple `activo = true`
-- y el cliente vería "link inválido" sin motivo.
UPDATE public.ofertas_cliente SET activo = TRUE WHERE activo IS NULL;
ALTER TABLE public.ofertas_cliente ALTER COLUMN activo SET DEFAULT TRUE;

-- ------------------------------------------------------------
-- 1) RLS coherente con la columna real
-- ------------------------------------------------------------
ALTER TABLE public.ofertas_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oc_auth"         ON public.ofertas_cliente;
DROP POLICY IF EXISTS "oc_public_read"  ON public.ofertas_cliente;

CREATE POLICY "oc_auth" ON public.ofertas_cliente
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "oc_public_read" ON public.ofertas_cliente
  FOR SELECT TO anon USING (activo = true);

-- Los items se leen a través de la oferta padre.
ALTER TABLE public.oferta_cliente_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oci_auth"        ON public.oferta_cliente_items;
DROP POLICY IF EXISTS "oci_public_read" ON public.oferta_cliente_items;

CREATE POLICY "oci_auth" ON public.oferta_cliente_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "oci_public_read" ON public.oferta_cliente_items
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM public.ofertas_cliente o
      WHERE o.id = oferta_cliente_items.oferta_id
        AND o.activo = true
    )
  );

-- ------------------------------------------------------------
-- 2) Función canónica
--    SECURITY DEFINER: el token ES la credencial. Validado por
--    unicidad + activo; no depende de la sesión del visitante.
-- ------------------------------------------------------------
-- get_public_catalogo() → definición única en 25_CATALOGO_FINAL.sql


REVOKE ALL   ON FUNCTION public.get_public_catalogo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_catalogo(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_catalogo(TEXT) IS
  'CANÓNICA v9.0 — reemplaza las definiciones de 05/10/16/19. '
  'Usa la columna `activo` (nunca `activa`). No editar en otro archivo.';

-- ------------------------------------------------------------
-- 3) Verificación — correr y leer el resultado
-- ------------------------------------------------------------
-- a) ¿Quedó una sola definición?
SELECT p.oid::regprocedure AS funcion, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_public_catalogo';

-- b) ¿Hay catálogos inalcanzables por activo NULL/false?
SELECT
  COUNT(*)                                    AS total,
  COUNT(*) FILTER (WHERE activo IS TRUE)      AS visibles_publico,
  COUNT(*) FILTER (WHERE activo IS NOT TRUE)  AS ocultos
FROM public.ofertas_cliente;

-- c) Probar un token real (reemplazar):
-- SELECT public.get_public_catalogo('827641c8f9bec7c995ee4a39224866fa4c21');
