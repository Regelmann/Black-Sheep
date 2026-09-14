-- 035_mfa_superadmin.sql
-- Cierra el pendiente "MFA obligatorio para superadmin" de
-- docs/AUDITORIA_SEGURIDAD.md (antes de vender a la segunda empresa).
--
-- Supabase incluye el nivel de verificación alcanzado por la sesión en
-- la raíz del JWT: claim `aal` (Authenticator Assurance Level).
--   aal1 = entró solo con contraseña.
--   aal2 = contraseña + segundo factor confirmado en esta sesión.
-- Activar MFA en el Dashboard (Authentication → MFA) sólo ofrece el
-- factor; no obliga a nadie a usarlo. El que obliga es este chequeo:
-- sin aal2, platform.es_superadmin() devuelve false aunque el rol o la
-- tabla platform.superadmin digan que sí — así todas las funciones
-- admin_* y todo el control-center quedan cerrados hasta que el
-- superadmin haya verificado el segundo factor en esa sesión.

CREATE OR REPLACE FUNCTION platform.es_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT (
    COALESCE(platform.jwt() -> 'app_metadata' ->> 'rol_plataforma', '') = 'superadmin'
    OR COALESCE(platform.jwt() ->> 'rol_plataforma', '') = 'superadmin'
    OR EXISTS (SELECT 1 FROM platform.superadmin s
                WHERE s.usuario_id = platform.usuario_actual())
  )
  AND COALESCE(platform.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;
REVOKE ALL ON FUNCTION platform.es_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.es_superadmin() TO authenticated;

COMMENT ON FUNCTION platform.es_superadmin() IS
  'Superadmin exige rol_plataforma = superadmin Y aal2 (segundo factor
   verificado en la sesión actual). Sin aal2, todas las funciones
   admin_* y el control-center devuelven sin_permiso aunque el rol sea
   correcto. Requiere que el superadmin tenga un factor MFA inscrito
   (Dashboard → Authentication → MFA) y que el login lo haya pedido.
   Ver runbook de activación en docs/AUDITORIA_SEGURIDAD.md.';

-- Nota de diseño: no se toca platform.puede() ni el resto de RBAC —
-- este chequeo es exclusivo del rol superadmin/control-plane. Los
-- usuarios de cada empresa (tenant_admin, gerencia, ejecutivo) siguen
-- entrando con aal1, tal como hoy.
