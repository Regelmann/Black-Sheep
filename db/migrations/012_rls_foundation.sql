-- ═══════════════════════════════════════════════════════════════════
-- 012 · RLS FAIL-CLOSED
--
-- D-10 · ENABLE + FORCE en toda tabla con datos.
-- FORCE aplica la política también al DUEÑO de la tabla: sin eso, un
-- proceso que corra como owner cruza el límite entre empresas.
--
-- El filtro por tenant_id en la consulta es una ayuda al planificador.
-- LA BARRERA ES ESTO. Un WHERE olvidado en una consulta nueva, un job
-- de fondo o una consulta ad-hoc no pueden cruzar el límite.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tabla, n.nspname AS esquema, c.relname AS nombre
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname IN ('core','platform','ingest','compliance')
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.tabla);
    EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', r.tabla);
  END LOOP;
END $$;

-- ─── core: acceso por tenant, y el ejecutivo sólo ve lo suyo ───────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tabla, c.relname AS nombre
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id'
     WHERE c.relkind = 'r' AND n.nspname IN ('core','ingest','compliance')
       AND a.attnum > 0 AND NOT a.attisdropped
       -- cliente_contacto queda fuera A PROPÓSITO: lleva política más
       -- estricta abajo. Las políticas se combinan con OR, así que una
       -- permisiva genérica ANULARÍA la exigencia de ver_contacto.
       AND c.oid <> 'core.cliente_contacto'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_lectura  ON %s', r.tabla);
    EXECUTE format('DROP POLICY IF EXISTS tenant_escritura ON %s', r.tabla);
    EXECUTE format($f$
      CREATE POLICY tenant_lectura ON %s
        FOR SELECT USING (platform.tiene_acceso(tenant_id))
    $f$, r.tabla);
    EXECUTE format($f$
      CREATE POLICY tenant_escritura ON %s
        FOR ALL USING (platform.tiene_acceso(tenant_id))
              WITH CHECK (platform.tiene_acceso(tenant_id))
    $f$, r.tabla);
  END LOOP;
END $$;

-- Tablas de ingest sin tenant_id propio: heredan por el lote.
DROP POLICY IF EXISTS lote_lectura ON ingest.fila_cruda;
CREATE POLICY lote_lectura ON ingest.fila_cruda FOR ALL
  USING (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)));

DROP POLICY IF EXISTS lote_lectura ON ingest.fila_norm;
CREATE POLICY lote_lectura ON ingest.fila_norm FOR ALL
  USING (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)));

DROP POLICY IF EXISTS lote_lectura ON ingest.exclusion;
CREATE POLICY lote_lectura ON ingest.exclusion FOR ALL
  USING (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)));

DROP POLICY IF EXISTS lote_lectura ON ingest.reconciliacion;
CREATE POLICY lote_lectura ON ingest.reconciliacion FOR ALL
  USING (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = lote_id AND platform.tiene_acceso(l.tenant_id)));

-- ─── Datos personales: además del tenant, hace falta permiso ───────
DROP POLICY IF EXISTS tenant_lectura     ON core.cliente_contacto;
DROP POLICY IF EXISTS tenant_escritura   ON core.cliente_contacto;
DROP POLICY IF EXISTS contacto_lectura   ON core.cliente_contacto;
DROP POLICY IF EXISTS contacto_escritura ON core.cliente_contacto;
CREATE POLICY contacto_lectura ON core.cliente_contacto FOR SELECT
  USING (platform.tiene_acceso(tenant_id) AND platform.puede('ver_contacto'));
CREATE POLICY contacto_escritura ON core.cliente_contacto FOR ALL
  USING (platform.tiene_acceso(tenant_id) AND platform.puede('ver_contacto'))
  WITH CHECK (platform.tiene_acceso(tenant_id) AND platform.puede('ver_contacto'));

-- ─── platform ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenants_lectura ON platform.tenants;
CREATE POLICY tenants_lectura ON platform.tenants FOR SELECT
  USING (platform.es_superadmin() OR id = platform.tenant_actual());

DROP POLICY IF EXISTS usuarios_propio ON platform.usuarios;
CREATE POLICY usuarios_propio ON platform.usuarios FOR SELECT
  USING (platform.es_superadmin() OR id = platform.usuario_actual());

DROP POLICY IF EXISTS membresias_lectura ON platform.membresias;
CREATE POLICY membresias_lectura ON platform.membresias FOR SELECT
  USING (platform.es_superadmin()
         OR usuario_id = platform.usuario_actual()
         OR (tenant_id = platform.tenant_actual()
             AND platform.puede('gestionar_usuarios')));

DROP POLICY IF EXISTS rol_permiso_lectura ON platform.rol_permiso;
CREATE POLICY rol_permiso_lectura ON platform.rol_permiso FOR SELECT USING (true);

