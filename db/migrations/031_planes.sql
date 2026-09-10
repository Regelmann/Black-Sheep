-- ═══════════════════════════════════════════════════════════════════
-- 031 · PLANES · el paquete que se vende
--
-- Hasta acá las capacidades se prendían una por una a mano. Con dos
-- empresas se puede; con veinte es una hoja de cálculo paralela y
-- alguien termina cobrando un plan que no corresponde a lo activado.
--
-- El plan es el paquete comercial. La capacidad sigue siendo la unidad
-- técnica. Un tenant puede además tener EXCEPCIONES: se le vende un
-- módulo suelto sin cambiarle el plan, o se le quita algo que no usa.
--
-- ORDEN DE RESOLUCIÓN
--   1. Excepción del tenant (platform.tenant_capacidad)
--   2. Lo que trae su plan
--   3. Apagada
--
-- Ojo con el 3: si una capacidad no está en el plan y no hay excepción,
-- queda APAGADA. Antes el respaldo era "activa_por_defecto", y eso
-- significaba regalar módulos sin decidirlo.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform.plan (
  codigo         TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  descripcion    TEXT,
  precio_mensual NUMERIC CHECK (precio_mensual IS NULL OR precio_mensual >= 0),
  moneda         TEXT NOT NULL DEFAULT 'CLP',
  orden          SMALLINT NOT NULL DEFAULT 0,
  activo         BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE platform.plan IS
  'El empaquetado es una decisión COMERCIAL, no técnica: estos dos
   planes son un punto de partida razonable, no una verdad. Cambiar
   qué incluye cada uno es un UPDATE, no un despliegue.';

INSERT INTO platform.plan (codigo, nombre, descripcion, precio_mensual, orden) VALUES
 ('terreno', 'Terreno',
  'La fuerza de venta en la calle: cartera, ruta, pedidos y catálogo para el cliente.',
  NULL, 1),
 ('completo', 'Completo',
  'Todo lo de Terreno más gestión: márgenes, focos por producto y prospectos.',
  NULL, 2)
ON CONFLICT (codigo) DO UPDATE
  SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden;

CREATE TABLE IF NOT EXISTS platform.plan_capacidad (
  plan      TEXT NOT NULL REFERENCES platform.plan(codigo) ON DELETE CASCADE,
  capacidad TEXT NOT NULL REFERENCES platform.capacidad(codigo) ON DELETE CASCADE,
  PRIMARY KEY (plan, capacidad)
);

-- Terreno: lo que necesita un vendedor para trabajar.
INSERT INTO platform.plan_capacidad (plan, capacidad)
SELECT 'terreno', c FROM unnest(ARRAY[
  'venta_por_sku','metas_ejecutivo','rutas_gps','checkin_gps',
  'catalogo_publico','stock_disponible'
]) c
ON CONFLICT DO NOTHING;

-- Completo: agrega lo que mira gerencia.
INSERT INTO platform.plan_capacidad (plan, capacidad)
SELECT 'completo', c FROM unnest(ARRAY[
  'venta_por_sku','metas_ejecutivo','rutas_gps','checkin_gps',
  'catalogo_publico','stock_disponible',
  'foco_sku','costos_margen','prospectos','encuestas_visita'
]) c
ON CONFLICT DO NOTHING;

-- ─── Empresas que ya existían con un plan que no está en el catálogo ─
-- Sin esto, una empresa con plan 'base' se queda de golpe SIN NINGUNA
-- capacidad al aplicar esta migración: la app le sigue abriendo pero
-- vacía, y nadie entiende por qué. Se las mueve al plan mínimo y queda
-- anotado en la suscripción para revisarlo.
UPDATE platform.suscripcion s
   SET plan = 'terreno',
       notas = COALESCE(s.notas || ' · ', '') ||
               format('plan "%s" no existía en el catálogo, movida a terreno el %s',
                      s.plan, current_date),
       actualizado_en = now()
 WHERE NOT EXISTS (SELECT 1 FROM platform.plan p WHERE p.codigo = s.plan);

-- ─── La resolución ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.capacidad_activa(p_codigo TEXT, p_tenant UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT COALESCE(
    -- 1 · excepción explícita para esta empresa
    (SELECT tc.activa FROM platform.tenant_capacidad tc
      WHERE tc.tenant_id = COALESCE(p_tenant, platform.tenant_actual())
        AND tc.capacidad = p_codigo),
    -- 2 · lo que trae su plan
    (SELECT TRUE FROM platform.suscripcion s
       JOIN platform.plan_capacidad pc ON pc.plan = s.plan
      WHERE s.tenant_id = COALESCE(p_tenant, platform.tenant_actual())
        AND pc.capacidad = p_codigo),
    -- 3 · apagada
    FALSE
  );
$$;

-- ─── Qué ve la empresa sobre lo suyo ───────────────────────────────
CREATE OR REPLACE VIEW api.mi_plan
WITH (security_invoker = true) AS
SELECT s.tenant_id, p.codigo, p.nombre, p.descripcion, p.precio_mensual,
       s.estado, s.vigente_hasta
  FROM platform.suscripcion s
  JOIN platform.plan p ON p.codigo = s.plan;

GRANT SELECT ON api.mi_plan TO authenticated;
GRANT SELECT ON platform.plan, platform.plan_capacidad TO authenticated;

ALTER TABLE platform.plan           ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.plan           FORCE  ROW LEVEL SECURITY;
ALTER TABLE platform.plan_capacidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.plan_capacidad FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_lectura ON platform.plan;
CREATE POLICY plan_lectura ON platform.plan FOR SELECT USING (true);
DROP POLICY IF EXISTS plan_cap_lectura ON platform.plan_capacidad;
CREATE POLICY plan_cap_lectura ON platform.plan_capacidad FOR SELECT USING (true);

-- ─── Consola: cambiar de plan ──────────────────────────────────────
CREATE OR REPLACE FUNCTION api.admin_cambiar_plan(
  p_tenant UUID, p_plan TEXT, p_limpiar_excepciones BOOLEAN DEFAULT FALSE
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
DECLARE v_n INTEGER := 0;
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM platform.plan WHERE codigo = p_plan AND activo) THEN
    RAISE EXCEPTION 'plan_inexistente' USING ERRCODE = 'P0002';
  END IF;

  -- Las excepciones sobreviven al cambio de plan salvo que se pidan
  -- limpiar. Si alguien le vendió un módulo suelto, subirlo de plan no
  -- puede quitárselo por sorpresa.
  IF p_limpiar_excepciones THEN
    DELETE FROM platform.tenant_capacidad WHERE tenant_id = p_tenant;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  UPDATE platform.suscripcion SET plan = p_plan, actualizado_en = now()
   WHERE tenant_id = p_tenant;

  RETURN format('plan %s%s', p_plan,
                CASE WHEN v_n > 0 THEN format(' · %s excepciones eliminadas', v_n) ELSE '' END);
END $$;

CREATE OR REPLACE FUNCTION api.admin_planes()
RETURNS TABLE (codigo TEXT, nombre TEXT, descripcion TEXT, precio_mensual NUMERIC,
               capacidades TEXT[], empresas BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.codigo, p.nombre, p.descripcion, p.precio_mensual,
         ARRAY(SELECT pc.capacidad FROM platform.plan_capacidad pc
                WHERE pc.plan = p.codigo ORDER BY pc.capacidad),
         (SELECT count(*) FROM platform.suscripcion s WHERE s.plan = p.codigo)
    FROM platform.plan p
   WHERE p.activo
   ORDER BY p.orden;
END $$;

CREATE OR REPLACE FUNCTION api.admin_precio_plan(p_plan TEXT, p_precio NUMERIC)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE platform.plan SET precio_mensual = p_precio WHERE codigo = p_plan;
  -- El precio del plan es la referencia. Lo que se cobra a cada empresa
  -- vive en su suscripción: un cliente antiguo puede quedar con el
  -- precio viejo y eso es una decisión, no un error.
  RETURN 'listo · no cambia lo que ya se le cobra a cada empresa';
END $$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.admin_cambiar_plan(UUID,TEXT,BOOLEAN)',
    'api.admin_planes()',
    'api.admin_precio_plan(TEXT,NUMERIC)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- El alta de empresa ahora exige un plan que exista.
CREATE OR REPLACE FUNCTION api.admin_alta_empresa(
  p_slug TEXT, p_nombre TEXT, p_plan TEXT DEFAULT 'terreno',
  p_dias_trial INTEGER DEFAULT 30, p_color TEXT DEFAULT '#a3e635'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM platform.plan WHERE codigo = p_plan AND activo) THEN
    RAISE EXCEPTION 'plan_inexistente' USING ERRCODE = 'P0002',
      HINT = 'Los planes vigentes salen de api.admin_planes().';
  END IF;

  INSERT INTO platform.tenants (slug, nombre, color)
       VALUES (p_slug, p_nombre, p_color) RETURNING id INTO v_id;
  INSERT INTO platform.suscripcion (tenant_id, plan, estado, vigente_hasta)
       VALUES (v_id, p_plan, 'trial', current_date + p_dias_trial);
  -- Ya no se siembran capacidades una por una: las trae el plan.
  RETURN v_id;
END $$;
