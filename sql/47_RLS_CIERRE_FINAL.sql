-- ============================================================
-- 47_RLS_CIERRE_FINAL.sql  ·  v-BS-PLATFORM-V13.2
--
-- CIERRE FINAL DE RLS PARA MULTI-TENANT
-- -------------------------------------
-- Los SQL históricos (08, 13, 14, 15, 17, 19, 20, 21, 22, 23) abren
-- políticas `USING (true)` para `authenticated`. `28_RLS_ESTRICTO.sql`
-- y `35_RLS_CATALOGO.sql` ya las cierran, pero:
--   1) no cubren todas las tablas (gerencia_clientes, encuestas_visita,
--      decision_feedback, etc.);
--   2) si alguien re-ejecuta un SQL viejo después de 28/35, REABRE el
--      hueco.
--
-- Este archivo es el **punto final**: re-aplica el modelo estricto sobre
-- todas las tablas de la plataforma y verifica que no quede ningún
-- `USING(true)` fuera de la tabla de referencia `zonas_comunas` y de
-- las políticas públicas con `anon`.
--
-- MODELO
--   ejecutivo  → sólo sus datos (o los de su tenant para catálogo/stock)
--   gerente    → todo su tenant
--   superadmin → todo su tenant
--   anon       → sólo catálogos activos por token
--
-- ORDEN: correr DESPUÉS de 28_RLS_ESTRICTO.sql y 35_RLS_CATALOGO.sql.
--        Es idempotente: se puede volver a ejecutar tras cualquier
--        re-ejecución de un SQL viejo.
-- ============================================================

