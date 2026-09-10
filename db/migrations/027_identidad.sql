-- ═══════════════════════════════════════════════════════════════════
-- 027 · PUENTE DE IDENTIDAD · sin esto nadie puede entrar
--
-- EL PROBLEMA
-- Toda la seguridad depende de que el token traiga `tenant_id`.
-- Supabase Auth no lo pone solo. Un usuario recién creado entra, su
-- token no trae tenant, `tenant_actual()` devuelve NULL, la RLS le
-- niega todo y ve una app vacía sin entender por qué.
--
-- LA SOLUCIÓN: un hook de token. Supabase llama a esta función cada vez
-- que emite un JWT y ella agrega los claims LEYENDO LA BASE.
--
-- Por qué importa que sea así y no `app_metadata` a mano:
--   · Se revoca solo. Desactivar una membresía quita el acceso en el
--     siguiente refresh, sin editar usuarios uno por uno.
--   · No hay forma de que el cliente se asigne otro tenant: el claim
--     no viaja desde el navegador, lo escribe el servidor en cada emisión.
--
-- Configurar en Supabase → Authentication → Hooks →
--   Custom Access Token: platform.custom_access_token_hook
-- ═══════════════════════════════════════════════════════════════════

-- ─── Superadmin · el arranque ──────────────────────────────────────
-- Tabla y no claim editable: el primer superadmin se inserta UNA vez
-- desde el SQL Editor y de ahí en adelante todo se hace por la app.
CREATE TABLE IF NOT EXISTS platform.superadmin (
  usuario_id UUID PRIMARY KEY,
  email      TEXT NOT NULL,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  nota       TEXT
);

COMMENT ON TABLE platform.superadmin IS
  'Quién opera la plataforma. Se siembra a mano una sola vez:
     INSERT INTO platform.superadmin (usuario_id, email)
     SELECT id, email FROM auth.users WHERE email = ''tu@correo.cl'';
   Sin esta fila, ni siquiera vos podés dar de alta una empresa.';

ALTER TABLE platform.superadmin ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.superadmin FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS superadmin_lectura ON platform.superadmin;
CREATE POLICY superadmin_lectura ON platform.superadmin FOR SELECT
  USING (platform.es_superadmin());

-- ─── es_superadmin ahora también mira la tabla ─────────────────────
CREATE OR REPLACE FUNCTION platform.es_superadmin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT COALESCE(platform.jwt() -> 'app_metadata' ->> 'rol_plataforma', '') = 'superadmin'
      OR COALESCE(platform.jwt() ->> 'rol_plataforma', '') = 'superadmin'
      OR EXISTS (SELECT 1 FROM platform.superadmin s
                  WHERE s.usuario_id = platform.usuario_actual());
$$;
REVOKE ALL ON FUNCTION platform.es_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.es_superadmin() TO authenticated;

-- ─── El hook ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
DECLARE
  v_uid UUID := (event ->> 'user_id')::uuid;
  v_claims JSONB := COALESCE(event -> 'claims', '{}'::jsonb);
  v_tenant UUID; v_rol TEXT; v_super BOOLEAN;
BEGIN
  SELECT m.tenant_id, m.rol INTO v_tenant, v_rol
    FROM platform.membresias m
    JOIN platform.tenants t ON t.id = m.tenant_id
   WHERE m.usuario_id = v_uid AND m.activo AND t.activo
   ORDER BY m.creado_en
   LIMIT 1;

  SELECT EXISTS (SELECT 1 FROM platform.superadmin s WHERE s.usuario_id = v_uid)
    INTO v_super;

  IF v_tenant IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant::text));
    v_claims := jsonb_set(v_claims, '{rol}',       to_jsonb(v_rol));
  END IF;
  IF v_super THEN
    v_claims := jsonb_set(v_claims, '{rol_plataforma}', '"superadmin"'::jsonb);
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END $$;

COMMENT ON FUNCTION platform.custom_access_token_hook(JSONB) IS
  'Un usuario con varias empresas recibe la más antigua. Cambiar de
   empresa es una función aparte, no un claim que el cliente elija.';

-- El hook lo ejecuta el rol supabase_auth_admin, que sólo existe en
-- Supabase. En una base local se omite este bloque sin ruido: el resto
-- de las migraciones tiene que poder correr y probarse igual.
REVOKE EXECUTE ON FUNCTION platform.custom_access_token_hook(JSONB)
  FROM PUBLIC, authenticated, anon;

