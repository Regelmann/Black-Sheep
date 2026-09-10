-- ═══════════════════════════════════════════════════════════════════
-- 010 · PLANO DE INGESTA · evidencia y linaje
--
-- D-04 · Lo crudo es inmutable, lo canónico es publicado.
-- Cada cifra del dashboard se puede rastrear hasta la fila del Excel
-- que la produjo. Una fila excluida NO desaparece: queda con motivo.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ingest.archivo (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL CHECK (tipo IN ('precios','stock','maestra','ventas','costos')),
  nombre_original TEXT NOT NULL,
  sha256         TEXT NOT NULL,
  bytes          BIGINT,
  storage_path   TEXT,
  subido_por     UUID REFERENCES platform.usuarios(id),
  subido_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_archivo_hash ON ingest.archivo (tenant_id, sha256);

COMMENT ON COLUMN ingest.archivo.sha256 IS
  'Detecta la recarga del mismo archivo antes de procesarlo. Los dos
   archivos de venta de KeyFoods se solapaban en 99,99%: sin esto, la
   venta se duplica y nadie se entera hasta que el total no cuadra.';

CREATE TABLE IF NOT EXISTS ingest.lote (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  archivo_id      UUID NOT NULL REFERENCES ingest.archivo(id) ON DELETE CASCADE,
  estado          TEXT NOT NULL DEFAULT 'recibido'
                  CHECK (estado IN ('recibido','normalizado','validado','publicado','rechazado')),
  filas_leidas    INTEGER NOT NULL DEFAULT 0,
  filas_validas   INTEGER NOT NULL DEFAULT 0,
  filas_excluidas INTEGER NOT NULL DEFAULT 0,
  motivo_rechazo  TEXT,
  iniciado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  publicado_en    TIMESTAMPTZ,
  publicado_por   UUID REFERENCES platform.usuarios(id)
);

CREATE TABLE IF NOT EXISTS ingest.fila_cruda (
  lote_id  UUID NOT NULL REFERENCES ingest.lote(id) ON DELETE CASCADE,
  nro_fila INTEGER NOT NULL,
  datos    JSONB NOT NULL,
  PRIMARY KEY (lote_id, nro_fila)
);

COMMENT ON TABLE ingest.fila_cruda IS
  'INMUTABLE. Tal cual venía el archivo, sin interpretar. Es la
   evidencia. Nunca se corrige acá: se corrige el origen y se recarga.';

CREATE TABLE IF NOT EXISTS ingest.fila_norm (
  lote_id       UUID NOT NULL REFERENCES ingest.lote(id) ON DELETE CASCADE,
  nro_fila      INTEGER NOT NULL,
  datos         JSONB NOT NULL,
  mapeo_version TEXT NOT NULL DEFAULT 'contrato-v3',
  PRIMARY KEY (lote_id, nro_fila)
);

CREATE TABLE IF NOT EXISTS ingest.exclusion (
  lote_id  UUID NOT NULL REFERENCES ingest.lote(id) ON DELETE CASCADE,
  nro_fila INTEGER NOT NULL,
  regla    TEXT NOT NULL,
  detalle  TEXT,
  PRIMARY KEY (lote_id, nro_fila, regla)
);

COMMENT ON TABLE ingest.exclusion IS
  'Reglas: TIPO_DOC_DESCONOCIDO · ESTADO_EXCLUIDO · CLIENTE_SIN_MAESTRA
   · SKU_SIN_PRECIO · FECHA_FUTURA · DUPLICADO_EN_LOTE · MONTO_INVALIDO.
   Nada se borra en silencio: si falta plata en el reporte, está acá.';

CREATE TABLE IF NOT EXISTS ingest.reconciliacion (
  lote_id          UUID NOT NULL REFERENCES ingest.lote(id) ON DELETE CASCADE,
  metrica          TEXT NOT NULL,
  valor_calculado  NUMERIC NOT NULL,
  valor_oficial    NUMERIC,
  diferencia_pct   NUMERIC,
  aprobado_por     UUID REFERENCES platform.usuarios(id),
  aprobado_en      TIMESTAMPTZ,
  PRIMARY KEY (lote_id, metrica)
);

COMMENT ON TABLE ingest.reconciliacion IS
  'La COMPUERTA. Si la diferencia supera el umbral, el lote queda
   RECHAZADO y no se publica. La app nunca arregla una cifra borrando
   datos: se bloquea, se diagnostica, se corrige el origen y se vuelve
   a correr de forma idempotente.';
