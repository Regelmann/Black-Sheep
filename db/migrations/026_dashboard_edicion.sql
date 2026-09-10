-- ═══════════════════════════════════════════════════════════════════
-- 026 · EDICIÓN DESDE EL DASHBOARD
--
-- EL PROBLEMA QUE RESUELVE ESTE ARCHIVO
-- Si gerencia mueve un cliente de zona desde el dashboard y mañana
-- vuelve a subir la maestra, el archivo lo pisa. "La maestra manda" es
-- correcto para lo que viene del archivo, pero convierte cualquier
-- corrección manual en trabajo perdido.
--
-- SOLUCIÓN: procedencia por campo. Cada fila recuerda QUÉ campos fueron
-- editados a mano. La carga siguiente respeta esos campos y registra el
-- desacuerdo como CONFLICTO, para que alguien decida. No se pierde el
-- cambio ni se esconde que el archivo dice otra cosa.
--
-- Regla de oro: la venta NO se edita a mano. Nunca. Un ajuste manual de
-- venta es un descuadre contable que después nadie puede explicar. Las
-- ventas entran sólo por archivo (024/025).
-- ═══════════════════════════════════════════════════════════════════

-- Las columnas de procedencia (campos_manuales, origen, es_prospecto)
-- se declaran en la migración de cada tabla: 005 para cliente, 006 para
-- producto, precio y stock. Acá viven los conflictos y las funciones.

CREATE INDEX IF NOT EXISTS ix_cliente_prospecto
  ON core.cliente (tenant_id, ejecutivo_id) WHERE es_prospecto AND activo;

-- ─── Conflictos archivo vs dashboard ───────────────────────────────
-- La tabla ingest.conflicto se declara en 025, que es quien la
-- escribe durante la publicación. Acá están las funciones que la leen
-- y la resuelven.

-- ─── Permiso ───────────────────────────────────────────────────────
INSERT INTO platform.rol_permiso (rol, permiso) VALUES
  ('tenant_admin','editar_datos'), ('gerencia','editar_datos'),
  ('ejecutivo','crear_prospecto')
ON CONFLICT DO NOTHING;

-- ─── Helper: marcar un campo como manual ───────────────────────────
CREATE OR REPLACE FUNCTION core.marcar_manual(p_actual TEXT[], p_campos TEXT[])
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(p_actual,'{}') || COALESCE(p_campos,'{}')));
$$;

