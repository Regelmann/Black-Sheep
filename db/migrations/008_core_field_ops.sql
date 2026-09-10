-- ═══════════════════════════════════════════════════════════════════
-- 008 · OPERACIÓN EN TERRENO
--
-- D-13 · Todo lo que nace en el teléfono lleva client_op_id (UUID
-- generado en el dispositivo). El servidor hace ON CONFLICT DO NOTHING.
-- Reintentar diez veces produce UN registro. Sin esto, el vendedor no
-- se atreve a tocar "Reintentar" y vuelve al cuaderno.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.visita (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  client_op_id  UUID NOT NULL,
  cliente_key   TEXT NOT NULL,
  ejecutivo_id  TEXT NOT NULL,
  fecha         DATE NOT NULL DEFAULT current_date,
  estado        TEXT NOT NULL DEFAULT 'planificada'
                CHECK (estado IN ('planificada','visitada','omitida')),
  resultado     TEXT,
  orden         INTEGER,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_op_id),
  FOREIGN KEY (tenant_id, cliente_key)  REFERENCES core.cliente(tenant_id, cliente_key),
  FOREIGN KEY (tenant_id, ejecutivo_id) REFERENCES core.ejecutivo(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS core.checkin (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  client_op_id UUID NOT NULL,
  visita_id    UUID REFERENCES core.visita(id) ON DELETE SET NULL,
  cliente_key  TEXT NOT NULL,
  ejecutivo_id TEXT NOT NULL,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  precision_m  NUMERIC,
  distancia_m  NUMERIC,
  verificado   BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_op_id)
);

COMMENT ON TABLE core.checkin IS
  'DATO PERSONAL: la posición GPS de un ejecutivo es dato de una
   persona natural identificada. Retención acotada (018) y finalidad
   declarada en compliance.processing_activities.';

CREATE TABLE IF NOT EXISTS core.nota_cliente (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  client_op_id UUID NOT NULL,
  cliente_key  TEXT NOT NULL,
  ejecutivo_id TEXT NOT NULL,
  texto        TEXT NOT NULL,
  anonimizado_en TIMESTAMPTZ,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_op_id)
);

COMMENT ON TABLE core.nota_cliente IS
  'Texto libre escrito por una persona sobre otra persona: se trata
   como dato personal aunque el cliente sea empresa.';

CREATE TABLE IF NOT EXISTS core.pedido (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  client_op_id   UUID NOT NULL,
  cliente_key    TEXT NOT NULL,
  ejecutivo_id   TEXT,
  origen         TEXT NOT NULL DEFAULT 'app'
                 CHECK (origen IN ('app','catalogo_publico','portal')),
  estado         TEXT NOT NULL DEFAULT 'recibido'
                 CHECK (estado IN ('recibido','confirmado','despachado','anulado')),
  lineas         JSONB NOT NULL,
  nota           TEXT,
  total_estimado NUMERIC NOT NULL DEFAULT 0,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_op_id),
  FOREIGN KEY (tenant_id, cliente_key) REFERENCES core.cliente(tenant_id, cliente_key)
);

COMMENT ON COLUMN core.pedido.total_estimado IS
  'ESTIMADO. El precio se revalida SIEMPRE en el servidor: lo que
   manda el cliente es una intención, no un dato.';

CREATE INDEX IF NOT EXISTS ix_pedido_cliente
  ON core.pedido (tenant_id, cliente_key, creado_en DESC);

CREATE TABLE IF NOT EXISTS core.encuesta_visita (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  client_op_id UUID NOT NULL,
  visita_id    UUID REFERENCES core.visita(id) ON DELETE CASCADE,
  respuestas   JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_op_id)
);
