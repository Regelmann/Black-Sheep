-- ═══════════════════════════════════════════════════════════════════
-- 009 · CATÁLOGO PARA EL CLIENTE
--
-- D-09 · El token ES una credencial. Se guarda SOLO el hash.
-- En la 15.3 se guardaba en texto plano y se comparaba con
-- `WHERE token = trim(p_token)`: una copia de la base era una copia de
-- todas las credenciales, sin expiración ni revocación.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.oferta_cliente (
  tenant_id   UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  cliente_key TEXT NOT NULL,
  skus        TEXT[] NOT NULL DEFAULT '{}',
  motivo      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- por qué se sugiere (D-12)
  regla_version TEXT,                              -- decisión automatizada
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, cliente_key),
  FOREIGN KEY (tenant_id, cliente_key) REFERENCES core.cliente(tenant_id, cliente_key) ON DELETE CASCADE
);

COMMENT ON COLUMN core.oferta_cliente.activo IS
  'UNA sola columna, y se llama `activo`. En la 15.3 convivieron
   `activo` y `activa` según qué script se hubiera corrido último, y
   eso producía el falso "link inválido o catálogo no disponible".';

CREATE TABLE IF NOT EXISTS core.catalog_token (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  cliente_key   TEXT NOT NULL,
  creado_por    UUID REFERENCES platform.usuarios(id),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en     TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  revocado_en   TIMESTAMPTZ,
  ultimo_acceso TIMESTAMPTZ,
  accesos       BIGINT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, token_hash)
);

CREATE INDEX IF NOT EXISTS ix_catalog_token_vivo
  ON core.catalog_token (token_hash)
  WHERE revocado_en IS NULL;

CREATE TABLE IF NOT EXISTS core.rate_limit (
  bucket_key   TEXT NOT NULL,
  ventana      TIMESTAMPTZ NOT NULL,
  intentos     INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ,
  PRIMARY KEY (bucket_key, ventana)
);