-- ═══ CLIENTES ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION api.guardar_cliente(
  p_cliente_key TEXT,
  p_nombre TEXT DEFAULT NULL, p_zona TEXT DEFAULT NULL, p_ejecutivo TEXT DEFAULT NULL,
  p_comuna TEXT DEFAULT NULL, p_direccion TEXT DEFAULT NULL,
  p_lat NUMERIC DEFAULT NULL, p_lng NUMERIC DEFAULT NULL, p_rubro TEXT DEFAULT NULL,
  p_bloqueado BOOLEAN DEFAULT NULL, p_persona_natural BOOLEAN DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_campos TEXT[] := '{}'::text[]; v_nuevo BOOLEAN;
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(trim(p_cliente_key),'') IS NULL THEN
    RAISE EXCEPTION 'cliente_key_requerido' USING ERRCODE = '22023';
  END IF;

  -- Sólo se marca como manual lo que efectivamente se mandó. Un campo
  -- en NULL significa "no lo toques", no "bórralo".
  IF p_nombre     IS NOT NULL THEN v_campos := v_campos || 'nombre'::text;       END IF;
  IF p_zona       IS NOT NULL THEN v_campos := v_campos || 'zona_id'::text;      END IF;
  IF p_ejecutivo  IS NOT NULL THEN v_campos := v_campos || 'ejecutivo_id'::text; END IF;
  IF p_comuna     IS NOT NULL THEN v_campos := v_campos || 'comuna'::text;       END IF;
  IF p_direccion  IS NOT NULL THEN v_campos := v_campos || 'direccion'::text;    END IF;
  IF p_lat        IS NOT NULL THEN v_campos := v_campos || 'lat'::text;          END IF;
  IF p_lng        IS NOT NULL THEN v_campos := v_campos || 'lng'::text;          END IF;
  IF p_rubro      IS NOT NULL THEN v_campos := v_campos || 'rubro'::text;        END IF;
  IF p_bloqueado  IS NOT NULL THEN v_campos := v_campos || 'es_bloqueado'::text; END IF;

  SELECT NOT EXISTS (SELECT 1 FROM core.cliente
                      WHERE tenant_id = v_tenant AND cliente_key = trim(p_cliente_key))
    INTO v_nuevo;

  INSERT INTO core.cliente (tenant_id, cliente_key, nombre, zona_id, ejecutivo_id,
                            comuna, direccion, lat, lng, rubro, es_bloqueado,
                            es_persona_natural, origen, campos_manuales, activo, actualizado_en)
  VALUES (v_tenant, trim(p_cliente_key), p_nombre, p_zona, p_ejecutivo,
          upper(nullif(trim(p_comuna),'')), p_direccion, p_lat, p_lng, p_rubro,
          COALESCE(p_bloqueado,false), COALESCE(p_persona_natural,false),
          'dashboard', v_campos, TRUE, now())
  ON CONFLICT (tenant_id, cliente_key) DO UPDATE SET
     nombre        = COALESCE(EXCLUDED.nombre,       core.cliente.nombre),
     zona_id       = COALESCE(EXCLUDED.zona_id,      core.cliente.zona_id),
     ejecutivo_id  = COALESCE(EXCLUDED.ejecutivo_id, core.cliente.ejecutivo_id),
     comuna        = COALESCE(EXCLUDED.comuna,       core.cliente.comuna),
     direccion     = COALESCE(EXCLUDED.direccion,    core.cliente.direccion),
     lat           = COALESCE(EXCLUDED.lat,          core.cliente.lat),
     lng           = COALESCE(EXCLUDED.lng,          core.cliente.lng),
     rubro         = COALESCE(EXCLUDED.rubro,        core.cliente.rubro),
     es_bloqueado  = COALESCE(p_bloqueado,           core.cliente.es_bloqueado),
     es_persona_natural = COALESCE(p_persona_natural, core.cliente.es_persona_natural),
     campos_manuales = core.marcar_manual(core.cliente.campos_manuales, v_campos),
     actualizado_en = now();

  RETURN CASE WHEN v_nuevo THEN 'creado' ELSE 'actualizado' END;
END $$;

COMMENT ON FUNCTION api.guardar_cliente IS
  'Crea o edita. Los campos que se envían quedan marcados como manuales
   y la próxima carga de la maestra NO los pisa: registra el desacuerdo
   en ingest.conflicto para que alguien decida.';

-- ═══ PROSPECTOS ═════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION api.guardar_prospecto(
  p_cliente_key TEXT, p_nombre TEXT, p_ejecutivo TEXT,
  p_zona TEXT DEFAULT NULL, p_comuna TEXT DEFAULT NULL,
  p_direccion TEXT DEFAULT NULL, p_rubro TEXT DEFAULT NULL,
  p_lat NUMERIC DEFAULT NULL, p_lng NUMERIC DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_zona TEXT := p_zona;
BEGIN
  IF NOT (platform.puede('editar_datos') OR platform.puede('crear_prospecto')) THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT platform.capacidad_activa('prospectos') THEN
    RAISE EXCEPTION 'capacidad_desactivada' USING ERRCODE = '0A000';
  END IF;

  -- Si no se declara zona, se deduce de la comuna. Un prospecto sin
  -- zona no le aparece a nadie en la cartera.
  IF v_zona IS NULL AND p_comuna IS NOT NULL THEN
    SELECT zc.zona_id INTO v_zona FROM core.zona_comuna zc
     WHERE zc.tenant_id = v_tenant AND zc.comuna = upper(trim(p_comuna));
  END IF;
  IF v_zona IS NULL THEN
    SELECT e.zona_id INTO v_zona FROM core.ejecutivo e
     WHERE e.tenant_id = v_tenant AND e.id = p_ejecutivo;
  END IF;

  INSERT INTO core.cliente (tenant_id, cliente_key, nombre, ejecutivo_id, zona_id,
                            comuna, direccion, rubro, lat, lng,
                            es_prospecto, origen, activo,
                            campos_manuales, actualizado_en)
  VALUES (v_tenant, trim(p_cliente_key), p_nombre, p_ejecutivo, v_zona,
          upper(nullif(trim(p_comuna),'')), p_direccion, p_rubro, p_lat, p_lng,
          TRUE, 'dashboard', TRUE,
          ARRAY['nombre','ejecutivo_id','zona_id'], now())
  ON CONFLICT (tenant_id, cliente_key) DO UPDATE SET
     nombre = COALESCE(EXCLUDED.nombre, core.cliente.nombre),
     ejecutivo_id = EXCLUDED.ejecutivo_id,
     zona_id = COALESCE(EXCLUDED.zona_id, core.cliente.zona_id),
     comuna = COALESCE(EXCLUDED.comuna, core.cliente.comuna),
     direccion = COALESCE(EXCLUDED.direccion, core.cliente.direccion),
     campos_manuales = core.marcar_manual(core.cliente.campos_manuales,
                                          ARRAY['nombre','ejecutivo_id','zona_id']),
     actualizado_en = now();
  RETURN 'ok';
END $$;

COMMENT ON FUNCTION api.guardar_prospecto IS
  'Un prospecto es un cliente sin historial. Cuando compra y aparece en
   la venta, deja de ser prospecto solo: no hay que migrarlo de tabla.';

CREATE OR REPLACE FUNCTION api.convertir_prospecto(p_cliente_key TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE core.cliente SET es_prospecto = FALSE, actualizado_en = now()
   WHERE tenant_id = platform.tenant_actual() AND cliente_key = p_cliente_key;
END $$;

-- ═══ PRODUCTOS, PRECIOS, COSTOS Y STOCK ═════════════════════════════
CREATE OR REPLACE FUNCTION api.guardar_producto(
  p_sku TEXT, p_nombre TEXT,
  p_categoria TEXT DEFAULT NULL, p_marca TEXT DEFAULT NULL,
  p_unidad_venta TEXT DEFAULT NULL, p_unidades_caja NUMERIC DEFAULT NULL,
  p_kg_unidad NUMERIC DEFAULT NULL, p_imagen_url TEXT DEFAULT NULL,
  p_activo BOOLEAN DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_campos TEXT[] := ARRAY['nombre']::text[];
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_categoria    IS NOT NULL THEN v_campos := v_campos || 'categoria'::text;    END IF;
  IF p_marca        IS NOT NULL THEN v_campos := v_campos || 'marca'::text;        END IF;
  IF p_unidad_venta IS NOT NULL THEN v_campos := v_campos || 'unidad_venta'::text; END IF;
  IF p_imagen_url   IS NOT NULL THEN v_campos := v_campos || 'imagen_url'::text;   END IF;

  INSERT INTO core.producto (tenant_id, sku, nombre, categoria, marca, unidad_venta,
                             unidades_caja, kg_unidad, imagen_url, activo,
                             origen, campos_manuales, actualizado_en)
  VALUES (v_tenant, trim(p_sku), p_nombre, p_categoria, p_marca, p_unidad_venta,
          p_unidades_caja, p_kg_unidad, p_imagen_url, COALESCE(p_activo,TRUE),
          'dashboard', v_campos, now())
  ON CONFLICT (tenant_id, sku) DO UPDATE SET
     nombre        = COALESCE(EXCLUDED.nombre,        core.producto.nombre),
     categoria     = COALESCE(EXCLUDED.categoria,     core.producto.categoria),
     marca         = COALESCE(EXCLUDED.marca,         core.producto.marca),
     unidad_venta  = COALESCE(EXCLUDED.unidad_venta,  core.producto.unidad_venta),
     unidades_caja = COALESCE(EXCLUDED.unidades_caja, core.producto.unidades_caja),
     kg_unidad     = COALESCE(EXCLUDED.kg_unidad,     core.producto.kg_unidad),
     imagen_url    = COALESCE(EXCLUDED.imagen_url,    core.producto.imagen_url),
     activo        = COALESCE(p_activo,               core.producto.activo),
     campos_manuales = core.marcar_manual(core.producto.campos_manuales, v_campos),
     actualizado_en = now();
  RETURN 'ok';
END $$;

-- El precio NO se pisa: se agrega uno nuevo con su fecha. Cambiar el
-- precio de hoy no puede alterar lo que se cobró el mes pasado.
CREATE OR REPLACE FUNCTION api.guardar_precio(
  p_sku TEXT, p_precio_unidad NUMERIC DEFAULT NULL,
  p_precio_caja NUMERIC DEFAULT NULL, p_precio_kilo NUMERIC DEFAULT NULL,
  p_vigente_desde DATE DEFAULT NULL, p_lista TEXT DEFAULT 'general'
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_precio_unidad, p_precio_caja, p_precio_kilo) IS NULL THEN
    RAISE EXCEPTION 'sin_precio' USING ERRCODE = '22023',
      HINT = 'Hay que indicar al menos un precio: unidad, caja o kilo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.producto
                  WHERE tenant_id = v_tenant AND sku = trim(p_sku)) THEN
    RAISE EXCEPTION 'producto_inexistente' USING ERRCODE = 'P0002',
      HINT = 'Cree primero el producto con api.guardar_producto.';
  END IF;

  INSERT INTO core.precio (tenant_id, sku, lista, precio_unidad, precio_caja,
                           precio_kilo, vigente_desde, origen)
  VALUES (v_tenant, trim(p_sku), COALESCE(p_lista,'general'),
          p_precio_unidad, p_precio_caja, p_precio_kilo,
          COALESCE(p_vigente_desde, current_date), 'dashboard')
  ON CONFLICT (tenant_id, sku, lista, vigente_desde) DO UPDATE SET
     precio_unidad = EXCLUDED.precio_unidad,
     precio_caja   = EXCLUDED.precio_caja,
     precio_kilo   = EXCLUDED.precio_kilo,
     origen        = 'dashboard';
  RETURN 'ok';
END $$;

CREATE OR REPLACE FUNCTION api.guardar_costo(
  p_sku TEXT, p_costo NUMERIC, p_vigente_desde DATE DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT platform.puede('ver_costo') THEN
    RAISE EXCEPTION 'sin_permiso_costo' USING ERRCODE = '42501';
  END IF;
  IF p_costo IS NULL OR p_costo < 0 THEN
    RAISE EXCEPTION 'costo_invalido' USING ERRCODE = '22023';
  END IF;
  INSERT INTO core.costo (tenant_id, sku, costo_unitario, vigente_desde, origen)
  VALUES (v_tenant, trim(p_sku), p_costo, COALESCE(p_vigente_desde, current_date), 'lista')
  ON CONFLICT (tenant_id, sku, vigente_desde) DO UPDATE SET
     costo_unitario = EXCLUDED.costo_unitario;
  RETURN 'ok';
END $$;

CREATE OR REPLACE FUNCTION api.guardar_stock(
  p_sku TEXT, p_stock_total NUMERIC,
  p_almacen TEXT DEFAULT 'principal', p_stock_cajas NUMERIC DEFAULT NULL,
  p_fecha_venc DATE DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  INSERT INTO core.stock (tenant_id, sku, almacen, stock_total, stock_cajas,
                          fecha_venc, campos_manuales, actualizado_en)
  VALUES (v_tenant, trim(p_sku), COALESCE(p_almacen,'principal'),
          COALESCE(p_stock_total,0), p_stock_cajas, p_fecha_venc,
          ARRAY['stock_total'], now())
  ON CONFLICT (tenant_id, sku, almacen) DO UPDATE SET
     stock_total = EXCLUDED.stock_total,
     stock_cajas = COALESCE(EXCLUDED.stock_cajas, core.stock.stock_cajas),
     fecha_venc  = COALESCE(EXCLUDED.fecha_venc,  core.stock.fecha_venc),
     actualizado_en = now();
  RETURN 'ok';
END $$;

COMMENT ON FUNCTION api.guardar_stock IS
  'El stock manual NO se protege del archivo: la existencia real la sabe
   la bodega, no el dashboard. Editarlo a mano sirve para corregir hoy;
   mañana el archivo manda de nuevo. Es a propósito.';

-- ═══ PRECIO ACORDADO CON UN CLIENTE ═════════════════════════════════
CREATE OR REPLACE FUNCTION api.guardar_precio_cliente(
  p_cliente_key TEXT, p_sku TEXT, p_precio NUMERIC,
  p_motivo TEXT DEFAULT NULL, p_vigente_hasta DATE DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_lista NUMERIC;
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_precio IS NULL OR p_precio < 0 THEN
    RAISE EXCEPTION 'precio_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(precio_unidad, precio_caja, precio_kilo) INTO v_lista
    FROM core.precio
   WHERE tenant_id = v_tenant AND sku = trim(p_sku) AND vigente_desde <= current_date
   ORDER BY vigente_desde DESC LIMIT 1;

  -- Un precio bajo el costo no se bloquea, pero no pasa desapercibido:
  -- a veces es una decisión comercial y a veces es un cero de más.
  IF EXISTS (SELECT 1 FROM core.costo c
              WHERE c.tenant_id = v_tenant AND c.sku = trim(p_sku)
                AND c.vigente_desde <= current_date
                AND c.costo_unitario > p_precio
              ORDER BY c.vigente_desde DESC LIMIT 1) THEN
    RAISE WARNING 'El precio acordado queda BAJO EL COSTO de %', p_sku;
  END IF;

  INSERT INTO core.precio_cliente (tenant_id, cliente_key, sku, precio_unidad,
                                   motivo, vigente_hasta, creado_por)
       VALUES (v_tenant, trim(p_cliente_key), trim(p_sku), p_precio,
               p_motivo, p_vigente_hasta, platform.usuario_actual())
  ON CONFLICT (tenant_id, cliente_key, sku, vigente_desde) DO UPDATE
    SET precio_unidad = EXCLUDED.precio_unidad,
        motivo = EXCLUDED.motivo,
        vigente_hasta = EXCLUDED.vigente_hasta;

  RETURN CASE WHEN v_lista IS NULL THEN 'guardado'
              ELSE format('guardado · %s%% bajo lista',
                          round(100 * (v_lista - p_precio) / v_lista, 1)) END;
END $$;

CREATE OR REPLACE FUNCTION api.quitar_precio_cliente(p_cliente_key TEXT, p_sku TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  -- Se cierra la vigencia, no se borra: hay que poder explicar qué
  -- precio estuvo vigente cuando se emitió una factura vieja.
  UPDATE core.precio_cliente SET vigente_hasta = current_date - 1
   WHERE tenant_id = platform.tenant_actual()
     AND cliente_key = p_cliente_key AND sku = p_sku
     AND (vigente_hasta IS NULL OR vigente_hasta >= current_date);
  RETURN 'el cliente vuelve a su precio histórico o de lista';
END $$;

-- ═══ VOLVER A DEJAR QUE MANDE EL ARCHIVO ════════════════════════════
CREATE OR REPLACE FUNCTION api.liberar_campo(
  p_objeto TEXT, p_llave TEXT, p_campo TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_objeto = 'cliente' THEN
    UPDATE core.cliente
       SET campos_manuales = array_remove(campos_manuales, p_campo), actualizado_en = now()
     WHERE tenant_id = v_tenant AND cliente_key = p_llave;
  ELSIF p_objeto = 'producto' THEN
    UPDATE core.producto
       SET campos_manuales = array_remove(campos_manuales, p_campo), actualizado_en = now()
     WHERE tenant_id = v_tenant AND sku = p_llave;
  ELSE
    RAISE EXCEPTION 'objeto_no_soportado' USING ERRCODE = '22023';
  END IF;
  RETURN 'liberado';
END $$;

COMMENT ON FUNCTION api.liberar_campo(TEXT, TEXT, TEXT) IS
  'Quita la marca manual: a partir de la próxima carga ese campo vuelve
   a salir del archivo. Es cómo se cierra un conflicto a favor del ERP.';

CREATE OR REPLACE FUNCTION api.resolver_conflicto(
  p_conflicto BIGINT, p_resolucion TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, ingest, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); c ingest.conflicto%ROWTYPE;
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM ingest.conflicto
   WHERE id = p_conflicto AND tenant_id = v_tenant AND resuelto_en IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'conflicto_no_encontrado' USING ERRCODE = 'P0002'; END IF;

  IF p_resolucion = 'aceptar_archivo' THEN
    -- Se libera el campo y se aplica lo que traía el archivo.
    IF c.objeto = 'core.cliente' THEN
      UPDATE core.cliente SET campos_manuales = array_remove(campos_manuales, c.campo)
       WHERE tenant_id = v_tenant AND cliente_key = c.llave;
      EXECUTE format('UPDATE core.cliente SET %I = $1, actualizado_en = now()
                       WHERE tenant_id = $2 AND cliente_key = $3', c.campo)
        USING c.valor_archivo, v_tenant, c.llave;
    END IF;
  END IF;

  UPDATE ingest.conflicto SET resuelto_en = now(), resolucion = p_resolucion
   WHERE id = p_conflicto;
  RETURN p_resolucion;
END $$;

-- ═══ VISTAS DEL DASHBOARD ═══════════════════════════════════════════
CREATE OR REPLACE VIEW api.conflictos
WITH (security_invoker = true) AS
SELECT c.id, c.tenant_id, c.lote_id, a.nombre_original AS archivo,
       c.objeto, c.llave, c.campo, c.valor_archivo, c.valor_manual, c.creado_en
  FROM ingest.conflicto c
  JOIN ingest.lote l   ON l.id = c.lote_id
  JOIN ingest.archivo a ON a.id = l.archivo_id
 WHERE c.resuelto_en IS NULL;

CREATE OR REPLACE VIEW api.prospectos
WITH (security_invoker = true) AS
SELECT c.tenant_id, c.cliente_key, c.nombre, c.ejecutivo_id, c.zona_id,
       c.comuna, c.direccion, c.rubro, c.lat, c.lng, c.actualizado_en
  FROM core.cliente c
 WHERE c.es_prospecto AND c.activo;

GRANT SELECT ON api.conflictos, api.prospectos TO authenticated;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.guardar_cliente(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,BOOLEAN,BOOLEAN)',
    'api.guardar_prospecto(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC)',
    'api.convertir_prospecto(TEXT)',
    'api.guardar_producto(TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,BOOLEAN)',
    'api.guardar_precio(TEXT,NUMERIC,NUMERIC,NUMERIC,DATE,TEXT)',
    'api.guardar_costo(TEXT,NUMERIC,DATE)',
    'api.guardar_stock(TEXT,NUMERIC,TEXT,NUMERIC,DATE)',
    'api.liberar_campo(TEXT,TEXT,TEXT)',
    'api.resolver_conflicto(BIGINT,TEXT)',
    'api.guardar_precio_cliente(TEXT,TEXT,NUMERIC,TEXT,DATE)',
    'api.quitar_precio_cliente(TEXT,TEXT)',
    'api.precios_cliente(TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
