-- DIAGNÓSTICO · schema "platform" (Control Center)
-- Es de SOLO LECTURA. Correr en el SQL Editor de Supabase y pegar acá
-- el resultado completo de las 3 consultas.

-- 1. ¿RLS está siquiera prendido en las tablas de platform?
SELECT c.relname AS tabla,
       CASE WHEN c.relrowsecurity THEN 'RLS ON' ELSE '🔴 RLS OFF' END AS estado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'platform' AND c.relkind = 'r'
ORDER BY c.relname;

-- 2. Qué políticas existen hoy en platform.* (si la tabla 1 dice RLS OFF,
--    esto va a salir vacío igual — sin RLS prendido, TODAS las filas son
--    visibles/editables para cualquiera con la anon key, sin importar
--    si hay políticas escritas).
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'platform'
ORDER BY tablename, policyname;

-- 3. Columnas reales de cada tabla (para armar las políticas correctas
--    después, sin adivinar tipos de dato).
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'platform'
ORDER BY table_name, ordinal_position;