DO $hook$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    RAISE NOTICE 'supabase_auth_admin no existe (base local): se omiten sus permisos';
    RETURN;
  END IF;

  EXECUTE 'GRANT EXECUTE ON FUNCTION platform.custom_access_token_hook(JSONB) TO supabase_auth_admin';
  EXECUTE 'GRANT USAGE ON SCHEMA platform TO supabase_auth_admin';
  EXECUTE 'GRANT SELECT ON platform.membresias, platform.tenants, platform.superadmin TO supabase_auth_admin';

  -- El hook lee estas tablas y la RLS lo bloquearía. Se le abre SÓLO
  -- lectura y SÓLO sobre lo que necesita para armar los claims.
  EXECUTE 'DROP POLICY IF EXISTS auth_admin_lee_membresias ON platform.membresias';
  EXECUTE 'CREATE POLICY auth_admin_lee_membresias ON platform.membresias FOR SELECT TO supabase_auth_admin USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS auth_admin_lee_tenants ON platform.tenants';
  EXECUTE 'CREATE POLICY auth_admin_lee_tenants ON platform.tenants FOR SELECT TO supabase_auth_admin USING (true)';
  EXECUTE 'DROP POLICY IF EXISTS auth_admin_lee_superadmin ON platform.superadmin';
  EXECUTE 'CREATE POLICY auth_admin_lee_superadmin ON platform.superadmin FOR SELECT TO supabase_auth_admin USING (true)';
END $hook$;

-- ─── auth.users → platform.usuarios ────────────────────────────────
CREATE OR REPLACE FUNCTION platform.fn_sincronizar_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  INSERT INTO platform.usuarios (id, email, nombre)
       VALUES (NEW.id, NEW.email,
               COALESCE(NEW.raw_user_meta_data ->> 'nombre',
                        NEW.raw_user_meta_data ->> 'full_name'))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        nombre = COALESCE(EXCLUDED.nombre, platform.usuarios.nombre);
  RETURN NEW;
END $$;

-- Es SECURITY DEFINER porque escribe en platform.usuarios, que tiene
-- RLS. Sólo la llama el trigger de auth.users: nadie más debe poder
-- ejecutarla, o alguien podría insertarse una ficha de usuario.
REVOKE ALL ON FUNCTION platform.fn_sincronizar_usuario() FROM PUBLIC;

COMMENT ON FUNCTION platform.fn_sincronizar_usuario() IS
  'auth.users es de Supabase; platform.usuarios es nuestro. El trigger
   los mantiene juntos. Sin esto hay que copiar cada UUID a mano y a la
   tercera empresa alguien se equivoca.';

DO $$
BEGIN
  -- auth.users sólo existe en Supabase. En local se omite sin ruido.
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='auth' AND tablename='users') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS tg_sincronizar_usuario ON auth.users';
    EXECUTE 'CREATE TRIGGER tg_sincronizar_usuario
               AFTER INSERT OR UPDATE OF email ON auth.users
               FOR EACH ROW EXECUTE FUNCTION platform.fn_sincronizar_usuario()';
  END IF;
END $$;

-- ─── Invitar a alguien a la empresa ────────────────────────────────
-- El usuario se crea en Supabase Auth (invitación por correo); esta
-- función lo enlaza con la empresa y con su ficha de ejecutivo.
CREATE OR REPLACE FUNCTION api.invitar_usuario(
  p_email TEXT, p_rol TEXT, p_nombre TEXT DEFAULT NULL,
  p_ejecutivo_id TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform, core AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_uid UUID;
BEGIN
  IF NOT platform.puede('gestionar_usuarios') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_rol NOT IN ('tenant_admin','gerencia','ejecutivo','solo_lectura') THEN
    RAISE EXCEPTION 'rol_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_uid FROM platform.usuarios WHERE lower(email) = lower(trim(p_email));
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'usuario_no_registrado' USING ERRCODE = 'P0002',
      HINT = 'Invítalo primero desde Supabase → Authentication → Invite user. '
             'Cuando acepte, vuelve a ejecutar esto.';
  END IF;

  INSERT INTO platform.membresias (usuario_id, tenant_id, rol)
       VALUES (v_uid, v_tenant, p_rol)
  ON CONFLICT (usuario_id, tenant_id) DO UPDATE SET rol = EXCLUDED.rol, activo = TRUE;

  IF p_ejecutivo_id IS NOT NULL THEN
    UPDATE core.ejecutivo SET usuario_id = v_uid, email = p_email
     WHERE tenant_id = v_tenant AND id = p_ejecutivo_id;
  END IF;

  RETURN 'listo · el acceso se aplica cuando vuelva a iniciar sesión';
END $$;

REVOKE ALL ON FUNCTION api.invitar_usuario(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.invitar_usuario(TEXT, TEXT, TEXT, TEXT) TO authenticated;
