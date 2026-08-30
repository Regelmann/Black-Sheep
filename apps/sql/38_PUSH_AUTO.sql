-- ============================================================
-- 35_PUSH_AUTO.sql  ·  v-BS-PLATFORM-V11.2
--
-- Capa que DISPARA los avisos de forma AUTOMÁTICA sobre el
-- transporte de Web Push (sql/34 + Edge Function notificar-catalogo).
--
--   · Trigger: al PUBLICAR una oferta (activo pasa a true) notifica a
--     todos los suscriptos de ese catálogo. Deliberadamente NO notifica
--     por cada item: un alta masiva de items generaría un spam.
--   · RPC `enviar_push_catalogo`: envío manual / por script con mensaje
--     a medida (lo usa el ETL o un admin).
--   · RPC `sugerir_reposicion_catalogo`: calcula qué SKU de un catálogo
--     conviene reponer (ritmo de venta vs cobertura de stock) y devuelve
--     la sugerencia. Es el "qué decirle" del aviso de reposición.
--
-- CÓMO viaja el envío
--   El trigger llama `enviar_push_catalogo` (security definer, corre como
--   owner) → `net.http_post` (pg_net, asíncrono, no bloquea el trigger)
--   → Edge Function `notificar-catalogo` con header `x-internal-token`.
--   La Edge Function valida el token y recién ahí envía a los suscriptos.
--
-- ORDEN: correr DESPUÉS de 34 (tabla push_suscripciones).
-- ============================================================

-- ------------------------------------------------------------
-- 0) EXTENSIÓN pg_net — para el HTTP asíncrono desde un trigger.
--    Disponible en todos los planes de Supabase. Si no existe, se crea.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ------------------------------------------------------------
-- 1) CONFIG — dónde está la Edge Function y qué token interno valida.
--    Se guarda en una tabla chica (no en la definición de la función,
--    para que cambiarla no exija re-ejecutar la migración).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Valores por defecto (editar según el proyecto real):
--  · edge_function_url → https://<project-ref>.supabase.co/functions/v1/notificar-catalogo
--  · internal_token     → el mismo valor que INTERNAL_PUSH_TOKEN de la Edge Function
INSERT INTO public.push_config (clave, valor)
VALUES
  ('edge_function_url', 'https://TU-PROJECT-REF.supabase.co/functions/v1/notificar-catalogo'),
  ('internal_token',    'CAMBIAR-POR-UN-TOKEN-ALEATORIO-LARGO')
ON CONFLICT (clave) DO NOTHING;