-- ------------------------------------------------------------
-- 0) FUNCIONES DE IDENTIDAD
--    No se redefinen acá: `mi_ejecutivo_id()`, `mi_rol()`,
--    `soy_admin()` y `mi_tenant()` tienen su fuente única en
--    28_RLS_ESTRICTO.sql. Ese archivo SIEMPRE corre antes de éste.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 1) tenant_id en todas las tablas de negocio
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ejecutivos', 'cartera', 'stock', 'metas', 'focos', 'prospectos',
    'visitas', 'checkins', 'notas_cliente', 'pedidos', 'ofertas_cliente',
    'gerencia_clientes', 'encuestas_visita', 'decision_feedback'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT ''keyfoods''', t);
      EXECUTE format('UPDATE public.%I SET tenant_id = ''keyfoods'' WHERE tenant_id IS NULL', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', t || '_tenant_idx', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2) POLÍTICAS ESTRICTAS · DATOS DEL VENDEDOR
-- ------------------------------------------------------------
-- cartera · metas · focos: propio / admin
ALTER TABLE public.cartera ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cartera_select ON public.cartera;
DROP POLICY IF EXISTS cartera_update_admin ON public.cartera;
DROP POLICY IF EXISTS cartera_write ON public.cartera;
CREATE POLICY cartera_select ON public.cartera
  FOR SELECT TO authenticated
  USING ((public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())
         AND (public.soy_admin() OR ejecutivo_id::text = public.mi_ejecutivo_id()));
CREATE POLICY cartera_write ON public.cartera
  FOR UPDATE TO authenticated
  USING (public.soy_admin() AND (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant()))
  WITH CHECK (public.soy_admin());

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['metas','focos'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name=t) THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_write', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING ((public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())
             AND (public.soy_admin() OR ejecutivo_id::text = public.mi_ejecutivo_id()))$f$, t||'_select', t);
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING (public.soy_admin()) WITH CHECK (public.soy_admin())$f$, t||'_write', t);
  END LOOP;
END $$;

-- ejecutivos: uno mismo + admin
ALTER TABLE public.ejecutivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ejecutivos_select ON public.ejecutivos;
DROP POLICY IF EXISTS ejecutivos_write  ON public.ejecutivos;
CREATE POLICY ejecutivos_select ON public.ejecutivos
  FOR SELECT TO authenticated
  USING (id::text = auth.uid()::text
         OR (public.soy_admin() AND (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())));
CREATE POLICY ejecutivos_write ON public.ejecutivos
  FOR ALL TO authenticated USING (public.soy_admin()) WITH CHECK (public.soy_admin());

-- ------------------------------------------------------------
-- 3) POLÍTICAS ESTRICTAS · DATOS DE LA EMPRESA
-- ------------------------------------------------------------
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_select ON public.stock;
DROP POLICY IF EXISTS stock_update_admin ON public.stock;
DROP POLICY IF EXISTS stock_write ON public.stock;
CREATE POLICY stock_select ON public.stock
  FOR SELECT TO authenticated
  USING (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant());
CREATE POLICY stock_write ON public.stock
  FOR UPDATE TO authenticated USING (public.soy_admin()) WITH CHECK (public.soy_admin());

ALTER TABLE public.prospectos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospectos_select_authenticated ON public.prospectos;
DROP POLICY IF EXISTS prospectos_update_admin ON public.prospectos;
DROP POLICY IF EXISTS prospectos_select ON public.prospectos;
DROP POLICY IF EXISTS prospectos_write ON public.prospectos;
CREATE POLICY prospectos_select ON public.prospectos
  FOR SELECT TO authenticated USING (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant());
CREATE POLICY prospectos_write ON public.prospectos
  FOR ALL TO authenticated USING (public.soy_admin()) WITH CHECK (public.soy_admin());

ALTER TABLE public.gerencia_clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gerencia_clientes_select ON public.gerencia_clientes;
DROP POLICY IF EXISTS gerencia_clientes_write ON public.gerencia_clientes;
CREATE POLICY gerencia_clientes_select ON public.gerencia_clientes
  FOR SELECT TO authenticated
  USING ((public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant()) AND public.soy_admin());
CREATE POLICY gerencia_clientes_write ON public.gerencia_clientes
  FOR ALL TO authenticated USING (public.soy_admin()) WITH CHECK (public.soy_admin());

-- ------------------------------------------------------------
-- 4) VISITAS · CHECKINS · NOTAS · PEDIDOS · ENCUESTAS · FEEDBACK
-- ------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['visitas','checkins','notas_cliente','pedidos','encuestas_visita','decision_feedback'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='public' AND table_name=t) THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_write', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'df_auth', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'encuestas_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'encuestas_superadmin', t);

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=t AND column_name='ejecutivo_id') THEN
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
        USING ((public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())
               AND (public.soy_admin() OR ejecutivo_id::text = public.mi_ejecutivo_id()))$f$, t||'_select', t);
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
        WITH CHECK (ejecutivo_id IS NULL OR ejecutivo_id::text = public.mi_ejecutivo_id() OR public.soy_admin())$f$, t||'_insert', t);
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
        USING (public.soy_admin() OR ejecutivo_id::text = public.mi_ejecutivo_id())
        WITH CHECK (public.soy_admin() OR ejecutivo_id::text = public.mi_ejecutivo_id())$f$, t||'_update', t);
    ELSE
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
        USING (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())$f$, t||'_select', t);
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
        WITH CHECK (public.soy_admin() OR (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant()))$f$, t||'_insert', t);
      EXECUTE format($f$
        CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
        USING (public.soy_admin() OR (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant()))
        WITH CHECK (public.soy_admin() OR (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant()))$f$, t||'_update', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 5) CATÁLOGO PÚBLICO (35_RLS_CATALOGO, reaplicado)
-- ------------------------------------------------------------
ALTER TABLE public.ofertas_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oc_auth" ON public.ofertas_cliente;
DROP POLICY IF EXISTS oc_select ON public.ofertas_cliente;
DROP POLICY IF EXISTS oc_write  ON public.ofertas_cliente;
CREATE POLICY oc_select ON public.ofertas_cliente
  FOR SELECT TO authenticated
  USING ((public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())
         AND (public.soy_admin() OR ejecutivo_id::text = public.mi_ejecutivo_id()));
CREATE POLICY oc_write ON public.ofertas_cliente
  FOR ALL TO authenticated
  USING (public.soy_admin() AND (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant()))
  WITH CHECK (public.soy_admin());

ALTER TABLE public.oferta_cliente_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oci_auth" ON public.oferta_cliente_items;
DROP POLICY IF EXISTS oci_select ON public.oferta_cliente_items;
DROP POLICY IF EXISTS oci_write  ON public.oferta_cliente_items;
CREATE POLICY oci_select ON public.oferta_cliente_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ofertas_cliente o
    WHERE o.id = oferta_cliente_items.oferta_id
      AND (public.mi_tenant() IS NULL OR o.tenant_id = public.mi_tenant())
      AND (public.soy_admin() OR o.ejecutivo_id::text = public.mi_ejecutivo_id())
  ));
CREATE POLICY oci_write ON public.oferta_cliente_items
  FOR ALL TO authenticated USING (public.soy_admin()) WITH CHECK (public.soy_admin());

-- ------------------------------------------------------------
-- 6) ZONAS_COMUNAS · tabla de referencia
--    Lectura a todo autenticado (no tiene datos sensibles); escritura admin.
-- ------------------------------------------------------------
ALTER TABLE public.zonas_comunas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS zonas_comunas_select ON public.zonas_comunas;
DROP POLICY IF EXISTS zonas_comunas_write  ON public.zonas_comunas;
CREATE POLICY zonas_comunas_select ON public.zonas_comunas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY zonas_comunas_write ON public.zonas_comunas
  FOR ALL TO authenticated USING (public.soy_admin()) WITH CHECK (public.soy_admin());

-- ------------------------------------------------------------
-- 7) VERIFICACIÓN: no debe quedar ninguna política abierta
--    fuera de zonas_comunas (referencia) y de las políticas anon.
-- ------------------------------------------------------------
SELECT
  c.relname AS tabla,
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
  AND c.relname <> 'zonas_comunas'
ORDER BY c.relname, pol.polname;
-- Debe devolver CERO filas.

-- RLS activo en las tablas sensibles
SELECT
  c.relname AS tabla,
  CASE WHEN c.relrowsecurity THEN '✅ RLS activo' ELSE '🔴 RLS APAGADO' END AS estado
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND c.relname IN (
    'cartera','stock','metas','focos','ejecutivos','prospectos',
    'visitas','checkins','notas_cliente','pedidos','ofertas_cliente',
    'oferta_cliente_items','gerencia_clientes','encuestas_visita',
    'decision_feedback'
  )
ORDER BY estado DESC, c.relname;
-- Todo debe salir '✅ RLS activo'.
