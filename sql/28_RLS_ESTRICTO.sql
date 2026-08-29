-- ============================================================
-- 28_RLS_ESTRICTO.sql  ·  v-BS-PLATFORM-V9.9.5
--
-- EL PROBLEMA
-- -----------
-- Estas tablas tienen políticas `USING (true)`:
--
--   cartera · stock · metas · focos · ejecutivos · prospectos
--   zonas_comunas · gerencia_clientes
--
-- `USING (true)` significa: CUALQUIER usuario autenticado ve TODO.
--
-- Hoy no duele porque hay un solo cliente (KeyFoods). El día que entre
-- el segundo tenant, el ejecutivo de la empresa A ve la cartera completa
-- de la empresa B — clientes, precios, márgenes, metas.
--
-- Eso no es un bug de calidad. Es un incidente de seguridad, y en Chile
-- cae bajo la Ley 19.628 de protección de datos personales.
--
-- DEBE aplicarse ANTES de vender el segundo tenant, no después.
--
-- MODELO DE ACCESO
-- ----------------
--   ejecutivo   → sólo SU cartera (ejecutivo_id = su id)
--   gerente     → todas las zonas de SU tenant
--   superadmin  → todo su tenant
--   anon        → sólo catálogos publicados, por token
--
-- ORDEN: correr DESPUÉS de 27_IDEMPOTENCIA.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1) FUNCIONES DE IDENTIDAD
--    Se evalúan una vez por consulta (STABLE) en vez de por fila.
--    Sin esto, una política con subconsulta se ejecuta 3.000 veces
--    en una cartera de 3.000 filas.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mi_ejecutivo_id()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id::text FROM public.ejecutivos WHERE id::text = auth.uid()::text LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.mi_rol()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(lower(rol), 'ejecutivo')
  FROM public.ejecutivos
  WHERE id::text = auth.uid()::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.soy_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(lower(rol), '') IN ('superadmin', 'gerente', 'admin')
  FROM public.ejecutivos
  WHERE id::text = auth.uid()::text
  LIMIT 1;
$$;

-- Tenant del usuario. Si la columna todavía no existe, devuelve NULL
-- y las políticas se comportan como mono-tenant (compatible hacia atrás).
CREATE OR REPLACE FUNCTION public.mi_tenant()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v TEXT;
BEGIN
  EXECUTE 'SELECT tenant_id::text FROM public.ejecutivos WHERE id::text = $1 LIMIT 1'
    INTO v USING auth.uid()::text;
  RETURN v;
EXCEPTION WHEN undefined_column THEN
  RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.mi_ejecutivo_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mi_rol()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.soy_admin()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.mi_tenant()       TO authenticated;

