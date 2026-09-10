-- ═══════════════════════════════════════════════════════════════════
-- 005 · CLIENTES
--
-- Privacidad por diseño (Ley 21.719): los datos de la EMPRESA y los
-- datos PERSONALES de sus contactos viven en tablas separadas, con
-- permisos separados. `cliente` no contiene datos personales salvo el
-- caso de persona natural, que va marcado.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.cliente (
  tenant_id      UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  cliente_key    TEXT NOT NULL,                -- RUT normalizado u otra llave
  nombre         TEXT,
  comuna         TEXT,
  direccion      TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  rubro          TEXT,
  zona_id        TEXT,
  ejecutivo_id   TEXT,
  es_persona_natural BOOLEAN NOT NULL DEFAULT FALSE,
  es_bloqueado   BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_bloqueo TEXT,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  lote_id        UUID,                          -- linaje (D-12)
  -- Procedencia (026): qué campos se editaron a mano y de dónde salió
  -- la fila. Sin esto, la próxima carga de la maestra pisa cualquier
  -- corrección hecha desde el dashboard.
  campos_manuales TEXT[] NOT NULL DEFAULT '{}',
  origen         TEXT NOT NULL DEFAULT 'archivo'
                 CHECK (origen IN ('archivo','dashboard','terreno')),
  es_prospecto   BOOLEAN NOT NULL DEFAULT FALSE,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, cliente_key),
  FOREIGN KEY (tenant_id, zona_id)      REFERENCES core.zona(tenant_id, id),
  FOREIGN KEY (tenant_id, ejecutivo_id) REFERENCES core.ejecutivo(tenant_id, id)
);

COMMENT ON COLUMN core.cliente.es_persona_natural IS
  'Marca de dato personal. Si es TRUE, cliente_key (RUT) y nombre son
   datos personales y quedan sujetos a retención y derechos ARCOP.';

COMMENT ON COLUMN core.cliente.ejecutivo_id IS
  'LA MAESTRA MANDA. Sale del archivo maestra, nunca del vendedor de
   la factura (que puede decir literalmente SEGUN_MAESTRA).';

CREATE INDEX IF NOT EXISTS ix_cliente_ejecutivo
  ON core.cliente (tenant_id, ejecutivo_id) WHERE activo;
CREATE INDEX IF NOT EXISTS ix_cliente_zona
  ON core.cliente (tenant_id, zona_id) WHERE activo;
CREATE INDEX IF NOT EXISTS ix_cliente_nombre_trgm
  ON core.cliente USING gin (nombre gin_trgm_ops);

-- ─── Datos personales, aparte ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.cliente_contacto (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  cliente_key  TEXT NOT NULL,
  nombre       TEXT,
  cargo        TEXT,
  telefono     TEXT,
  email        TEXT,
  anonimizado_en TIMESTAMPTZ,                  -- retención (018)
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, cliente_key)
    REFERENCES core.cliente(tenant_id, cliente_key) ON DELETE CASCADE
);

COMMENT ON TABLE core.cliente_contacto IS
  'DATOS PERSONALES. Requiere permiso ver_contacto. Sujeto a derechos
   ARCOP y a política de retención. Nunca se expone en el catálogo.';

CREATE INDEX IF NOT EXISTS ix_contacto_cliente
  ON core.cliente_contacto (tenant_id, cliente_key)
  WHERE anonimizado_en IS NULL;
