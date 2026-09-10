-- ═══════════════════════════════════════════════════════════════════
-- 004 · REFERENCIA: ZONAS, COMUNAS Y EJECUTIVOS
--
-- Las zonas son datos, no constantes. Otra distribuidora define las
-- suyas sin tocar código (R5).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.zona (
  tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  id        TEXT NOT NULL,                     -- 'NOR-ORIENTE'
  nombre    TEXT NOT NULL,
  color     TEXT CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$'),
  activo    BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS core.zona_comuna (
  tenant_id UUID NOT NULL,
  comuna    TEXT NOT NULL,                     -- normalizada: sin tilde, mayúscula
  zona_id   TEXT NOT NULL,
  PRIMARY KEY (tenant_id, comuna),
  FOREIGN KEY (tenant_id, zona_id) REFERENCES core.zona(tenant_id, id) ON DELETE CASCADE
);

-- El ejecutivo existe aunque todavía no tenga cuenta: la maestra trae
-- nombres antes de que nadie se registre. `usuario_id` se enlaza después.
CREATE TABLE IF NOT EXISTS core.ejecutivo (
  tenant_id  UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  nombre     TEXT NOT NULL,
  email      TEXT,
  usuario_id UUID REFERENCES platform.usuarios(id) ON DELETE SET NULL,
  zona_id    TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, zona_id) REFERENCES core.zona(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS ix_ejecutivo_usuario
  ON core.ejecutivo (tenant_id, usuario_id) WHERE usuario_id IS NOT NULL;

-- Qué documentos cuentan como venta y con qué signo.
-- D-05 y D-06 dejan de ser constantes del código: son datos por tenant.
CREATE TABLE IF NOT EXISTS core.tipo_documento (
  tenant_id        UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  codigo           TEXT NOT NULL,              -- 'FA', 'NC', 'BE'…
  descripcion      TEXT,
  cuenta_como_venta BOOLEAN NOT NULL DEFAULT TRUE,
  signo            SMALLINT NOT NULL DEFAULT 1 CHECK (signo IN (-1, 1)),
  PRIMARY KEY (tenant_id, codigo)
);

COMMENT ON TABLE core.tipo_documento IS
  'D-05/D-06. Una nota de crédito lleva signo -1. Un documento que no
   está acá NO entra a la venta y queda registrado en ingest.exclusion
   con motivo TIPO_DOC_DESCONOCIDO: no desaparece, se ve.';

-- Estados que anulan una venta, por tenant.
CREATE TABLE IF NOT EXISTS core.estado_excluido (
  tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  estado    TEXT NOT NULL,                     -- 'ANULADO', 'NULO'…
  PRIMARY KEY (tenant_id, estado)
);

COMMENT ON TABLE core.estado_excluido IS
  'D-05 · Regla INVERTIDA. Se incluye todo documento reconocido SALVO
   que su estado esté acá. La regla directa (estado = Cerrado) dejaba
   fuera el 97,4% de la venta facturada porque el campo viene vacío en
   el 74% de las filas.';
