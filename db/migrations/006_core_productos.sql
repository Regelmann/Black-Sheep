-- ═══════════════════════════════════════════════════════════════════
-- 006 · PRODUCTOS, PRECIOS, COSTOS Y STOCK
--
-- Los tres archivos se cruzan por SKU:
--   precios → QUÉ SE VENDE (base del catálogo)
--   stock   → SI HAY       (disponibilidad, NO catálogo)
--   costo   → cuánto deja  (fuente declarada en tenants.config)
-- Un SKU con stock y sin precio es operativo, no vendible.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.producto (
  tenant_id     UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  sku           TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  categoria     TEXT,
  familia       TEXT,
  marca         TEXT,
  unidad_venta  TEXT,
  unidades_caja NUMERIC,
  kg_unidad     NUMERIC,
  kg_caja       NUMERIC,
  imagen_url    TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  lote_id       UUID,
  campos_manuales TEXT[] NOT NULL DEFAULT '{}',      -- ver 026
  origen        TEXT NOT NULL DEFAULT 'archivo'
                CHECK (origen IN ('archivo','dashboard')),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, sku)
);

CREATE INDEX IF NOT EXISTS ix_producto_nombre_trgm
  ON core.producto USING gin (nombre gin_trgm_ops);

CREATE TABLE IF NOT EXISTS core.precio (
  tenant_id     UUID NOT NULL,
  sku           TEXT NOT NULL,
  lista         TEXT NOT NULL DEFAULT 'general',
  precio_unidad NUMERIC CHECK (precio_unidad IS NULL OR precio_unidad >= 0),
  precio_caja   NUMERIC CHECK (precio_caja   IS NULL OR precio_caja   >= 0),
  precio_kilo   NUMERIC CHECK (precio_kilo   IS NULL OR precio_kilo   >= 0),
  vigente_desde DATE NOT NULL DEFAULT current_date,
  lote_id       UUID,
  origen        TEXT NOT NULL DEFAULT 'archivo'
                CHECK (origen IN ('archivo','dashboard')),
  PRIMARY KEY (tenant_id, sku, lista, vigente_desde),
  FOREIGN KEY (tenant_id, sku) REFERENCES core.producto(tenant_id, sku) ON DELETE CASCADE,
  CONSTRAINT precio_al_menos_uno
    CHECK (COALESCE(precio_unidad, precio_caja, precio_kilo) IS NOT NULL)
);

COMMENT ON TABLE core.precio IS
  'Historizado por vigente_desde: el precio de hoy no reescribe el que
   se usó en una venta de marzo. El catálogo lee el vigente.';

CREATE TABLE IF NOT EXISTS core.costo (
  tenant_id      UUID NOT NULL,
  sku            TEXT NOT NULL,
  costo_unitario NUMERIC NOT NULL CHECK (costo_unitario >= 0),
  vigente_desde  DATE NOT NULL DEFAULT current_date,
  origen         TEXT NOT NULL DEFAULT 'lista'
                 CHECK (origen IN ('ventas','lista')),
  lote_id        UUID,
  PRIMARY KEY (tenant_id, sku, vigente_desde),
  FOREIGN KEY (tenant_id, sku) REFERENCES core.producto(tenant_id, sku) ON DELETE CASCADE
);

COMMENT ON TABLE core.costo IS
  'D-04 · El costo puede venir en la línea de venta o en una lista
   aparte. tenants.config->>fuente_costo declara cuál. Si es "ninguno",
   margen y ventas-bajo-costo se muestran como NO DISPONIBLE en el
   dashboard: nunca como cero, que se lee como un dato real.';

CREATE TABLE IF NOT EXISTS core.stock (
  tenant_id      UUID NOT NULL,
  sku            TEXT NOT NULL,
  almacen        TEXT NOT NULL DEFAULT 'principal',
  stock_total    NUMERIC NOT NULL DEFAULT 0,
  stock_cajas    NUMERIC,
  fecha_venc     DATE,
  es_foco_mes    BOOLEAN NOT NULL DEFAULT FALSE,
  lote_id        UUID,
  campos_manuales TEXT[] NOT NULL DEFAULT '{}',
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, sku, almacen),
  FOREIGN KEY (tenant_id, sku) REFERENCES core.producto(tenant_id, sku) ON DELETE CASCADE
);
