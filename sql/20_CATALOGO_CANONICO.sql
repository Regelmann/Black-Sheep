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
CREATE OR REPLACE FUNCTION public.get_public_catalogo(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer      public.ofertas_cliente%ROWTYPE;
  v_items      JSONB;
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
             'producto_nombre', i.producto_nombre,
             'precio_lista',    COALESCE(i.precio_lista, 0),
             'precio_cliente',  COALESCE(i.precio_cliente, 0),
             'precio',          COALESCE(NULLIF(i.precio_cliente, 0), i.precio_lista, 0),
             'precio_origen',   CASE
                                  WHEN COALESCE(i.precio_cliente, 0) > 0 THEN 'negociado'
                                  WHEN COALESCE(i.precio_lista, 0)   > 0 THEN 'lista'
                                  ELSE 'consultar'
                                END,
             'recomendado',     COALESCE(i.recomendado, false),
             'categoria',       i.categoria
           ) AS x
    FROM public.oferta_cliente_items i
    WHERE i.oferta_id = v_offer.id
      AND COALESCE(i.visible, true) = true
  ) s;

  -- El front espera un OBJETO plano con nombre_cliente en la raíz.
  RETURN jsonb_build_object(
    'ok',             true,
    'nombre_cliente', COALESCE(v_offer.nombre_cliente, 'Cliente'),
    'cliente_key',    v_offer.cliente_key,
    'actualizado_en', v_offer.actualizado_en,
    'items',          v_items
  );
END $$;

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
