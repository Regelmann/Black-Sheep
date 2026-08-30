-- ============================================================
-- 27_IDEMPOTENCIA.sql  ·  v-BS-PLATFORM-V9.9.4
--
-- EL PROBLEMA QUE RESUELVE
-- ------------------------
-- La app encola las acciones offline y las reintenta al recuperar red.
-- Pero hay un caso que ningún reintento resuelve solo:
--
--   1. El vendedor hace check-in en un subterráneo.
--   2. Vuelve la señal, el INSERT LLEGA a Supabase y se ejecuta.
--   3. La respuesta se pierde en el camino (túnel, señal que cae).
--   4. La app no recibió confirmación → el item sigue en la cola.
--   5. Reintenta → CHECK-IN DUPLICADO.
--
-- El dato ya estaba guardado. El reintento lo duplicó.
--
-- Con el pedido es peor: un pedido duplicado se despacha dos veces.
--
-- LA SOLUCIÓN — idempotencia
-- Cada acción encolada lleva un client_op_id (UUID) generado en el
-- teléfono. El reintento manda EL MISMO id. Un índice único lo rechaza
-- con 23505, y la app trata ese error como ÉXITO: el dato está.
--
-- Es el estándar de la arquitectura offline-first: "queue operations
-- for deferred sync" sólo es seguro si las operaciones son idempotentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Columna de idempotencia en cada tabla que recibe escrituras
--    desde la cola offline.
-- ------------------------------------------------------------
ALTER TABLE public.checkins       ADD COLUMN IF NOT EXISTS client_op_id UUID;
ALTER TABLE public.pedidos        ADD COLUMN IF NOT EXISTS client_op_id UUID;
ALTER TABLE public.notas_cliente  ADD COLUMN IF NOT EXISTS client_op_id UUID;
ALTER TABLE public.visitas        ADD COLUMN IF NOT EXISTS client_op_id UUID;

COMMENT ON COLUMN public.checkins.client_op_id IS
  'UUID generado en el teléfono al encolar. Índice único → el reintento '
  'de una operación cuya respuesta se perdió no duplica la fila.';

-- ------------------------------------------------------------
-- 2) Índices únicos PARCIALES
--    WHERE client_op_id IS NOT NULL: las filas históricas (anteriores
--    a esta migración) tienen NULL y no deben bloquearse entre sí.
--    En Postgres varios NULL no colisionan, pero el índice parcial lo
--    deja explícito y además es más chico.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS checkins_op_uidx
  ON public.checkins (client_op_id) WHERE client_op_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pedidos_op_uidx
  ON public.pedidos (client_op_id) WHERE client_op_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notas_op_uidx
  ON public.notas_cliente (client_op_id) WHERE client_op_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS visitas_op_uidx
  ON public.visitas (client_op_id) WHERE client_op_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3) Limpieza de duplicados YA existentes
--    Antes de este archivo no había protección: es probable que haya
--    check-ins repetidos de reintentos viejos.
--
--    NO BORRA NADA. Sólo reporta, para que decidas vos.
-- ------------------------------------------------------------
SELECT
  'checkins' AS tabla,
  visita_id,
  COUNT(*)                       AS repetidos,
  MIN(creado_en)                 AS primero,
  MAX(creado_en)                 AS ultimo,
  MAX(creado_en) - MIN(creado_en) AS diferencia
FROM public.checkins
WHERE creado_en > CURRENT_DATE - INTERVAL '60 days'
GROUP BY visita_id
HAVING COUNT(*) > 1
   -- Menos de 10 minutos entre ambos = casi seguro un reintento,
   -- no dos visitas reales al mismo cliente.
   AND MAX(creado_en) - MIN(creado_en) < INTERVAL '10 minutes'
ORDER BY repetidos DESC
LIMIT 50;

-- Para BORRAR los duplicados (revisar la lista de arriba primero):
--
-- DELETE FROM public.checkins c
-- USING (
--   SELECT visita_id, MIN(creado_en) AS conservar
--   FROM public.checkins
--   WHERE creado_en > CURRENT_DATE - INTERVAL '60 days'
--   GROUP BY visita_id
--   HAVING COUNT(*) > 1
--      AND MAX(creado_en) - MIN(creado_en) < INTERVAL '10 minutes'
-- ) d
-- WHERE c.visita_id = d.visita_id AND c.creado_en > d.conservar;

-- ------------------------------------------------------------
-- 4) DOBLE CHEQUEO
-- ------------------------------------------------------------

-- CHEQUEO 1 · las cuatro tablas tienen columna e índice
SELECT
  t.tabla,
  CASE WHEN c.column_name IS NULL THEN '❌ falta columna' ELSE '✅ columna' END AS col,
  CASE WHEN i.indexname   IS NULL THEN '❌ falta índice'  ELSE '✅ índice'  END AS idx
FROM (VALUES
  ('checkins','checkins_op_uidx'),
  ('pedidos','pedidos_op_uidx'),
  ('notas_cliente','notas_op_uidx'),
  ('visitas','visitas_op_uidx')
) AS t(tabla, indice)
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name=t.tabla AND c.column_name='client_op_id'
LEFT JOIN pg_indexes i
  ON i.schemaname='public' AND i.tablename=t.tabla AND i.indexname=t.indice
ORDER BY t.tabla;

-- CHEQUEO 2 · el índice REALMENTE rechaza un duplicado
-- No basta con que exista: hay que probar que funciona.
DO $$
DECLARE
  v_op   UUID := gen_random_uuid();
  v_bien BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.checkins (client_op_id, hora_llegada)
    VALUES (v_op, now());

    -- Segundo insert con el MISMO op id: debe fallar.
    BEGIN
      INSERT INTO public.checkins (client_op_id, hora_llegada)
      VALUES (v_op, now());
      RAISE WARNING '❌ El índice NO rechazó el duplicado. La idempotencia no protege.';
    EXCEPTION WHEN unique_violation THEN
      v_bien := TRUE;
    END;

    -- Limpiar la prueba pase lo que pase.
    DELETE FROM public.checkins WHERE client_op_id = v_op;

    IF v_bien THEN
      RAISE NOTICE '✅ Idempotencia verificada: el reintento no duplica.';
    END IF;

  EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.checkins WHERE client_op_id = v_op;
    RAISE WARNING '⚠️  No se pudo probar (%). Verificar a mano.', SQLERRM;
  END;
END $$;

-- CHEQUEO 3 · cuántos duplicados históricos hay
SELECT
  COUNT(*) AS grupos_duplicados,
  CASE WHEN COUNT(*) = 0
       THEN '✅ sin duplicados en 60 días'
       ELSE '⚠️ hay check-ins repetidos de reintentos viejos — ver consulta 3' END AS estado
FROM (
  SELECT visita_id
  FROM public.checkins
  WHERE creado_en > CURRENT_DATE - INTERVAL '60 days'
  GROUP BY visita_id
  HAVING COUNT(*) > 1
     AND MAX(creado_en) - MIN(creado_en) < INTERVAL '10 minutes'
) t;
