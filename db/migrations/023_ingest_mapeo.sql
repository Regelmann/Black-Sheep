-- ═══════════════════════════════════════════════════════════════════
-- 023 · NORMALIZACIÓN DE COLUMNAS
--
-- El ERP de cada empresa nombra las columnas a su manera: CODIGO,
-- Código, SKU, COD, "Código Producto". El contrato ya sabe cuáles son
-- equivalentes; acá eso deja de ser un diccionario en Python y pasa a
-- ser una tabla, editable por empresa sin tocar código.
--
-- Alias globales (tenant_id NULL) + alias propios de la empresa. Gana
-- el propio: si una distribuidora llama "ARTICULO" a su SKU, se agrega
-- una fila y listo.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ingest.mapeo_columna (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  UUID REFERENCES platform.tenants(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL CHECK (tipo IN ('precios','stock','maestra','ventas','costos')),
  canonica   TEXT NOT NULL,
  alias_norm TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_mapeo_global
  ON ingest.mapeo_columna (tipo, alias_norm) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mapeo_tenant
  ON ingest.mapeo_columna (tenant_id, tipo, alias_norm) WHERE tenant_id IS NOT NULL;

-- Misma normalización para el alias guardado y para la columna que
-- llega del Excel. Si difieren, no cruza nada y todo sale NULL.
CREATE OR REPLACE FUNCTION ingest.norm_texto(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  SELECT regexp_replace(
           upper(translate(coalesce(p,''),
                 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
           '[^A-Z0-9]', '', 'g');
$$;

COMMENT ON FUNCTION ingest.norm_texto(TEXT) IS
  'Quita tildes, espacios, puntos y guiones bajos: "Código Producto",
   "CODIGO_PRODUCTO" y "codigo producto" colapsan al mismo valor.';

-- ─── Alias del contrato v3 ─────────────────────────────────────────
INSERT INTO ingest.mapeo_columna (tenant_id, tipo, canonica, alias_norm)
SELECT NULL, t.tipo, t.canonica, ingest.norm_texto(a)
  FROM (VALUES
    ('precios','sku',            ARRAY['sku','Código','CODIGO','Codigo','COD','Código Producto','CODIGO SKU']),
    ('precios','nombre',         ARRAY['nombre','Descripcion','Descripción','DESCRIPCION','Producto','NOMBRE']),
    ('precios','precio_unidad',  ARRAY['precio_unidad','Precio Unidad','PRECIO UNIDAD','Precio Un','P.Unidad']),
    ('precios','precio_caja',    ARRAY['precio_caja','Precio Caja','PRECIO CAJA','P.Caja']),
    ('precios','precio_kilo',    ARRAY['precio_kilo','Precio Kilo','PRECIO KILO']),
    ('precios','categoria',      ARRAY['categoria','Categoría','Categoria','CATEGORIA','Familia']),
    ('precios','marca',          ARRAY['marca','Marca','MARCA']),
    ('precios','unidad_venta',   ARRAY['unidad_venta','Unidad de Venta','UNIDAD','Unidad']),
    ('precios','unidades_caja',  ARRAY['unidades_caja','Unidades por Caja','UN x CAJA']),
    ('precios','kg_unidad',      ARRAY['kg_unidad','Kilogramos por Unidad','KG x UN']),
    ('precios','kg_caja',        ARRAY['kg_caja','Kilogramos por Caja','KG x CAJA']),

    ('stock','sku',              ARRAY['sku','CODIGO','Código','SKU','CODIGO SKU KL','COD']),
    ('stock','stock_total',      ARRAY['stock_total','STOCK','STOCK TOTAL','STOCK KG','KILOS','TOTAL','Stock']),
    ('stock','nombre',           ARRAY['nombre','DESCRIPCION','DESCRIPCION KL','Descripcion']),
    ('stock','familia',          ARRAY['familia','FAMILIA','Familia','CATEGORIA']),
    ('stock','almacen',          ARRAY['almacen','ALMACEN','Almacen','BODEGA']),
    ('stock','stock_cajas',      ARRAY['stock_cajas','STOCK CAJAS','STOCKS CAJAS']),
    ('stock','fecha_venc',       ARRAY['fecha_venc','VENCIMIENTO','FECHA VENC','F.VENC']),

    ('maestra','cliente_key',    ARRAY['cliente_key','rut','RUT','COD CLIENTE','CODIGO_CLIENTE','Codigo']),
    ('maestra','ejecutivo',      ARRAY['ejecutivo','EJECUTIVO','Ejecutivo','VENDEDOR','ejecutivo_raw']),
    ('maestra','zona',           ARRAY['zona','ZONA','CANAL','Canal','zona_comercial']),
    ('maestra','nombre',         ARRAY['nombre','RAZON SOCIAL','NOMBRE','Cliente','nombre_cliente']),
    ('maestra','comuna',         ARRAY['comuna','COMUNA','Comuna']),
    ('maestra','direccion',      ARRAY['direccion','DIRECCION','DOMICILIO','Direccion']),
    ('maestra','lat',            ARRAY['lat','LATITUD','latitud']),
    ('maestra','lng',            ARRAY['lng','LONGITUD','longitud']),
    ('maestra','rubro',          ARRAY['rubro','RUBRO','GIRO','Giro']),
    ('maestra','es_bloqueado',   ARRAY['es_bloqueado','BLOQUEADO','DEUDA']),

    ('ventas','cliente_key',     ARRAY['cliente_key','COD CLIENTE','CODIGO_CLIENTE','RUT','rut','Cliente']),
    ('ventas','fecha',           ARRAY['fecha','FECHA','Fecha','fecha_emision','F.EMISION']),
    ('ventas','sku',             ARRAY['sku','CODIGO','SKU','CODIGO_PRODUCTO','Codigo']),
    ('ventas','monto',           ARRAY['monto','NETO','PRECIO','MONTO','VENTA_NETA','Total']),
    ('ventas','cantidad',        ARRAY['cantidad','CANTIDAD','Cantidad','CANT','UNIDADES']),
    ('ventas','tipo_doc',        ARRAY['tipo_doc','TIPO','TIPO_DOC','TIPO DOCUMENTO','Tipo Doc']),
    ('ventas','documento',       ARRAY['documento','NUMERO','N_DOCUMENTO','FOLIO','Documento']),
    ('ventas','estado_pedido',   ARRAY['estado_pedido','ESTADO','ESTADO_PEDIDO','Estado Pedido']),
    ('ventas','costo_unitario',  ARRAY['costo_unitario','COSTO','COSTO UNITARIO','COSTO_UNIT']),
    ('ventas','producto',        ARRAY['producto','DESCRIPCION','PRODUCTO','Descripcion']),
    ('ventas','nombre',          ARRAY['nombre','RAZON SOCIAL','NOMBRE','Cliente']),
    ('ventas','comuna',          ARRAY['comuna','COMUNA']),
    ('ventas','direccion',       ARRAY['direccion','DIRECCION','DOMICILIO']),
    ('ventas','vendedor_origen', ARRAY['vendedor_origen','EJECUTIVO','VENDEDOR']),

    ('costos','sku',             ARRAY['sku','CODIGO','SKU']),
    ('costos','costo_unitario',  ARRAY['costo_unitario','COSTO','COSTO UNITARIO']),
    ('costos','vigente_desde',   ARRAY['vigente_desde','VIGENCIA','DESDE'])
  ) AS t(tipo, canonica, aliases)
  CROSS JOIN LATERAL unnest(t.aliases) AS a
ON CONFLICT DO NOTHING;

-- ─── Traducir una fila cruda a nombres canónicos ───────────────────
CREATE OR REPLACE FUNCTION ingest.normalizar(
  p_tenant UUID, p_tipo TEXT, p_datos JSONB
) RETURNS JSONB
LANGUAGE sql STABLE SET search_path = pg_catalog, ingest AS $$
  SELECT COALESCE(jsonb_object_agg(m.canonica, d.value), '{}'::jsonb)
    FROM jsonb_each_text(p_datos) AS d(key, value)
    JOIN LATERAL (
      SELECT mc.canonica
        FROM ingest.mapeo_columna mc
       WHERE mc.tipo = p_tipo
         AND mc.alias_norm = ingest.norm_texto(d.key)
         AND (mc.tenant_id = p_tenant OR mc.tenant_id IS NULL)
       ORDER BY mc.tenant_id NULLS LAST      -- el alias propio gana
       LIMIT 1
    ) m ON true
   WHERE NULLIF(trim(d.value), '') IS NOT NULL;
$$;

COMMENT ON FUNCTION ingest.normalizar(UUID, TEXT, JSONB) IS
  'Una columna que el contrato no conoce se DESCARTA en silencio a
   propósito: el cliente puede agregar columnas propias y no rompe
   nada. Lo que no puede faltar son las obligatorias, y eso lo revisa
   la validación, no esta función.';

ALTER TABLE ingest.mapeo_columna ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.mapeo_columna FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_lectura   ON ingest.mapeo_columna;
DROP POLICY IF EXISTS tenant_escritura ON ingest.mapeo_columna;
DROP POLICY IF EXISTS mapeo_acceso     ON ingest.mapeo_columna;
CREATE POLICY mapeo_acceso ON ingest.mapeo_columna FOR ALL
  USING      (tenant_id IS NULL OR platform.tiene_acceso(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND platform.tiene_acceso(tenant_id));

GRANT SELECT ON ingest.mapeo_columna TO authenticated;
GRANT EXECUTE ON FUNCTION ingest.normalizar(UUID, TEXT, JSONB),
                          ingest.norm_texto(TEXT) TO authenticated;
