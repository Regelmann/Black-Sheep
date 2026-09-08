-- 99 · DIAGNÓSTICO DE SEGURIDAD
-- Este archivo es de lectura. No modifica datos.

-- 1. Tablas con tenant_id sin RLS.
SELECT c.table_name,
       CASE WHEN cls.relrowsecurity THEN 'OK' ELSE 'ERROR: RLS OFF' END AS rls
FROM information_schema.columns c
JOIN pg_class cls ON cls.relname = c.table_name
JOIN pg_namespace n ON n.oid = cls.relnamespace AND n.nspname = 'public'
WHERE c.table_schema = 'public'
  AND c.column_name = 'tenant_id'
ORDER BY rls, c.table_name;

-- 2. Políticas abiertas explícitas.
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    lower(COALESCE(qual,'')) IN ('true','(true)')
    OR lower(COALESCE(with_check,'')) IN ('true','(true)')
  )
ORDER BY tablename, policyname;

-- 3. Tablas de negocio sin tenant_id.
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND table_type='BASE TABLE'
  AND table_name NOT IN ('tenants','tenant_members')
  AND table_name NOT LIKE 'pg_%'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public'
      AND c.table_name=information_schema.tables.table_name
      AND c.column_name='tenant_id'
  )
ORDER BY table_name;

-- 4. Índices de tenant.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND indexdef ILIKE '%tenant_id%'
ORDER BY tablename, indexname;

-- 5. Membresías activas por usuario: debe existir como máximo una.
SELECT user_id, COUNT(*) AS activas
FROM public.tenant_members
WHERE activo
GROUP BY user_id
HAVING COUNT(*) > 1;

-- 6. Ejecutivos con tenant inexistente.
SELECT e.id, e.tenant_id
FROM public.ejecutivos e
LEFT JOIN public.tenants t ON t.id = e.tenant_id
WHERE t.id IS NULL;

-- 7. Security Gate: políticas de escritura demasiado amplias.
-- Debe devolver cero filas para entidades con ejecutivo_id.
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies p
WHERE schemaname = 'public'
  AND cmd IN ('UPDATE','DELETE','ALL')
  AND EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = p.tablename
      AND c.column_name = 'ejecutivo_id'
  )
  AND (
    lower(COALESCE(qual,'')) NOT LIKE '%ejecutivo_id%'
    OR (cmd IN ('UPDATE','ALL') AND lower(COALESCE(with_check,'')) NOT LIKE '%ejecutivo_id%')
  )
ORDER BY tablename, policyname;

-- 8. Security Gate: pedidos no deben depender de inserts directos.
-- Revisión estática del repositorio: el resultado esperado es cero
-- referencias a .from('pedidos').insert fuera de una migración SQL.
-- La aplicación debe llamar api.guardar_pedido con idempotencia.

-- 9. Security Gate: hook único y fail-closed.
SELECT proname, COUNT(*) AS overloads
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('custom_access_token_hook','current_tenant_id','tenant_actual')
GROUP BY proname
ORDER BY proname;
