-- ═══════════════════════════════════════════════════════════════════
-- 49 · PREFLIGHT — antes de activar el aislamiento
--
-- 🔴 EL PROBLEMA QUE RLS NO RESUELVE
--
-- `42_ZONAS_CONFIGURABLES.sql` definió:
--
--     zonas.id             TEXT PRIMARY KEY   -- 'NORTE'
--     zonas_comunas.comuna TEXT PRIMARY KEY   -- 'LAS CONDES'
--
-- Con una sola empresa funciona. Con dos **no**: la segunda no puede
-- tener una zona llamada NORTE ni un cliente en LAS CONDES, porque la
-- clave primaria ya está tomada.
--
-- Y RLS no lo salva. El aislamiento filtra lo que se LEE; la clave
-- primaria rechaza el INSERT antes de que la política intervenga. El
-- síntoma sería un `23505 duplicate key` al dar de alta al segundo
-- cliente, con la causa a diez capas de distancia.
--
-- Por eso este archivo va ANTES de las políticas: primero la clave
-- compuesta, después el aislamiento.
--
-- ── ORDEN CORRECTO ─────────────────────────────────────────────────
--     49  (este)  → claves compuestas + diagnóstico
--     50           → tenant_id + índices
--     51/52        → RBAC + políticas fail-closed
--
-- Idempotente. Se puede correr las veces que haga falta.
-- ═══════════════════════════════════════════════════════════════════

-- ═══ PARTE 1 · DIAGNÓSTICO ═════════════════════════════════════════
-- Correr esto SOLO primero. Si algo sale mal acá, no sigas.

-- 1.1 · ¿Qué tablas tienen una PK que va a colisionar entre empresas?
-- Cualquier fila con `colisiona = SÍ` rompe al segundo cliente.
SELECT
  tc.table_name,
  string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS pk,
  CASE
    WHEN 'tenant_id' = ANY(array_agg(kcu.column_name)) THEN 'no'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns c
       WHERE c.table_schema='public' AND c.table_name=tc.table_name
         AND c.column_name='tenant_id'
    ) THEN 'SÍ ⚠️'
    ELSE 'sin tenant_id'
  END AS colisiona
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
 AND kcu.table_schema    = tc.table_schema
WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
GROUP BY tc.table_name
ORDER BY colisiona DESC, tc.table_name;

-- 1.2 · ¿Hay filas sin tenant_id? Con RLS fail-closed quedan invisibles
-- para TODOS: no las ve nadie, ni el gerente.
DO $$
DECLARE t TEXT; n BIGINT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
     WHERE table_schema='public' AND column_name='tenant_id'
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE tenant_id IS NULL', t)
      INTO n;
    IF n > 0 THEN
      RAISE WARNING '⚠️  %: % fila(s) SIN tenant_id — quedarían invisibles', t, n;
    END IF;
  END LOOP;
END $$;

-- 1.3 · ¿Qué políticas abiertas quedan vivas?
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname='public' AND qual='true'
ORDER BY tablename;


-- ═══ PARTE 2 · CLAVES COMPUESTAS ═══════════════════════════════════
-- Recién después de revisar la parte 1.

-- 2.1 · zonas: la PK pasa a (tenant_id, id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='zonas') THEN

    ALTER TABLE public.zonas ADD COLUMN IF NOT EXISTS tenant_id TEXT;
    UPDATE public.zonas SET tenant_id='keyfoods' WHERE tenant_id IS NULL;
    ALTER TABLE public.zonas ALTER COLUMN tenant_id SET NOT NULL;

    -- La FK de zonas_comunas depende de esta PK: se suelta primero.
    ALTER TABLE IF EXISTS public.zonas_comunas
      DROP CONSTRAINT IF EXISTS zonas_comunas_zona_id_fkey;

    ALTER TABLE public.zonas DROP CONSTRAINT IF EXISTS zonas_pkey;
    ALTER TABLE public.zonas ADD  CONSTRAINT zonas_pkey
      PRIMARY KEY (tenant_id, id);
  END IF;
END $$;

-- 2.2 · zonas_comunas: la comuna se repite entre empresas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='zonas_comunas') THEN

    ALTER TABLE public.zonas_comunas ADD COLUMN IF NOT EXISTS tenant_id TEXT;
    UPDATE public.zonas_comunas SET tenant_id='keyfoods' WHERE tenant_id IS NULL;
    ALTER TABLE public.zonas_comunas ALTER COLUMN tenant_id SET NOT NULL;

    ALTER TABLE public.zonas_comunas DROP CONSTRAINT IF EXISTS zonas_comunas_pkey;
    ALTER TABLE public.zonas_comunas ADD  CONSTRAINT zonas_comunas_pkey
      PRIMARY KEY (tenant_id, comuna);

    -- La FK vuelve, ahora compuesta: una comuna sólo puede apuntar a
    -- una zona DE SU MISMA EMPRESA. Sin esto, la comuna de una empresa
    -- podría referenciar la zona de otra.
    ALTER TABLE public.zonas_comunas
      ADD CONSTRAINT zonas_comunas_zona_fkey
      FOREIGN KEY (tenant_id, zona_id)
      REFERENCES public.zonas (tenant_id, id)
      ON UPDATE CASCADE;
  END IF;
END $$;

-- 2.3 · metas_zona: mismo caso
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='metas_zona') THEN

    ALTER TABLE public.metas_zona ADD COLUMN IF NOT EXISTS tenant_id TEXT;
    UPDATE public.metas_zona SET tenant_id='keyfoods' WHERE tenant_id IS NULL;
    ALTER TABLE public.metas_zona ALTER COLUMN tenant_id SET NOT NULL;

    ALTER TABLE public.metas_zona DROP CONSTRAINT IF EXISTS metas_zona_pkey;
    ALTER TABLE public.metas_zona ADD  CONSTRAINT metas_zona_pkey
      PRIMARY KEY (tenant_id, zona_id, periodo);
  END IF;
END $$;

-- 2.4 · cartera: el mismo RUT puede ser cliente de dos empresas
--       distintas. Es el caso MÁS probable de todos.
DO $$
DECLARE v_pk TEXT;
BEGIN
  SELECT string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position)
    INTO v_pk
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
  WHERE tc.table_schema='public' AND tc.table_name='cartera'
    AND tc.constraint_type='PRIMARY KEY';

  IF v_pk IS NOT NULL AND v_pk NOT LIKE '%tenant_id%' THEN
    RAISE WARNING 'cartera tiene PK (%) sin tenant_id — revisar a mano', v_pk;
  END IF;
END $$;

-- 2.5 · Los índices únicos también colisionan, no sólo las PK.
SELECT
  i.relname  AS indice,
  t.relname  AS tabla,
  pg_get_indexdef(ix.indexrelid) AS definicion
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname='public' AND ix.indisunique AND NOT ix.indisprimary
  AND pg_get_indexdef(ix.indexrelid) NOT LIKE '%tenant_id%'
  AND EXISTS (
    SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema='public' AND c.table_name=t.relname
       AND c.column_name='tenant_id'
  )
ORDER BY t.relname;

-- ═══ VERIFICACIÓN FINAL ════════════════════════════════════════════
-- Repetir 1.1: ya no debería quedar ninguna fila con `SÍ ⚠️`.
