-- ═══════════════════════════════════════════════════════════════════
-- 021 · CAPACIDADES POR EMPRESA
--
-- No todas las distribuidoras miden lo mismo. Hay quien lleva la venta
-- por SKU y quien sólo mira el total del cliente. Hay quien no tiene
-- costos. Hay quien no usa catálogo público.
--
-- Nada de eso puede ser un `if` en el código: sería un producto
-- distinto por cliente. Son datos.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform.capacidad (
  codigo       TEXT PRIMARY KEY,
  nombre       TEXT NOT NULL,
  descripcion  TEXT NOT NULL,
  requiere     TEXT,                    -- qué archivo/columna necesita
  activa_por_defecto BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO platform.capacidad (codigo, nombre, descripcion, requiere, activa_por_defecto) VALUES
 ('venta_por_sku',    'Venta por producto',
  'Analiza la venta por SKU: mix, focos, venta cruzada, sugerencias por producto. Si está apagada, la empresa sólo ve venta total por cliente.',
  'ventas.sku', TRUE),
 ('foco_sku',         'Focos del mes',
  'Metas de venta por producto y zona.', 'venta_por_sku', TRUE),
 ('metas_ejecutivo',  'Metas por ejecutivo',
  'Meta mensual en pesos por ejecutivo y avance.', NULL, TRUE),
 ('costos_margen',    'Margen y ventas bajo costo',
  'Requiere costo en el archivo de ventas o lista de costos.',
  'ventas.costo_unitario | archivo costos', FALSE),
 ('rutas_gps',        'Ruta y mapa',
  'Ordena la visita por GPS. Requiere comuna o dirección.',
  'maestra.comuna', TRUE),
 ('checkin_gps',      'Check-in con GPS',
  'Verifica la visita por posición. DATO PERSONAL del trabajador: exige finalidad declarada y retención acotada.',
  NULL, TRUE),
 ('catalogo_publico', 'Catálogo para el cliente',
  'Enlace con productos y pedido sin sesión.', 'precios', TRUE),
 ('prospectos',       'Prospectos',
  'Clientes potenciales que no vienen en la maestra.', NULL, TRUE),
 ('stock_disponible', 'Stock',
  'Avisa qué no hay y qué empujar.', 'archivo stock', TRUE),
 ('encuestas_visita', 'Encuestas en visita',
  'Formulario configurable al cerrar una visita.', NULL, FALSE)
ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion,
      requiere = EXCLUDED.requiere;

CREATE TABLE IF NOT EXISTS platform.tenant_capacidad (
  tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  capacidad TEXT NOT NULL REFERENCES platform.capacidad(codigo),
  activa    BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (tenant_id, capacidad)
);

CREATE OR REPLACE FUNCTION platform.capacidad_activa(p_codigo TEXT, p_tenant UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT COALESCE(
    (SELECT tc.activa FROM platform.tenant_capacidad tc
      WHERE tc.tenant_id = COALESCE(p_tenant, platform.tenant_actual())
        AND tc.capacidad = p_codigo),
    (SELECT c.activa_por_defecto FROM platform.capacidad c WHERE c.codigo = p_codigo),
    FALSE                                  -- capacidad desconocida = apagada
  );
$$;

-- Alta de una empresa: se siembran los valores por defecto.
CREATE OR REPLACE FUNCTION platform.sembrar_capacidades(p_tenant UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  INSERT INTO platform.tenant_capacidad (tenant_id, capacidad, activa)
  SELECT p_tenant, c.codigo, c.activa_por_defecto FROM platform.capacidad c
  ON CONFLICT (tenant_id, capacidad) DO NOTHING;
$$;

ALTER TABLE platform.capacidad        ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.capacidad        FORCE  ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_capacidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_capacidad FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS capacidad_lectura ON platform.capacidad;
CREATE POLICY capacidad_lectura ON platform.capacidad FOR SELECT USING (true);

DROP POLICY IF EXISTS tenant_capacidad_lectura ON platform.tenant_capacidad;
CREATE POLICY tenant_capacidad_lectura ON platform.tenant_capacidad FOR SELECT
  USING (platform.es_superadmin() OR tenant_id = platform.tenant_actual());

GRANT SELECT ON platform.capacidad, platform.tenant_capacidad TO authenticated;
REVOKE ALL ON FUNCTION platform.capacidad_activa(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.sembrar_capacidades(UUID)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.capacidad_activa(TEXT, UUID) TO authenticated;
