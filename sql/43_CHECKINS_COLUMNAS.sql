-- ═══════════════════════════════════════════════════════════════════
-- 43 · CHECKINS — las columnas que faltan
--
-- 🔴 EL "ERROR AL SINCRONIZAR" QUE APARECÍA EN TODAS LAS PANTALLAS
--
-- Dos errores encadenados, de la consola:
--
--   1) POST /rest/v1/checkins 400 (Bad Request)
--      invalid input syntax for type uuid: "76491307-C"
--
--   2) PGRST204 — Could not find the 'cliente_key' column of 'checkins'
--
-- El primero: `"76491307-C"` es un **RUT chileno con dígito verificador**
-- llegando a `visita_id`, que es de tipo UUID. Postgres lo rechaza
-- siempre. El outbox reintenta 8 veces con backoff, se agota, y el
-- banner rojo queda pegado en toda la app.
--
-- `syncHandlers.js` ya lo detecta y lo desvía a `cliente_key`… pero
-- **esa columna no existe en la tabla**. Ése es el segundo error, y es
-- el que deja al primero sin salida.
--
-- Este archivo agrega las columnas que el handler necesita. Sin él, el
-- arreglo del código no puede funcionar.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- El cliente al que corresponde el check-in. Es un RUT normalizado
-- ("76491307-C"), NO un uuid — por eso es TEXT.
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS cliente_key TEXT;

-- Quién hizo el check-in. Sin esto no se puede saber qué vendedor
-- visitó, que es medio sentido de la tabla.
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS ejecutivo_id UUID;

-- Idempotencia del outbox: el mismo op reintentado no duplica la fila.
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS client_op_id TEXT;

-- Coordenadas reales del momento del check-in, para poder verificar
-- que el vendedor estuvo en la puerta y no a diez cuadras.
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS lat_real NUMERIC;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS lng_real NUMERIC;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS hora_llegada TIMESTAMPTZ;

-- 🔴 El índice que hace que el reintento sea SEGURO.
-- Sin él, un check-in cuya respuesta se perdió se inserta dos veces al
-- reintentar. Con él, Postgres devuelve 23505 y el handler lo trata
-- como éxito — que es lo correcto: la fila ya está.
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_client_op
  ON public.checkins (client_op_id)
  WHERE client_op_id IS NOT NULL;

-- Consultas típicas: los check-ins de hoy de un ejecutivo.
CREATE INDEX IF NOT EXISTS idx_checkins_ejecutivo_fecha
  ON public.checkins (ejecutivo_id, hora_llegada DESC);

CREATE INDEX IF NOT EXISTS idx_checkins_cliente
  ON public.checkins (cliente_key);

-- ═══════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO
-- ═══════════════════════════════════════════════════════════════════

-- ¿Están todas las columnas que el handler manda?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'checkins'
ORDER BY ordinal_position;

-- ¿Cuántos check-ins hay y de cuándo?
SELECT
  COUNT(*)                          AS total,
  COUNT(cliente_key)                AS con_cliente,
  COUNT(ejecutivo_id)               AS con_ejecutivo,
  MIN(hora_llegada)                 AS primero,
  MAX(hora_llegada)                 AS ultimo
FROM public.checkins;
