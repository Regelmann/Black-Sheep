-- ============================================================
-- 33_RLS_CATALOGO.sql  ·  v-BS-PLATFORM-V11.1
--
-- Cierra la política abierta del CATÁLOGO PÚBLICO.
--
-- POR QUÉ
-- -------
-- `20_CATALOGO_CANONICO.sql` (la fuente canónica) crea sobre
-- `ofertas_cliente` y `oferta_cliente_items` políticas `FOR ALL TO
-- authenticated` que no filtran nada: cualquier usuario autenticado puede
-- LEER, INSERTAR, ACTUALIZAR y BORRAR las ofertas de TODOS los clientes y
-- de TODOS los tenants (la condición se dejó always-true). Ese hueco lo
-- denuncia el guard (R11) como "política abierta".
--
-- Y `28_RLS_ESTRICTO.sql` NO toca estas tablas, así que el "RLS estricto"
-- las deja abiertas.
--
-- El catálogo es justamente lo que se le COMPARTE al cliente por link:
-- es la tabla más sensible para la fuga entre tenants.
--
-- QUÉ HACE
-- --------
--   · Agrega `tenant_id` a ambas tablas (backfill 'keyfoods').
--   · Reemplaza las políticas `... USING(true)` por aislamiento:
--       · autenticado  → sólo su tenant (SELECT), sólo admin (escritura)
--       · anon         → lectura pública de catálogos activos (se mantiene)
--   · El RPC `get_public_catalogo()` es SECURITY DEFINER: sigue sirviendo
--     el catálogo a `anon` sin importar el RLS de las tablas.
--
-- ORDEN: correr DESPUÉS de 28_RLS_ESTRICTO.sql (usa mi_tenant / soy_admin)
--        y DESPUÉS de 20 (para pisar las políticas viejas).
-- ============================================================

-- ------------------------------------------------------------
-- 0) COLUMNA tenant_id
--    Se agrega sólo a la cabecera `ofertas_cliente`. Los items se aíslan
--    por el padre (via subconsulta), así que no necesitan su propia columna.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='ofertas_cliente') THEN
    ALTER TABLE public.ofertas_cliente ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'keyfoods';
    UPDATE public.ofertas_cliente SET tenant_id = 'keyfoods' WHERE tenant_id IS NULL;
    CREATE INDEX IF NOT EXISTS ofertas_cliente_tenant_idx ON public.ofertas_cliente (tenant_id);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1) RLS · OFERTAS_CLIENTE
-- ------------------------------------------------------------
ALTER TABLE public.ofertas_cliente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oc_auth"         ON public.ofertas_cliente;

-- Lectura: cada ejecutivo ve las ofertas de SU tenant (o las suyas si es
-- un ejecutivo con asignación directa); el admin ve todo su tenant.
CREATE POLICY oc_select ON public.ofertas_cliente
  FOR SELECT TO authenticated
  USING (
    (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant())
    AND (
      public.soy_admin()
      OR ejecutivo_id::text = public.mi_ejecutivo_id()
    )
  );

-- Escritura: sólo admin, y sólo dentro de su tenant.
CREATE POLICY oc_write ON public.ofertas_cliente
  FOR ALL TO authenticated
  USING (public.soy_admin()
         AND (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant()))
  WITH CHECK (public.soy_admin());

-- Lectura pública por token (catálogo compartido al cliente, sin login).
-- Se mantiene; sólo expone ofertas ACTIVAS. No toca `oc_public_read`.
DROP POLICY IF EXISTS "oc_public_read" ON public.ofertas_cliente;
CREATE POLICY "oc_public_read" ON public.ofertas_cliente
  FOR SELECT TO anon USING (activo = true);

-- ------------------------------------------------------------
-- 2) RLS · OFERTA_CLIENTE_ITEMS
--    No tiene tenant_id propio: se aísla por el padre via subconsulta.
-- ------------------------------------------------------------
ALTER TABLE public.oferta_cliente_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oci_auth" ON public.oferta_cliente_items;

CREATE POLICY oci_select ON public.oferta_cliente_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ofertas_cliente o
      WHERE o.id = oferta_cliente_items.oferta_id
        AND (public.mi_tenant() IS NULL OR o.tenant_id = public.mi_tenant())
        AND (public.soy_admin() OR o.ejecutivo_id::text = public.mi_ejecutivo_id())
    )
  );

CREATE POLICY oci_write ON public.oferta_cliente_items
  FOR ALL TO authenticated
  USING (public.soy_admin())
  WITH CHECK (public.soy_admin());

-- Lectura pública filtrada por el padre activo (compatible con 20/22/23).
DROP POLICY IF EXISTS "oci_public_read" ON public.oferta_cliente_items;
CREATE POLICY "oci_public_read" ON public.oferta_cliente_items
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM public.ofertas_cliente o
      WHERE o.id = oferta_cliente_items.oferta_id
        AND o.activo = true
    )
  );

-- ------------------------------------------------------------
-- 3) VERIFICACIÓN — no debe quedar ninguna USING(true) abierta
-- ------------------------------------------------------------
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
  AND c.relname IN ('ofertas_cliente','oferta_cliente_items')
  AND pg_get_expr(pol.polqual, pol.polrelid) = 'true'
  AND pol.polroles::text NOT LIKE '%anon%'
ORDER BY c.relname, pol.polname;
-- Debe devolver CERO filas.

-- El catálogo público sigue funcionando para anon (SECURITY DEFINER):
SELECT
  CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
       THEN '✅ anon puede leer catálogos'
       ELSE '🔴 se rompió el catálogo público' END AS estado
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='get_public_catalogo';
