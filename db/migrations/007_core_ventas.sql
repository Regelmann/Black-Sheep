-- ═══════════════════════════════════════════════════════════════════
-- 007 · VENTAS · el corazón del sistema
--
-- Tres correcciones respecto de la 15.3, todas medidas contra datos
-- reales:
--   D-05  regla de elegibilidad INVERTIDA (la directa dejaba fuera
--         el 97,4% de la venta facturada)
--   D-06  las notas de crédito RESTAN (1.995 líneas sumaban positivo:
--         ~19% de sobreestimación) y una fila con FA y NC produce DOS
--         hechos (458 filas en KeyFoods)
--   §5.2  tipo_doc y estado_pedido son columnas de primer nivel. En la
--         15.3 el ciclo las leía y nunca las escribía: no llegaban.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.venta_linea (
  tenant_id      UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  linea_id       TEXT NOT NULL,
  cliente_key    TEXT NOT NULL,
  fecha          DATE NOT NULL,
  sku            TEXT NOT NULL,
  tipo_doc       TEXT NOT NULL,
  documento      TEXT,
  estado_pedido  TEXT,
  cantidad       NUMERIC NOT NULL,
  monto_neto     NUMERIC NOT NULL,     -- YA viene con signo aplicado (D-06)
  costo_unitario NUMERIC,              -- snapshot si fuente_costo = 'ventas'
  vendedor_origen TEXT,                -- SÓLO auditoría. La maestra manda.
  lote_id        UUID NOT NULL,        -- linaje (D-12)
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, linea_id)
);

COMMENT ON COLUMN core.venta_linea.linea_id IS
  'sha256(tenant|cliente|fecha|tipo_doc|documento|sku|monto).
   INCLUYE tipo_doc: sin eso, la factura y la nota de crédito de la
   misma fila colisionan en la misma llave y una pisa a la otra.';

COMMENT ON COLUMN core.venta_linea.monto_neto IS
  'Neto CON SIGNO. Una NC entra negativa. Sumar esta columna da la
   venta neta directamente, sin que cada consulta tenga que acordarse.';

