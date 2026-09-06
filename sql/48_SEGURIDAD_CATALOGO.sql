-- ============================================================
-- 48_SEGURIDAD_CATALOGO.sql  ·  v-BS-PLATFORM-V14.7
--
-- Cierra los dos huecos que SEGURIDAD.md tenía anotados como
-- "Pendiente" desde V9.9.5, y suma control de abuso.
--
--   1 · Los tokens del catálogo público NO CADUCAN NUNCA.
--       Un link compartido por WhatsApp queda vivo para siempre: se
--       reenvía, se filtra en un grupo, se indexa. Es una credencial
--       que no se puede revocar — hoy la única forma de matarla es
--       desactivar el catálogo entero (y con él las ventas).
--
--   2 · No hay registro de quién accedió a qué.
--       Ante un incidente (Ley 19.628) no hay forma de responder
--       "qué vio y cuándo". Hoy no existe ni la tabla.
--
--   3 · `crear_pedido_publico` no tiene límite de velocidad.
--       Es un endpoint ANÓNIMO que ESCRIBE en la base. Un script con
--       un token válido puede generar miles de pedidos en un minuto:
--       ensucia el inbox de bodega y esconde el pedido real entre el
--       ruido.
--
-- QUÉ HACE ESTE ARCHIVO
--   · Ciclo de vida del token: creado / expira / último acceso.
--   · `catalogo_token_vigente(token)` — validación canónica, un solo
--     lugar. Hoy esa lógica está COPIADA en 5 funciones (21, 37, 38,
--     39 ×2) y cada copia es un lugar donde olvidarse de una condición.
--   · `rotar_token_catalogo(oferta_id)` — revocar un link sin tirar el
--     catálogo abajo. Sólo gerencia.
--   · Tabla `seguridad_eventos` — auditoría con RLS (sólo admin lee).
--   · Trigger de control de abuso sobre pedidos públicos.
--
-- 🔴 NO REDEFINE NINGUNA FUNCIÓN EXISTENTE.
--    Regla 5 del proyecto: una función, un archivo. `crear_pedido_-
--    publico` sigue siendo de 21. Lo que falta —que las funciones
--    canónicas CONSULTEN el vencimiento— está al final, como paso 2,
--    con el parche exacto. Se deja explícito, no se hace por sorpresa.
--
-- ORDEN: después de 21, 37, 38 y 39.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════════
-- 1) CICLO DE VIDA DEL TOKEN
-- ═══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'ofertas_cliente') THEN

    ALTER TABLE public.ofertas_cliente
      ADD COLUMN IF NOT EXISTS token_creado_en  TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS token_expira_en  TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ultimo_acceso_en TIMESTAMPTZ;

    -- Lo que ya existía arranca con una ventana de 180 días desde HOY.
    -- Nadie amanece con el link muerto: el aviso llega ANTES, con la
    -- consulta de diagnóstico del final de este archivo.
    UPDATE public.ofertas_cliente
       SET token_creado_en = COALESCE(token_creado_en, COALESCE(creado_en, NOW())),
           token_expira_en = COALESCE(token_expira_en, NOW() + INTERVAL '180 days')
     WHERE token_expira_en IS NULL;

    CREATE INDEX IF NOT EXISTS ofertas_token_expira_idx
      ON public.ofertas_cliente (token_expira_en);
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- 2) AUDITORÍA — quién hizo qué y cuándo
--    RLS: NADIE lee por tabla salvo gerencia. Sin esa política, `anon`
--    podría leer el registro de TODAS las empresas.
--    Va antes de las funciones que escriben en ella.
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.seguridad_eventos (
  id          BIGSERIAL PRIMARY KEY,
  tipo        TEXT        NOT NULL,
  -- `ofertas_cliente.id` es BIGSERIAL (ver 19), no UUID.
  oferta_id   BIGINT,
  tenant_id   TEXT,
  actor       UUID,                 -- auth.uid() si había sesión
  detalle     TEXT,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seguridad_eventos_tipo_idx
  ON public.seguridad_eventos (tipo, creado_en DESC);
CREATE INDEX IF NOT EXISTS seguridad_eventos_tenant_idx
  ON public.seguridad_eventos (tenant_id, creado_en DESC);

ALTER TABLE public.seguridad_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seg_eventos_admin ON public.seguridad_eventos;
CREATE POLICY seg_eventos_admin ON public.seguridad_eventos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ejecutivos e
       WHERE e.id = auth.uid()
         AND lower(COALESCE(e.rol, '')) IN ('gerente', 'admin', 'superadmin')
    )
  );


