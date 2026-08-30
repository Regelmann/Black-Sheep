-- ============================================================
-- 25_CATALOGO_FINAL.sql  ·  v-BS-PLATFORM-V9.9
--
-- ÚNICA definición viva de get_public_catalogo(). Correr al final.
--
-- POR QUÉ EXISTE
-- --------------
-- La función llegó a estar definida en CINCO archivos:
--   20_CATALOGO_CANONICO · 22_HOTFIX_V931 · 23_DATA_ISOLATION
--   24_CATALOGO_COLS_REALES · 24_CATALOGO_RPC_FINAL
--
-- Los dos últimos tenían el MISMO número (24), así que ni siquiera
-- había un orden que los desempatara. `create or replace` sólo pisa
-- la función de firma idéntica: la viva en la base era la del último
-- script ejecutado, y nadie sabía cuál.
--
-- Ese es el motivo de "Catálogo no disponible" en el teléfono.
-- Es el mismo bug de V9.3, repetido.
--
-- Detectado por scripts/guard.js regla R8.
-- ============================================================

-- 1) Esquema: la columna es `activo`. Nunca `activa`.
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
    EXECUTE 'UPDATE public.ofertas_cliente SET activo = COALESCE(activo, activa, TRUE)';
    EXECUTE 'ALTER TABLE public.ofertas_cliente DROP COLUMN activa';
  END IF;
END $$;

UPDATE public.ofertas_cliente SET activo = TRUE WHERE activo IS NULL;
ALTER TABLE public.ofertas_cliente ALTER COLUMN activo SET DEFAULT TRUE;

-- 2) Eliminar TODAS las sobrecargas antes de recrear.
DO $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='public' AND p.proname='get_public_catalogo'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Sobrecargas de get_public_catalogo eliminadas: %', n;
END $$;

-- 3) La DEFINICIÓN de get_public_catalogo() vive en 26_CATALOGO_ORDEN.sql
--    Este archivo sólo sanea el esquema y elimina sobrecargas viejas.
--    Correr 25 y DESPUÉS 26.

-- 4) VERIFICACIÓN — debe devolver EXACTAMENTE una fila
SELECT
  p.oid::regprocedure AS firma,
  CASE WHEN COUNT(*) OVER () = 1
       THEN 'OK · firma única'
       ELSE 'ERROR · sigue habiendo sobrecarga' END AS estado,
  CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
       THEN 'anon OK' ELSE 'FALTA GRANT anon' END AS permiso
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='get_public_catalogo';
