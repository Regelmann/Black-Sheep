-- 54 · CIERRE DE POLÍTICAS ABIERTAS QUE 52 NO CUBRÍA
-- Correr DESPUÉS de 52_RLS_POLICIES.sql. Usa DROP POLICY IF EXISTS en
-- todo: es seguro correrlo más de una vez.
--
-- POR QUÉ EXISTE ESTE ARCHIVO
-- 52_RLS_POLICIES.sql crea políticas nuevas (bs_tenant_*, bs_owner_*)
-- pero nunca borra las políticas viejas `using(true)` que quedaron con
-- OTRO nombre en archivos anteriores (08, 13, 14, 15, 19/20, 17).
--
-- En Postgres las políticas RLS del mismo comando (SELECT/UPDATE/...)
-- se combinan con OR. Si la vieja `using(true)` sigue existiendo junto
-- a la nueva `bs_tenant_select`, la nueva no protege nada: cualquier
-- fila pasa por la vieja igual. 99_SECURITY_DIAGNOSTICS.sql (bloque 2)
-- ya detecta estas políticas — este archivo es el que las cierra.
--
-- Antes de correr en producción: `sql/00_VERIFICAR_ESTADO.sql` y el
-- diagnóstico de 99, como con cualquier cambio de este directorio.

-- ═══ 1 · decision_feedback nunca tuvo tenant_id ═════════════════════
-- No estaba en el array de 50_FUNDACION_MULTITENANT.sql ni en el de
-- 52_RLS_POLICIES.sql, así que "df_auth using(true)" no se sustituía
-- por nada — quedaba como única política, abierta a cualquier tenant.
-- Mismo patrón de 50: default 'keyfoods' para no romper filas ya
-- existentes.
ALTER TABLE public.decision_feedback
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'keyfoods';

CREATE INDEX IF NOT EXISTS idx_decision_feedback_tenant
  ON public.decision_feedback (tenant_id);

ALTER TABLE public.decision_feedback ENABLE ROW LEVEL SECURITY;

-- decision_feedback tiene ejecutivo_id: mismo criterio de "ownership"
-- que cartera/prospectos/checkins/metas/focos en 52 (gerencia ve todo
-- el tenant, el vendedor sólo lo suyo).
DROP POLICY IF EXISTS bs_owner_select ON public.decision_feedback;
CREATE POLICY bs_owner_select ON public.decision_feedback
  FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
      (SELECT public.is_tenant_admin())
      OR ejecutivo_id::text = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS bs_tenant_insert ON public.decision_feedback;
CREATE POLICY bs_tenant_insert ON public.decision_feedback
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

DROP POLICY IF EXISTS bs_owner_update ON public.decision_feedback;
CREATE POLICY bs_owner_update ON public.decision_feedback
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
      (SELECT public.is_tenant_admin())
      OR ejecutivo_id::text = auth.uid()::text
    )
  )
  WITH CHECK (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
      (SELECT public.is_tenant_admin())
      OR ejecutivo_id::text = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS bs_owner_delete ON public.decision_feedback;
CREATE POLICY bs_owner_delete ON public.decision_feedback
  FOR DELETE TO authenticated
  USING (
    tenant_id = (SELECT public.current_tenant_id())
    AND (
      (SELECT public.is_tenant_admin())
      OR ejecutivo_id::text = auth.uid()::text
    )
  );

-- ═══ 2 · Borrar las políticas viejas using(true) ════════════════════
-- Cada una queda comentada con el archivo de origen para poder
-- rastrearla si algo se rompe.

-- 08_PROSPECTOS_RLS.sql
DROP POLICY IF EXISTS prospectos_select_authenticated ON public.prospectos;
DROP POLICY IF EXISTS gerencia_clientes_select ON public.gerencia_clientes;

-- 13_ADMIN_PANEL.sql / 14_ADMIN_CONTROL.sql (mismos nombres en ambos)
DROP POLICY IF EXISTS zonas_comunas_select ON public.zonas_comunas;
DROP POLICY IF EXISTS zonas_comunas_write ON public.zonas_comunas;
DROP POLICY IF EXISTS cartera_update_admin ON public.cartera;
DROP POLICY IF EXISTS stock_update_admin ON public.stock;
DROP POLICY IF EXISTS prospectos_update_admin ON public.prospectos;
DROP POLICY IF EXISTS metas_select ON public.metas;
DROP POLICY IF EXISTS metas_write ON public.metas;
DROP POLICY IF EXISTS focos_select ON public.focos;
DROP POLICY IF EXISTS focos_write ON public.focos;

-- 15_CICLO_PEDIDO_V29.sql
DROP POLICY IF EXISTS ejecutivos_select ON public.ejecutivos;
DROP POLICY IF EXISTS ejecutivos_write ON public.ejecutivos;

-- 19_CATALOGO_OFERTA_CLIENTE.sql / 20_CATALOGO_CANONICO.sql (mismos
-- nombres en ambos). OJO: NO se tocan oc_public_read / oci_public_read
-- — esas son la excepción deliberada del catálogo público por token
-- (rol anon, scoped a activo=true / a la oferta padre) que
-- 52_RLS_POLICIES.sql pide explícitamente no tratar como using(true)
-- global.
DROP POLICY IF EXISTS oc_auth ON public.ofertas_cliente;
DROP POLICY IF EXISTS oci_auth ON public.oferta_cliente_items;

-- ═══ 3 · Verificación ════════════════════════════════════════════════
-- Debe devolver CERO filas. Si devuelve alguna, hay una política
-- using(true)/with_check(true) que este archivo no contempló.
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    lower(COALESCE(qual, '')) IN ('true', '(true)')
    OR lower(COALESCE(with_check, '')) IN ('true', '(true)')
  )
ORDER BY tablename, policyname;
