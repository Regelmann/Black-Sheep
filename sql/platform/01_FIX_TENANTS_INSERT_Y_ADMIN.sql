-- sql/platform/01_FIX_TENANTS_INSERT_Y_ADMIN.sql
--
-- Corrige dos problemas encontrados en el schema "platform" (Control
-- Center + Stripe/Mercado Pago), ninguno de los cuales tenía .sql en
-- el repo hasta ahora — se habían creado a mano en Supabase.
--
-- ⚠️  ANTES DE CORRER: confirmá que ya existe una fila tuya en
--     platform.platform_admins con activo = true. Si no existe, este
--     archivo te deja SIN acceso de admin (el email hardcodeado que
--     usás hoy como respaldo deja de funcionar). Verificar con:
--
--     SELECT * FROM platform.platform_admins
--     WHERE usuario_id = (SELECT id FROM auth.users WHERE email = 'sregelmann@gmail.com');
--
--     Si no devuelve ninguna fila, correr primero:
--
--     INSERT INTO platform.platform_admins (usuario_id, activo)
--     SELECT id, true FROM auth.users WHERE email = 'sregelmann@gmail.com'
--     ON CONFLICT (usuario_id) DO UPDATE SET activo = true;

-- ═══ 1 · Función helper (mismo patrón que current_tenant_id()/
--         is_tenant_admin() en sql/security/51, pero para este schema) ═══
-- SECURITY DEFINER: corre con los permisos del dueño de la función, así
-- que la consulta interna a platform_admins no vuelve a pasar por RLS
-- (si pasara por RLS otra vez, se necesitaría este mismo chequeo para
-- resolver el chequeo → recursión). Es el patrón estándar de Supabase
-- para este tipo de helper.
CREATE OR REPLACE FUNCTION platform.es_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = platform, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform.platform_admins
    WHERE usuario_id = auth.uid() AND activo = true
  );
$$;

REVOKE ALL ON FUNCTION platform.es_platform_admin() FROM public;
GRANT EXECUTE ON FUNCTION platform.es_platform_admin() TO authenticated;

-- ═══ 2 · tenants: falta la política de INSERT ═══════════════════════
-- Hoy "crear tenant" en el Control Center falla siempre (RLS deniega
-- por defecto si no hay política que lo permita explícitamente).
DROP POLICY IF EXISTS platform_admin_tenants_insert ON platform.tenants;
CREATE POLICY platform_admin_tenants_insert ON platform.tenants
  FOR INSERT TO authenticated
  WITH CHECK (platform.es_platform_admin());

-- Bonus, no estaba pedido pero es el mismo hueco: tampoco hay UPDATE
-- en tenants (por si en algún momento agregan "editar tenant" o
-- "desactivar tenant" — hoy tampoco funcionaría). La agrego ya que
-- estamos, comentada por si preferís no habilitarla todavía:
-- CREATE POLICY platform_admin_tenants_update ON platform.tenants
--   FOR UPDATE TO authenticated
--   USING (platform.es_platform_admin())
--   WITH CHECK (platform.es_platform_admin());

-- ═══ 3 · Reemplazar el email hardcodeado por el chequeo real ════════
-- audit_log: sólo lectura, hoy solo el email fijo podía leer.
DROP POLICY IF EXISTS platform_admin_audit_read ON platform.audit_log;
CREATE POLICY platform_admin_audit_read ON platform.audit_log
  FOR SELECT TO authenticated
  USING (platform.es_platform_admin());

-- suscripciones: FOR ALL (select/insert/update/delete), hoy solo el
-- email fijo podía tocarlas — por eso el alta de suscripción desde el
-- Control Center también iba a fallar para cualquier otro admin.
DROP POLICY IF EXISTS platform_admin_suscripciones ON platform.suscripciones;
CREATE POLICY platform_admin_suscripciones ON platform.suscripciones
  FOR ALL TO authenticated
  USING (platform.es_platform_admin())
  WITH CHECK (platform.es_platform_admin());

-- platform_admins: se mantiene que cada uno vea su propia fila: se
-- suma que cualquier admin activo pueda ver el listado completo (para
-- poder administrar admins más adelante) en vez de solo el email fijo.
DROP POLICY IF EXISTS platform_admins_self ON platform.platform_admins;
CREATE POLICY platform_admins_self ON platform.platform_admins
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR platform.es_platform_admin());

-- ═══ 4 · Verificación ════════════════════════════════════════════════
-- Ya no debería quedar ninguna política con el email hardcodeado.
SELECT schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'platform'
  AND (
    qual ILIKE '%sregelmann%'
    OR with_check ILIKE '%sregelmann%'
  );
-- Debe devolver 0 filas.