-- ------------------------------------------------------------
-- 2) RPC · ENVIAR push para un catálogo (con mensaje a medida)
--    Asíncrono: `net.http_post` devuelve un request_id; el trigger no se
--    bloquea esperando la respuesta.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enviar_push_catalogo(
  p_token  TEXT,
  p_titulo TEXT,
  p_cuerpo TEXT,
  p_url    TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url  TEXT;
  v_tok  TEXT;
  v_body JSONB;
  v_hdr  JSONB;
  v_req  BIGINT;
BEGIN
  -- El catálogo debe existir y estar activo.
  IF NOT EXISTS (
    SELECT 1 FROM public.ofertas_cliente
    WHERE token = trim(p_token) AND COALESCE(activo, TRUE) = TRUE
  ) THEN
    RAISE EXCEPTION 'CATALOGO_NO_DISPONIBLE';
  END IF;

  SELECT valor INTO v_url FROM public.push_config WHERE clave = 'edge_function_url';
  SELECT valor INTO v_tok FROM public.push_config WHERE clave = 'internal_token';

  IF v_url IS NULL OR v_tok IS NULL THEN
    RAISE EXCEPTION 'PUSH_CONFIG_INCOMPLETA';
  END IF;

  v_body := jsonb_build_object(
    'token_catalogo', trim(p_token),
    'titulo',         COALESCE(p_titulo, 'Black Sheep'),
    'cuerpo',         COALESCE(p_cuerpo, 'Tenés novedades en tu catálogo'),
    'url',            COALESCE(p_url, '/catalogo/' || trim(p_token))
  );
  v_hdr := jsonb_build_object(
    'Content-Type',    'application/json',
    'x-internal-token', v_tok
  );

  -- HTTP asíncrono vía pg_net. Devuelve el request_id (para debug).
  SELECT net.http_post(v_url, v_body, v_hdr) INTO v_req;

  RETURN v_req;
END $$;

REVOKE ALL ON FUNCTION public.enviar_push_catalogo(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enviar_push_catalogo(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3) RPC · SUGERIR reposición para un catálogo
--    Devuelve, por SKU del catálogo, el ritmo de venta y si conviene
--    reponer. La idea: el "qué decirle" del aviso de reposición.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sugerir_reposicion_catalogo(p_token TEXT)
RETURNS TABLE (
  sku_canon       TEXT,
  producto_nombre TEXT,
  venta_diaria    NUMERIC,
  cobertura_dias  NUMERIC,
  sugiere         BOOLEAN,
  motivo          TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oferta  public.ofertas_cliente%ROWTYPE;
  v_item    RECORD;
  v_qty30   NUMERIC;
  v_ultima  TIMESTAMPTZ;
  v_rate    NUMERIC;
  v_cob     NUMERIC;
  v_sug     NUMERIC;
  v_motivo  TEXT;
BEGIN
  SELECT * INTO v_oferta
  FROM public.ofertas_cliente
  WHERE token = trim(p_token) AND COALESCE(activo, TRUE) = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATALOGO_NO_DISPONIBLE';
  END IF;

  FOR v_item IN
    SELECT i.sku_canon, i.producto_nombre
    FROM public.oferta_cliente_items i
    WHERE i.oferta_id = v_oferta.id
  LOOP
    v_qty30 := NULL;
    v_ultima := NULL;
    v_cob := NULL;

    -- Ritmo de venta de los últimos 30 días para ESTE cliente + SKU.
    SELECT SUM(COALESCE(vl.cantidad, 0)), MAX(vl.fecha)
    INTO v_qty30, v_ultima
    FROM public.ventas_lineas vl
    WHERE vl.cliente_key = v_oferta.cliente_key
      AND vl.sku_canon = v_item.sku_canon
      AND vl.fecha >= (NOW() - INTERVAL '30 days');

    v_rate := COALESCE(v_qty30, 0) / 30.0;

    -- Cobertura: cuántos días de stock según la maestra de stock.
    SELECT COALESCE(s.cobertura_dias, 0)
    INTO v_cob
    FROM public.stock s
    WHERE s.sku_canon = v_item.sku_canon
    LIMIT 1;

    -- Sugerencia: venta reciente 0 → sin señal; sin cobertura → no se sabe;
    -- cobertura < 15 días → reponer bien pronto; ya cubierto → ok.
    v_sug := ROUND(v_rate * 15); -- 15 días de previsión
    v_motivo := CASE
      WHEN v_qty30 IS NULL OR v_qty30 = 0 THEN 'sin_venta_reciente'
      WHEN v_cob IS NULL OR v_cob <= 0 THEN 'sin_cobertura'
      WHEN v_cob < 15 THEN 'repone_pronto'
      ELSE 'ok'
    END;

    sugiere := (v_motivo IN ('sin_venta_reciente','sin_cobertura','repone_pronto') AND v_sug > 0)
               OR (v_cob IS NOT NULL AND v_cob > 0 AND v_cob < 10);
    motivo := v_motivo;

    RETURN QUERY SELECT v_item.sku_canon, v_item.producto_nombre, v_rate, v_cob, sugiere, v_motivo;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.sugerir_reposicion_catalogo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sugerir_reposicion_catalogo(TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4) TRIGGER · notificar al PUBLICAR una oferta
--    Solo cuando `activo` pasa a true (INSERT con activo=true, o update).
--    No corre por cada item, para no hacer spam en cargas masivas.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_push_catalogo_publicado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.activo, TRUE) = TRUE THEN
    BEGIN
      PERFORM public.enviar_push_catalogo(
        NEW.token,
        'Tu catálogo se actualizó',
        'Hay novedades y precios nuevos. Entrá a ver la oferta.'
      );
    EXCEPTION WHEN OTHERS THEN
      -- El push NO debe romper la publicación de la oferta: si falla
      -- (pg_net caído, config vacía), se registra y se sigue.
      RAISE NOTICE 'push_catalogo_publicado: no se pudo notificar (%)', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_push_catalogo_publicado ON public.ofertas_cliente;
CREATE TRIGGER trg_push_catalogo_publicado
  AFTER INSERT OR UPDATE OF activo ON public.ofertas_cliente
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_push_catalogo_publicado();

-- ------------------------------------------------------------
-- 5) VERIFICACIÓN
-- ------------------------------------------------------------
-- a) Funciones con firma única (R8 no debe marcar duplicados)
SELECT
  p.oid::regprocedure AS firma,
  p.prosecdef         AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('enviar_push_catalogo','sugerir_reposicion_catalogo','trg_push_catalogo_publicado')
ORDER BY p.proname;

-- b) El trigger está armado y activo
SELECT
  tgname        AS trigger,
  pg_get_triggerdef(oid) AS definicion
FROM pg_trigger
WHERE tgrelid = 'public.ofertas_cliente'::regclass
  AND NOT tgisinternal;

-- c) Config de push cargada
SELECT clave, valor FROM public.push_config ORDER BY clave;