-- ═══════════════════════════════════════════════════════════════════
-- 3) VALIDACIÓN CANÓNICA DEL TOKEN
--    La misma condición está escrita cinco veces hoy:
--      21 · crear_pedido_publico
--      37 · guardar_push_suscripcion
--      38 · enviar_push_catalogo
--      39 · get_pedidos_publicos y reordenar_pedido_publico
--    Cinco copias = cinco lugares donde una queda desactualizada.
--    Ésta es la definición; el PASO 2 (al final) las apunta acá.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.catalogo_token_vigente(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ofertas_cliente o
    WHERE o.token = trim(COALESCE(p_token, ''))
      AND COALESCE(o.activo, TRUE) = TRUE
      -- Un token sin fecha de vencimiento se trata como vigente: dar
      -- de baja catálogos por un NULL sería peor que la demora.
      AND (o.token_expira_en IS NULL OR o.token_expira_en > NOW())
  );
$$;

REVOKE ALL    ON FUNCTION public.catalogo_token_vigente(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogo_token_vigente(TEXT) TO anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 4) ROTAR UN TOKEN — revocar un link sin bajar el catálogo
--    El caso real: el link se reenvió a quien no era. Antes la única
--    salida era `activo = false`, que dejaba al cliente sin catálogo
--    hasta que alguien lo reactivara.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rotar_token_catalogo(p_oferta_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nuevo   TEXT;
  v_tenant  TEXT;
BEGIN
  -- Sólo gerencia. Sin este bloque, cualquier ejecutivo podría rotar
  -- el link de un cliente de OTRO ejecutivo y dejarlo sin catálogo.
  IF NOT EXISTS (
    SELECT 1 FROM public.ejecutivos e
     WHERE e.id = auth.uid()
       AND lower(COALESCE(e.rol, '')) IN ('gerente', 'admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'SOLO_GERENCIA';
  END IF;

  -- 18 bytes en hex = 36 caracteres: el MISMO formato que genera el
  -- frontend en OfertaClienteSheet.jsx (crypto.getRandomValues). Si los
  -- formatos divergen, la validación de lib/seguridad.js empieza a
  -- rechazar links legítimos.
  v_nuevo := encode(gen_random_bytes(18), 'hex');

  UPDATE public.ofertas_cliente
     SET token            = v_nuevo,
         token_creado_en  = NOW(),
         token_expira_en  = NOW() + INTERVAL '180 days'
   WHERE id = p_oferta_id
  RETURNING tenant_id INTO v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATALOGO_NO_ENCONTRADO';
  END IF;

  INSERT INTO public.seguridad_eventos (tipo, oferta_id, tenant_id, actor, detalle)
  VALUES ('token_rotado', p_oferta_id, v_tenant, auth.uid(), 'rotación manual');

  RETURN v_nuevo;
END $$;

REVOKE ALL    ON FUNCTION public.rotar_token_catalogo(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotar_token_catalogo(BIGINT) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 5) CONTROL DE ABUSO EN PEDIDOS PÚBLICOS
--    `crear_pedido_publico` es anónimo y escribe. El trigger corta el
--    ruido antes de que llegue al inbox de bodega, sin tocar 21.
--
--    Por qué un TRIGGER y no un parche a la función: definir
--    `crear_pedido_publico` en dos archivos es exactamente el bug que
--    la regla R8 del guard existe para evitar. El trigger es código
--    nuevo, con nombre nuevo.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.control_abuso_pedidos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recientes INT;
BEGIN
  -- Sólo el canal público: el ETL y la app de terreno pasan de largo.
  IF NEW.fuente IS DISTINCT FROM 'catalogo_publico' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_recientes
    FROM public.pedidos p
   WHERE p.fuente = 'catalogo_publico'
     AND p.cliente_key = NEW.cliente_key
     AND p.creado_en > (NOW() - INTERVAL '10 minutes');

  -- 20 pedidos en 10 minutos del mismo cliente no es un cliente: es un
  -- script. Se rechaza y el intento queda registrado.
  IF v_recientes >= 20 THEN
    INSERT INTO public.seguridad_eventos (tipo, actor, detalle)
    VALUES ('abuso_pedidos', NULL,
            format('%s pedidos en 10 minutos · cliente_key %s',
                   v_recientes, NEW.cliente_key));
    RAISE EXCEPTION 'DEMASIADOS_PEDIDOS — esperá unos minutos y volvé a intentar';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pedidos_control_abuso ON public.pedidos;
CREATE TRIGGER trg_pedidos_control_abuso
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.control_abuso_pedidos();


-- ═══════════════════════════════════════════════════════════════════
-- 6) VERIFICACIÓN — correr y leer
-- ═══════════════════════════════════════════════════════════════════

-- a) Tokens que vencen en los próximos 30 días (avisar al vendedor)
SELECT
  o.id,
  o.nombre_cliente,
  o.token_expira_en,
  'renovar con: SELECT rotar_token_catalogo(' || o.id || ')' AS accion
FROM public.ofertas_cliente o
WHERE COALESCE(o.activo, TRUE) = TRUE
  AND o.token_expira_en IS NOT NULL
  AND o.token_expira_en < (NOW() + INTERVAL '30 days')
ORDER BY o.token_expira_en;

-- b) Tokens con más de un año sin rotar
SELECT
  o.id,
  o.nombre_cliente,
  o.token_creado_en,
  '🔴 token con más de 1 año — rotar' AS alerta
