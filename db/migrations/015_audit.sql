-- ═══════════════════════════════════════════════════════════════════
-- 015 · AUDITORÍA
-- Ley 21.719: toda operación sensible deja evidencia.
-- Sirve además para la pregunta más común de soporte: "¿quién cambió esto?"
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform.auditoria (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  UUID,
  actor_id   UUID,
  accion     TEXT NOT NULL,          -- INSERT | UPDATE | DELETE | LOGIN | EXPORT…
  objeto     TEXT NOT NULL,          -- 'core.cliente'
  objeto_id  TEXT,
  antes      JSONB,
  despues    JSONB,
  ip         INET,
  user_agent TEXT,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_auditoria_tenant ON platform.auditoria (tenant_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_auditoria_objeto ON platform.auditoria (objeto, objeto_id);

ALTER TABLE platform.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.auditoria FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auditoria_lectura ON platform.auditoria;
CREATE POLICY auditoria_lectura ON platform.auditoria FOR SELECT
  USING (platform.es_superadmin()
         OR (tenant_id = platform.tenant_actual()
             AND platform.puede('gestionar_usuarios')));

-- La auditoría NO se edita ni se borra: no hay política para UPDATE ni
-- DELETE, así que RLS los rechaza. Una bitácora modificable no es una
-- bitácora.

CREATE OR REPLACE FUNCTION platform.fn_auditar()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
DECLARE v_tenant UUID;
BEGIN
  BEGIN
    v_tenant := COALESCE(
      (to_jsonb(COALESCE(NEW, OLD)) ->> 'tenant_id')::uuid,
      platform.tenant_actual());
  EXCEPTION WHEN others THEN v_tenant := platform.tenant_actual();
  END;

  INSERT INTO platform.auditoria (tenant_id, actor_id, accion, objeto, antes, despues)
  VALUES (v_tenant, platform.usuario_actual(), TG_OP,
          TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
          CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION platform.fn_auditar() FROM PUBLIC;

-- Se audita lo sensible, no todo: auditar venta_linea (millones de
-- filas por carga) sólo hace crecer la base sin aportar nada. El
-- linaje de las ventas ya lo da ingest.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'core.cliente','core.ejecutivo','core.zona','core.zona_comuna',
    'core.meta','core.foco','core.precio','core.tipo_documento',
    'core.estado_excluido','core.catalog_token','core.cliente_contacto',
    'platform.membresias','platform.tenants'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_auditar ON %s', r);
    EXECUTE format(
      'CREATE TRIGGER tg_auditar AFTER INSERT OR UPDATE OR DELETE ON %s
         FOR EACH ROW EXECUTE FUNCTION platform.fn_auditar()', r);
  END LOOP;
END $$;
