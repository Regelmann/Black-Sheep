-- ============================================================
-- 34_PUSH_SUSCRIPCIONES.sql  ·  v-BS-PLATFORM-V11.2
--
-- Web Push para el catálogo público B2B.
--
-- POR QUÉ
-- -------
-- Un cliente abre el catálogo por link (anon, sin login). Para que la
-- plataforma le avise por push (nuevos precios, reposición sugerida,
-- break de stock) hace falta guardar la suscripción del navegador. Y
-- como el cliente NO tiene sesión, el acceso no puede ser `authenticated`
-- ni por RLS de fila: se hace por RPC SECURITY DEFINER, validando el
-- token del catálogo.
--
-- QUÉ HACE
-- --------
--   · Tabla `push_suscripciones` (id = UUID que el cliente guarda en su
--     dispositivo; por eso conocer el id es la credencial para borrar).
--   · RPC `guardar_push_suscripcion` — upsert, valida que el token del
--     catálogo exista y esté activo.
--   · RPC `borrar_push_suscripcion` — baja la suscripción del dispositivo.
--   · RLS ENABLE sin política de lectura: NADIE lee directo la tabla.
--     El envío lo hace la Edge Function `notificar-catalogo` con la
--     service key (que ignora RLS por diseño).
--
-- ORDEN: correr DESPUÉS de 19 (tabla ofertas_cliente) y de 33.
-- ============================================================

-- ------------------------------------------------------------
-- 1) TABLA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_suscripciones (
  id              UUID PRIMARY KEY,
  token_catalogo  TEXT NOT NULL,
  suscripcion     JSONB NOT NULL,
  dispositivo     TEXT,
  activa          BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_suscripciones_token_idx
  ON public.push_suscripciones (token_catalogo);

CREATE INDEX IF NOT EXISTS push_suscripciones_activa_idx
  ON public.push_suscripciones (activa);

ALTER TABLE public.push_suscripciones ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2) RPC · GUARDAR suscripción
--    SECURITY DEFINER: el cliente es anon, pero la función corre como
--    el owner, así que puede leer `ofertas_cliente` (validar token) sin
--    que RLS de la tabla de catálogo lo bloquee.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guardar_push_suscripcion(
  p_token         TEXT,
  p_id            UUID,
  p_suscripcion   JSONB,
  p_dispositivo   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- El catálogo tiene que existir y estar activo; si no, no se guarda.
  IF NOT EXISTS (
    SELECT 1 FROM public.ofertas_cliente
    WHERE token = trim(p_token) AND COALESCE(activo, TRUE) = TRUE
  ) THEN
    RAISE EXCEPTION 'CATALOGO_NO_DISPONIBLE';
  END IF;

  IF p_id IS NULL OR jsonb_typeof(p_suscripcion) <> 'object' THEN
    RAISE EXCEPTION 'SUSCRIPCION_INVALIDA';
  END IF;

  INSERT INTO public.push_suscripciones
    (id, token_catalogo, suscripcion, dispositivo, activa, actualizado_en)
  VALUES
    (p_id, trim(p_token), p_suscripcion, p_dispositivo, TRUE, NOW())
  ON CONFLICT (id) DO UPDATE SET
    suscripcion    = EXCLUDED.suscripcion,
    dispositivo    = EXCLUDED.dispositivo,
    activa         = TRUE,
    actualizado_en = NOW();
END $$;

REVOKE ALL ON FUNCTION public.guardar_push_suscripcion(TEXT, UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guardar_push_suscripcion(TEXT, UUID, JSONB, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------
-- 3) RPC · BORRAR suscripción
--    El id ES la credencial: el cliente lo guarda en su dispositivo y
--    sólo él lo conoce. Conocer el token del catálogo no alcanza para
--    borrar una suscripción ajena.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.borrar_push_suscripcion(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'SUSCRIPCION_INVALIDA';
  END IF;
  DELETE FROM public.push_suscripciones WHERE id = p_id;
END $$;

REVOKE ALL ON FUNCTION public.borrar_push_suscripcion(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.borrar_push_suscripcion(UUID) TO anon, authenticated;

-- ------------------------------------------------------------
-- 4) VERIFICACIÓN
-- ------------------------------------------------------------
-- a) Funciones creadas con firma única
SELECT
  p.oid::regprocedure AS firma,
  p.prosecdef         AS security_definer,
  CASE WHEN COUNT(*) OVER () = 1 THEN 'OK · firma única' ELSE 'ERROR · sobrecarga' END AS estado
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('guardar_push_suscripcion','borrar_push_suscripcion')
ORDER BY p.proname;

-- b) La tabla no debe poder leerse por usuario anónimo/autenticado
--    (acceso SOLO por RPC / service key). Cualquier policy SELECT sería
--    un agujero: cualquiera podría leer endpoints de push ajenos.
SELECT
  c.relname AS tabla,
  COUNT(pol.polname) AS politicas
FROM pg_class c
LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname = 'push_suscripciones'
GROUP BY c.relname;
-- Idealmente 0 políticas (acceso exclusivo por RPC SECURITY DEFINER).