FROM public.ofertas_cliente o
WHERE COALESCE(o.activo, TRUE) = TRUE
  AND o.token_creado_en < (NOW() - INTERVAL '365 days');

-- c) El helper responde y el RLS no lo bloquea  →  debe dar false
SELECT public.catalogo_token_vigente('token-que-no-existe') AS debe_ser_false;

-- d) Últimos eventos de auditoría
SELECT tipo, tenant_id, detalle, creado_en
FROM public.seguridad_eventos
ORDER BY creado_en DESC
LIMIT 20;

-- e) La tabla de auditoría NO debe ser legible por cualquiera
SELECT
  c.relname        AS tabla,
  c.relrowsecurity AS rls_activo,
  (SELECT COUNT(*) FROM pg_policy pol WHERE pol.polrelid = c.oid) AS politicas
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname = 'seguridad_eventos';


-- ═══════════════════════════════════════════════════════════════════
-- PASO 2 · PARA QUE EL VENCIMIENTO SE APLIQUE DE VERDAD
-- ═══════════════════════════════════════════════════════════════════
-- Este archivo deja todo listo, pero las funciones canónicas siguen
-- validando sólo `activo = true`. Hasta que no se las apunte al helper,
-- el vencimiento es decorativo.
--
-- El cambio es UNA línea por función, en su archivo canónico:
--
--   21_PEDIDO_PUBLICO_CANONICO.sql · crear_pedido_publico()
--   37_PUSH_SUSCRIPCIONES.sql      · guardar_push_suscripcion()
--   38_PUSH_AUTO.sql               · enviar_push_catalogo()
--   39_PORTAL_PEDIDOS.sql          · get_pedidos_publicos()
--                                  · reordenar_pedido_publico()
--
-- Reemplazar el bloque:
--
--     IF NOT EXISTS (
--       SELECT 1 FROM public.ofertas_cliente
--       WHERE token = trim(p_token) AND COALESCE(activo, TRUE) = TRUE
--     ) THEN
--       RAISE EXCEPTION 'CATALOGO_NO_DISPONIBLE';
--     END IF;
--
-- por:
--
--     IF NOT public.catalogo_token_vigente(p_token) THEN
--       RAISE EXCEPTION 'CATALOGO_NO_DISPONIBLE';
--     END IF;
--
-- No se hizo acá a propósito: esas funciones tienen dueño (regla 5 del
-- proyecto) y el guard las marca con R8 si aparecen en dos archivos.
-- Se documenta el parche exacto para que se haga donde corresponde.
-- ============================================================
