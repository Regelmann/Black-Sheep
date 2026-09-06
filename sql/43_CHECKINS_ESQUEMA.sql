-- ═══════════════════════════════════════════════════════════════════
-- 43 · CHECKINS — la tabla nunca coincidió con lo que manda la app
--
-- 🔴 LOS DOS ERRORES, DE LA CONSOLA
--
--   POST /rest/v1/checkins 400 (Bad Request)
--   [outbox] agotado tras 8 intentos: checkin
--            invalid input syntax for type uuid: "76491307-C"
--   [sync:checkin] Could not find the 'cliente_key' column of 'checkins'
--                  in the schema cache          (PGRST204)
--
-- Son dos problemas encadenados:
--
-- 1 · La tabla NO TIENE `cliente_key`. La app la manda, Postgres la
--     rechaza, el handler cae a su "modo reducido" y **pierde de qué
--     cliente era el check-in** — que es justo el dato que importa.
--
-- 2 · `"76491307-C"` es un RUT, y estaba entrando a una columna UUID.
--     Un RUT no es un UUID: el insert falla siempre, reintenta 8 veces
--     con backoff y termina en la bandeja de agotados. Ese es el
--     "Error al sincronizar" que aparecía en TODAS las pantallas.
--
-- El check-in es la prueba de que el vendedor estuvo en el local. Si no
-- se guarda, la visita no existe para la gerencia.
--
-- Este archivo NO EXISTÍA: `checkins` se creó a mano en algún momento y
-- nunca quedó declarada en el repo. Por eso el esquema derivó.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.checkins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Identificación del cliente ─────────────────────────────────────
-- `cliente_key` es TEXT porque es el RUT con guion: "76491307-C".
-- 🔴 Si esta columna fuera UUID, cada check-in fallaría — que es
-- exactamente lo que estaba pasando.
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS cliente_key  TEXT;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS ejecutivo_id UUID;

-- `visita_id` es TEXT, no UUID: la app genera ids locales tipo
-- "offline_1730..." cuando el check-in se toma sin señal. Forzar UUID
-- acá rompería el modo offline, que es el corazón del producto.
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS visita_id    TEXT;

-- ── Momento y ubicación ────────────────────────────────────────────
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS hora_llegada TIMESTAMPTZ;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS hora_fin     TIMESTAMPTZ;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS lat_real     NUMERIC;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS lng_real     NUMERIC;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS resultado    TEXT;

-- ── Idempotencia ───────────────────────────────────────────────────
-- El outbox reintenta con el MISMO client_op_id. Sin esta restricción,
-- un reintento cuya respuesta se perdió crea un check-in duplicado y la
-- gerencia cuenta dos visitas donde hubo una.
-- Con ella, Postgres devuelve 23505 y el handler ya lo trata como éxito.
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS client_op_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_op
  ON public.checkins (client_op_id)
  WHERE client_op_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkins_cliente
  ON public.checkins (cliente_key, hora_llegada DESC);

CREATE INDEX IF NOT EXISTS idx_checkins_ejecutivo
  ON public.checkins (ejecutivo_id, hora_llegada DESC);

-- ── Seguridad ──────────────────────────────────────────────────────
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

-- Cada vendedor ve y escribe SUS check-ins. Gerencia ve todos.
DROP POLICY IF EXISTS checkins_lectura ON public.checkins;
CREATE POLICY checkins_lectura ON public.checkins
  FOR SELECT TO authenticated
  USING (
    ejecutivo_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.ejecutivos e
                WHERE e.id = auth.uid()
                  AND UPPER(COALESCE(e.rol, '')) IN ('GERENTE','ADMIN','SUPERADMIN'))
  );

DROP POLICY IF EXISTS checkins_escritura ON public.checkins;
CREATE POLICY checkins_escritura ON public.checkins
  FOR INSERT TO authenticated
  WITH CHECK (ejecutivo_id = auth.uid() OR ejecutivo_id IS NULL);

DROP POLICY IF EXISTS checkins_update ON public.checkins;
CREATE POLICY checkins_update ON public.checkins
  FOR UPDATE TO authenticated
  USING (ejecutivo_id = auth.uid() OR ejecutivo_id IS NULL);

-- ═══════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO · confirmar que el esquema quedó bien
-- ═══════════════════════════════════════════════════════════════════

-- 🔴 LO MÁS IMPORTANTE: `cliente_key` y `visita_id` tienen que decir
-- `text`. Si alguno dice `uuid`, los check-ins van a seguir fallando.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'checkins'
ORDER BY ordinal_position;

-- ¿Cuántos check-ins hay y de cuándo?
SELECT COUNT(*)                                   AS total,
       COUNT(DISTINCT cliente_key)                AS clientes,
       COUNT(DISTINCT ejecutivo_id)               AS ejecutivos,
       MIN(hora_llegada)                          AS primero,
       MAX(hora_llegada)                          AS ultimo,
       COUNT(*) FILTER (WHERE cliente_key IS NULL) AS sin_cliente
FROM public.checkins;

-- Los `sin_cliente` son los que entraron en "modo reducido" mientras la
-- columna no existía: quedaron sin saber de qué local eran.