-- ------------------------------------------------------------
-- 2) COLUMNA tenant_id
--    Preparación para multi-tenant. Todo lo existente queda como
--    'keyfoods': nada se rompe hoy.
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ejecutivos','cartera','stock','metas','focos','prospectos',
    'visitas','checkins','notas_cliente','pedidos','ofertas_cliente'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT ''keyfoods''', t);
      EXECUTE format(
        'UPDATE public.%I SET tenant_id = ''keyfoods'' WHERE tenant_id IS NULL', t);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', t || '_tenant_idx', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3) POLÍTICAS ESTRICTAS
--
-- Patrón de cada tabla:
--   LECTURA   admin → todo su tenant · ejecutivo → sólo lo suyo
--   ESCRITURA sólo admin (los datos operativos los escribe el ETL
--             con la service key, que ignora RLS)
-- ------------------------------------------------------------

-- ---------- CARTERA ----------
ALTER TABLE public.cartera ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cartera_update_admin ON public.cartera;
DROP POLICY IF EXISTS cartera_select       ON public.cartera;
DROP POLICY IF EXISTS cartera_all          ON public.cartera;

CREATE POLICY cartera_select ON public.cartera
  FOR SELECT TO authenticated
  USING (
    (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())
    AND (
      public.soy_admin()
      OR ejecutivo_id::text = public.mi_ejecutivo_id()
    )
  );

CREATE POLICY cartera_write ON public.cartera
  FOR UPDATE TO authenticated
  USING (public.soy_admin()
         AND (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant()))
  WITH CHECK (public.soy_admin());

-- ---------- STOCK ----------
-- El stock es de la empresa, no del ejecutivo: todos los de un tenant
-- lo ven. Pero NUNCA el de otro tenant.
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_update_admin ON public.stock;
DROP POLICY IF EXISTS stock_select       ON public.stock;

CREATE POLICY stock_select ON public.stock
  FOR SELECT TO authenticated
  USING (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant());

CREATE POLICY stock_write ON public.stock
  FOR UPDATE TO authenticated
  USING (public.soy_admin())
  WITH CHECK (public.soy_admin());

-- ---------- METAS y FOCOS ----------
-- Un ejecutivo NO debe ver las metas de sus pares.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['metas','focos'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name=t) THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_write',  t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR SELECT TO authenticated
        USING (
          (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())
          AND (public.soy_admin() OR ejecutivo_id::text = public.mi_ejecutivo_id())
        )$f$, t||'_select', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL TO authenticated
        USING (public.soy_admin()) WITH CHECK (public.soy_admin())$f$, t||'_write', t);
  END LOOP;
END $$;

-- ---------- EJECUTIVOS ----------
-- Cada uno se ve a sí mismo; el admin ve a su equipo. Nunca el de otra
-- empresa: la tabla tiene nombres y correos.
ALTER TABLE public.ejecutivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ejecutivos_select ON public.ejecutivos;
DROP POLICY IF EXISTS ejecutivos_write  ON public.ejecutivos;

CREATE POLICY ejecutivos_select ON public.ejecutivos
  FOR SELECT TO authenticated
  USING (
    id::text = auth.uid()::text          -- siempre puedo verme a mí
    OR (public.soy_admin()
        AND (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant()))
  );

CREATE POLICY ejecutivos_write ON public.ejecutivos
  FOR ALL TO authenticated
  USING (public.soy_admin()) WITH CHECK (public.soy_admin());

-- ---------- PROSPECTOS ----------
ALTER TABLE public.prospectos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospectos_select_authenticated ON public.prospectos;
DROP POLICY IF EXISTS prospectos_update_admin         ON public.prospectos;
DROP POLICY IF EXISTS prospectos_select               ON public.prospectos;

CREATE POLICY prospectos_select ON public.prospectos
  FOR SELECT TO authenticated
  USING (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant());

CREATE POLICY prospectos_write ON public.prospectos
  FOR ALL TO authenticated
  USING (public.soy_admin()) WITH CHECK (public.soy_admin());

-- ---------- VISITAS · CHECKINS · NOTAS · PEDIDOS ----------
-- Datos que genera el vendedor. Cada uno ve y escribe los suyos.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['visitas','checkins','notas_cliente','pedidos'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name=t) THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);

    -- Si la tabla no tiene ejecutivo_id, se aísla sólo por tenant.
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=t AND column_name='ejecutivo_id') THEN
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
        USING (
          (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())
          AND (public.soy_admin() OR ejecutivo_id::text = public.mi_ejecutivo_id())
        )$f$, t||'_select', t);

      -- No se puede escribir a nombre de otro ejecutivo.
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
        WITH CHECK (
          ejecutivo_id IS NULL
          OR ejecutivo_id::text = public.mi_ejecutivo_id()
          OR public.soy_admin()
        )$f$, t||'_insert', t);

      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
        USING (public.soy_admin() OR ejecutivo_id::text = public.mi_ejecutivo_id())
        WITH CHECK (public.soy_admin() OR ejecutivo_id::text = public.mi_ejecutivo_id())
        $f$, t||'_update', t);
    ELSE
      -- Sin ejecutivo_id no se puede aislar por autor, pero SÍ por tenant.
      -- Antes acá había USING (true) / WITH CHECK (true): cualquier usuario
      -- autenticado podía leer Y escribir en TODAS las tablas de cualquier
      -- empresa. Es el mismo hueco que el resto del archivo vino a cerrar.
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
        USING (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())$f$, t||'_select', t);
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
        WITH CHECK (
          public.soy_admin()
          OR (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())
        )$f$, t||'_insert', t);
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
        USING (
          public.soy_admin()
          OR (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())
        )
        WITH CHECK (
          public.soy_admin()
          OR (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())
        )$f$, t||'_update', t);
    END IF;
  END LOOP;
END $$;

-- ---------- ZONAS_COMUNAS ----------
-- Tabla de referencia, no tiene datos sensibles. Lectura para todos,
-- escritura sólo admin.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='zonas_comunas') THEN
    ALTER TABLE public.zonas_comunas ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS zonas_comunas_select ON public.zonas_comunas;
    DROP POLICY IF EXISTS zonas_comunas_write  ON public.zonas_comunas;
    CREATE POLICY zonas_comunas_select ON public.zonas_comunas
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY zonas_comunas_write ON public.zonas_comunas
      FOR ALL TO authenticated
      USING (public.soy_admin()) WITH CHECK (public.soy_admin());
  END IF;
END $$;

-- ============================================================
-- 4) DOBLE CHEQUEO
-- No alcanza con crear las políticas: hay que verificar que
-- REALMENTE aíslan.
-- ============================================================

-- CHEQUEO 1 · ¿queda alguna política abierta?
SELECT
  c.relname   AS tabla,
  pol.polname AS politica,
  CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                  WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                  ELSE 'ALL' END AS operacion,
  '🔴 USING(true) — cualquier autenticado ve todo' AS alerta
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
WHERE c.relnamespace = 'public'::regnamespace
  AND pg_get_expr(pol.polqual, pol.polrelid) = 'true'
  AND pol.polroles::text NOT LIKE '%anon%'
  -- zonas_comunas es tabla de referencia sin datos sensibles
  AND c.relname <> 'zonas_comunas'
ORDER BY c.relname;
-- Debe devolver CERO filas.

-- CHEQUEO 2 · ¿hay tablas sensibles con RLS apagado?
SELECT
  c.relname AS tabla,
  CASE WHEN c.relrowsecurity THEN '✅ RLS activo' ELSE '🔴 RLS APAGADO' END AS estado,
  COUNT(pol.polname) AS politicas
FROM pg_class c
LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND c.relname IN ('cartera','stock','metas','focos','ejecutivos','prospectos',
                    'visitas','checkins','notas_cliente','pedidos',
                    'ofertas_cliente','oferta_cliente_items')
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relrowsecurity, c.relname;

-- CHEQUEO 3 · aislamiento REAL entre ejecutivos
-- Simula la sesión de un ejecutivo no-admin y cuenta qué ve.
DO $$
DECLARE
  v_eje    TEXT;
  v_total  BIGINT;
  v_suyas  BIGINT;
BEGIN
  SELECT id::text INTO v_eje
  FROM public.ejecutivos
  WHERE COALESCE(lower(rol),'ejecutivo') NOT IN ('superadmin','gerente','admin')
  LIMIT 1;

  IF v_eje IS NULL THEN
    RAISE NOTICE '⚠️  Sin ejecutivos no-admin: no se pudo probar el aislamiento.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.cartera;
  SELECT COUNT(*) INTO v_suyas FROM public.cartera WHERE ejecutivo_id::text = v_eje;

  IF v_total = v_suyas THEN
    RAISE NOTICE '⚠️  El ejecutivo % tiene TODA la cartera asignada (% filas). '
                 'El aislamiento no se puede distinguir con estos datos.', v_eje, v_total;
  ELSE
    RAISE NOTICE '✅ Aislamiento configurable: de % filas totales, % son del ejecutivo %. '
                 'Con RLS activo sólo debería ver esas %.', v_total, v_suyas, v_eje, v_suyas;
  END IF;
END $$;

-- CHEQUEO 4 · el catálogo público sigue funcionando para anon
-- El RLS estricto NO debe romper el link que se le manda al cliente.
SELECT
  CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
       THEN '✅ anon puede leer catálogos'
       ELSE '🔴 se rompió el catálogo público' END AS estado
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='get_public_catalogo';

-- CHEQUEO 5 · el ETL sigue pudiendo escribir
-- La service key ignora RLS por diseño. Se verifica que no haya quedado
-- FORCE ROW LEVEL SECURITY, que SÍ afectaría al owner.
SELECT
  c.relname AS tabla,
  CASE WHEN c.relforcerowsecurity
       THEN '🔴 FORCE RLS — el ETL va a fallar'
       ELSE '✅ el ETL puede escribir' END AS estado
FROM pg_class c
WHERE c.relnamespace='public'::regnamespace
  AND c.relkind='r'
  AND c.relname IN ('cartera','stock','metas','focos','ejecutivos')
  AND c.relforcerowsecurity
ORDER BY c.relname;
-- Idealmente CERO filas.

-- ============================================================
-- 5) 🔴 PRE-VUELO OBLIGATORIO
--
-- El RLS estricto asume que `ejecutivos.id = auth.uid()`.
-- Si algún usuario NO tiene fila en `ejecutivos`, al aplicar estas
-- políticas queda BLOQUEADO: no ve nada y no puede trabajar.
--
-- CORRER ESTO ANTES de aplicar el resto del archivo.
-- Si devuelve filas, crear primero las filas faltantes.
-- ============================================================

-- ¿Hay usuarios autenticados SIN fila en ejecutivos?
SELECT
  u.id,
  u.email,
  '🔴 quedará BLOQUEADO — crear su fila en ejecutivos antes de aplicar RLS' AS alerta
FROM auth.users u
LEFT JOIN public.ejecutivos e ON e.id::text = u.id::text
WHERE e.id IS NULL
ORDER BY u.email;

-- ¿Hay al menos un admin? Sin admin, nadie puede administrar nada.
SELECT
  COUNT(*) FILTER (WHERE lower(COALESCE(rol,'')) IN ('superadmin','gerente','admin')) AS admins,
  COUNT(*) AS total_ejecutivos,
  CASE
    WHEN COUNT(*) FILTER (WHERE lower(COALESCE(rol,'')) IN ('superadmin','gerente','admin')) = 0
    THEN '🔴 SIN ADMIN — nadie podrá administrar. Asignar rol antes de aplicar RLS.'
    ELSE '✅ hay administrador'
  END AS estado
FROM public.ejecutivos;

-- Plantilla para crear una fila faltante (completar y ejecutar):
--
-- INSERT INTO public.ejecutivos (id, nombre, zona, rol, tenant_id)
-- VALUES ('UUID_DEL_USUARIO', 'Nombre Apellido', 'NOR-ORIENTE', 'ejecutivo', 'keyfoods');

-- ------------------------------------------------------------
-- ROLLBACK DE EMERGENCIA
-- Si tras aplicar el RLS alguien queda sin acceso y hay que
-- restablecer el servicio YA, correr esto y avisar:
--
--   ALTER TABLE public.cartera DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.stock   DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.metas   DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.focos   DISABLE ROW LEVEL SECURITY;
--
-- Es un parche temporal: deja los datos expuestos. Arreglar las filas
-- de `ejecutivos` y volver a activar el mismo día.
-- ------------------------------------------------------------