CREATE INDEX IF NOT EXISTS ix_venta_cliente_fecha
  ON core.venta_linea (tenant_id, cliente_key, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_venta_sku_fecha
  ON core.venta_linea (tenant_id, sku, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_venta_fecha
  ON core.venta_linea (tenant_id, fecha DESC);
CREATE INDEX IF NOT EXISTS ix_venta_lote
  ON core.venta_linea (lote_id);

-- ─── La regla de elegibilidad, en un solo lugar ────────────────────
-- Cualquier consumidor (ETL, app, reporte) la llama. Nadie la
-- reescribe. Si cambia, cambia acá.

CREATE OR REPLACE FUNCTION core.venta_elegible(
  p_tenant   UUID,
  p_tipo_doc TEXT,
  p_estado   TEXT
) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path = pg_catalog, core AS $$
  SELECT EXISTS (
           SELECT 1 FROM core.tipo_documento td
            WHERE td.tenant_id = p_tenant
              AND td.codigo = upper(trim(p_tipo_doc))
              AND td.cuenta_como_venta
         )
     AND NOT EXISTS (
           SELECT 1 FROM core.estado_excluido ee
            WHERE ee.tenant_id = p_tenant
              AND ee.estado = upper(trim(COALESCE(p_estado, '')))
         );
$$;

COMMENT ON FUNCTION core.venta_elegible(UUID, TEXT, TEXT) IS
  'D-05 · INCLUIR todo documento reconocido SALVO estado excluido.
   Un estado vacío NO excluye: en la fuente real viene vacío el 74%
   de las veces y no significa que la venta no exista.';

CREATE OR REPLACE FUNCTION core.signo_documento(p_tenant UUID, p_tipo_doc TEXT)
RETURNS SMALLINT
LANGUAGE sql STABLE SET search_path = pg_catalog, core AS $$
  SELECT COALESCE(
    (SELECT td.signo FROM core.tipo_documento td
      WHERE td.tenant_id = p_tenant AND td.codigo = upper(trim(p_tipo_doc))),
    1::smallint
  );
$$;

-- ─── Metas y focos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.meta (
  tenant_id    UUID NOT NULL,
  ejecutivo_id TEXT NOT NULL,
  mes          DATE NOT NULL,          -- primer día del mes
  monto        NUMERIC NOT NULL CHECK (monto >= 0),
  PRIMARY KEY (tenant_id, ejecutivo_id, mes),
  FOREIGN KEY (tenant_id, ejecutivo_id) REFERENCES core.ejecutivo(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS core.foco (
  tenant_id UUID NOT NULL,
  mes       DATE NOT NULL,
  sku       TEXT NOT NULL,
  zona_id   TEXT NOT NULL DEFAULT '*',   -- '*' = todas las zonas
  meta_unidades NUMERIC,
  PRIMARY KEY (tenant_id, mes, sku, zona_id),
  FOREIGN KEY (tenant_id, sku) REFERENCES core.producto(tenant_id, sku) ON DELETE CASCADE
);


-- ═══════════════════════════════════════════════════════════════════
-- PRECIO POR CLIENTE · lo que de verdad paga cada uno
--
-- LA REGLA DE NEGOCIO
-- La lista de precios dice cuánto vale un producto. El histórico dice
-- cuánto le cobras TÚ a ESE cliente. No son lo mismo: en foodservice
-- casi ningún cliente grande paga lista.
--
-- Si el SKU1 está en $1.000 y a este cliente se lo vendes a $800, su
-- catálogo tiene que decir $800. Mandarle $1.000 es una llamada de
-- reclamo o, peor, una venta perdida.
--
-- ORDEN DE PRECEDENCIA
--   1. Precio acordado a mano (core.precio_cliente) — gerencia lo fijó
--   2. Último precio realmente cobrado (histórico de venta)
--   3. Lista de precios
--
-- El histórico manda sobre la lista, pero no ciegamente: ver la banda
-- de cordura más abajo.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.precio_cliente (
  tenant_id     UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  cliente_key   TEXT NOT NULL,
  sku           TEXT NOT NULL,
  precio_unidad NUMERIC NOT NULL CHECK (precio_unidad >= 0),
  motivo        TEXT,
  vigente_desde DATE NOT NULL DEFAULT current_date,
  vigente_hasta DATE,
  creado_por    UUID REFERENCES platform.usuarios(id),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, cliente_key, sku, vigente_desde),
  FOREIGN KEY (tenant_id, cliente_key) REFERENCES core.cliente(tenant_id, cliente_key) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, sku)         REFERENCES core.producto(tenant_id, sku) ON DELETE CASCADE
);

COMMENT ON TABLE core.precio_cliente IS
  'Precio ACORDADO con un cliente. Gana sobre el histórico y sobre la
   lista. Se fija desde el dashboard, con motivo y con vigencia: un
   precio especial que nadie recuerda por qué existe termina siendo un
   margen perdido que nadie puede explicar.';

CREATE INDEX IF NOT EXISTS ix_precio_cliente_vigente
  ON core.precio_cliente (tenant_id, cliente_key, sku)
  WHERE vigente_hasta IS NULL;

-- ─── Último precio realmente cobrado ───────────────────────────────
CREATE OR REPLACE FUNCTION core.precio_historico(
  p_tenant UUID, p_cliente_key TEXT, p_sku TEXT, p_meses INTEGER DEFAULT 6
) RETURNS NUMERIC
LANGUAGE sql STABLE SET search_path = pg_catalog, core AS $$
  SELECT round(v.monto_neto / NULLIF(v.cantidad, 0))
    FROM core.venta_linea v
   WHERE v.tenant_id = p_tenant
     AND v.cliente_key = p_cliente_key
     AND v.sku = p_sku
     AND v.cantidad > 0
     -- Sólo documentos que SUMAN. Una nota de crédito tiene monto
     -- negativo: dividirla por la cantidad da un precio negativo.
     AND v.monto_neto > 0
     AND v.fecha >= (current_date - (p_meses || ' months')::interval)
   ORDER BY v.fecha DESC, v.creado_en DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION core.precio_historico(UUID, TEXT, TEXT, INTEGER) IS
  'El ÚLTIMO precio unitario cobrado, no el promedio. Un promedio de seis
   meses arrastra el precio viejo y subestima una subida reciente.';

-- ─── El precio efectivo ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.precio_para_cliente(
  p_tenant UUID, p_cliente_key TEXT, p_sku TEXT
) RETURNS TABLE (precio NUMERIC, origen TEXT, precio_lista NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, core AS $$
DECLARE v_lista NUMERIC; v_acordado NUMERIC; v_hist NUMERIC;
BEGIN
  SELECT COALESCE(p.precio_unidad, p.precio_caja, p.precio_kilo)
    INTO v_lista
    FROM core.precio p
   WHERE p.tenant_id = p_tenant AND p.sku = p_sku
     AND p.vigente_desde <= current_date
   ORDER BY p.vigente_desde DESC
   LIMIT 1;

  -- 1 · Acordado a mano
  SELECT pc.precio_unidad INTO v_acordado
    FROM core.precio_cliente pc
   WHERE pc.tenant_id = p_tenant AND pc.cliente_key = p_cliente_key
     AND pc.sku = p_sku
     AND pc.vigente_desde <= current_date
     AND (pc.vigente_hasta IS NULL OR pc.vigente_hasta >= current_date)
   ORDER BY pc.vigente_desde DESC
   LIMIT 1;

  IF v_acordado IS NOT NULL THEN
    RETURN QUERY SELECT v_acordado, 'acordado'::text, v_lista; RETURN;
  END IF;

  -- 2 · Histórico, con BANDA DE CORDURA.
  -- Un precio histórico que sale del 40%–160% de la lista casi siempre
  -- es un dato malo: una unidad de medida distinta, un combo cargado
  -- como una línea, una promoción de liquidación. Aplicarlo al catálogo
  -- sería propagar el error al cliente. Se cae a lista y el caso queda
  -- visible en api.integridad.
  v_hist := core.precio_historico(p_tenant, p_cliente_key, p_sku);
  IF v_hist IS NOT NULL AND v_lista IS NOT NULL
     AND v_hist BETWEEN v_lista * 0.4 AND v_lista * 1.6 THEN
    RETURN QUERY SELECT v_hist, 'historico'::text, v_lista; RETURN;
  END IF;
  IF v_hist IS NOT NULL AND v_lista IS NULL THEN
    RETURN QUERY SELECT v_hist, 'historico'::text, NULL::numeric; RETURN;
  END IF;

  -- 3 · Lista
  RETURN QUERY SELECT v_lista, 'lista'::text, v_lista;
END $$;

COMMENT ON FUNCTION core.precio_para_cliente(UUID, TEXT, TEXT) IS
  'UN solo lugar decide qué paga un cliente. Lo usan el catálogo, el
   pedido del vendedor y el pedido público. Si estuviera duplicado, el
   catálogo diría $800 y el pedido cobraría $1.000.';
