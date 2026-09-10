-- ═══════════════════════════════════════════════════════════════════
-- 025 · PUBLICAR · con respaldo y con vuelta atrás
--
-- Regla que no se negocia: NADA llega a core sin que antes exista una
-- copia de lo que se va a modificar. Publicar es reversible.
--
-- La compuerta rechaza el lote si:
--   · no está validado
--   · no tiene reconciliación
--   · la diferencia contra el total oficial supera el umbral
--   · un archivo snapshot trae muchas menos filas que las actuales
--     (export truncado) y nadie lo aprobó explícitamente
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ingest.respaldo (
  id        BIGSERIAL PRIMARY KEY,
  lote_id   UUID NOT NULL REFERENCES ingest.lote(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  objeto    TEXT NOT NULL,           -- 'core.cliente'
  llave     TEXT NOT NULL,
  fila      JSONB,                   -- NULL = no existía: revertir = borrar
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_respaldo_lote ON ingest.respaldo (lote_id);

COMMENT ON TABLE ingest.respaldo IS
  'Foto de las filas de core ANTES de que el lote las tocara. Con esto
   `api.revertir_lote` deshace una publicación sin restaurar la base
   entera. `fila` NULL significa que la fila no existía: revertir la
   elimina.';

ALTER TABLE ingest.respaldo ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.respaldo FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_lectura   ON ingest.respaldo;
DROP POLICY IF EXISTS tenant_escritura ON ingest.respaldo;
CREATE POLICY tenant_lectura   ON ingest.respaldo FOR SELECT USING (platform.tiene_acceso(tenant_id));
CREATE POLICY tenant_escritura ON ingest.respaldo FOR ALL
  USING (platform.tiene_acceso(tenant_id)) WITH CHECK (platform.tiene_acceso(tenant_id));
GRANT SELECT ON ingest.respaldo TO authenticated;


-- ─── Conflictos archivo vs dashboard ───────────────────────────────
-- Vive acá porque la publicación es quien los detecta. Las funciones
-- que los resuelven están en 026.
CREATE TABLE IF NOT EXISTS ingest.conflicto (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  lote_id       UUID NOT NULL REFERENCES ingest.lote(id) ON DELETE CASCADE,
  objeto        TEXT NOT NULL,
  llave         TEXT NOT NULL,
  campo         TEXT NOT NULL,
  valor_archivo TEXT,
  valor_manual  TEXT,
  resuelto_en   TIMESTAMPTZ,
  resolucion    TEXT CHECK (resolucion IN ('mantener_manual','aceptar_archivo')),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_conflicto_pendiente
  ON ingest.conflicto (tenant_id, lote_id) WHERE resuelto_en IS NULL;

COMMENT ON TABLE ingest.conflicto IS
  'El archivo dice una cosa y alguien editó otra. No se resuelve solo:
   se muestra. Resolver en silencio a favor de cualquiera de los dos es
   como se pierde la confianza en el sistema.';

ALTER TABLE ingest.conflicto ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest.conflicto FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_lectura   ON ingest.conflicto;
DROP POLICY IF EXISTS tenant_escritura ON ingest.conflicto;
CREATE POLICY tenant_lectura   ON ingest.conflicto FOR SELECT USING (platform.tiene_acceso(tenant_id));
CREATE POLICY tenant_escritura ON ingest.conflicto FOR ALL
  USING (platform.tiene_acceso(tenant_id)) WITH CHECK (platform.tiene_acceso(tenant_id));
GRANT SELECT ON ingest.conflicto TO authenticated;

-- ─── LA COMPUERTA + LA APLICACIÓN ──────────────────────────────────
CREATE OR REPLACE FUNCTION api.publicar_lote(
  p_lote UUID,
  p_umbral_pct NUMERIC DEFAULT 1.0,
  p_aprobar_caida BOOLEAN DEFAULT FALSE
) RETURNS TABLE (resultado TEXT, detalle TEXT)
LANGUAGE plpgsql SECURITY DEFINER
-- `public, extensions` porque linea_id usa digest() de pgcrypto.
SET search_path = pg_catalog, ingest, core, platform, public, extensions AS $$
DECLARE
  v_tenant UUID := platform.tenant_actual();
  v_tipo TEXT; v_estado TEXT; v_dif NUMERIC; v_var NUMERIC; v_n INTEGER := 0;
BEGIN
  IF NOT platform.puede('publicar_lote') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT ingest.tomar_candado(v_tenant) THEN
    RAISE EXCEPTION 'ciclo_en_curso' USING ERRCODE = '55P03';
  END IF;

  SELECT a.tipo, l.estado INTO v_tipo, v_estado
    FROM ingest.lote l JOIN ingest.archivo a ON a.id = l.archivo_id
   WHERE l.id = p_lote AND l.tenant_id = v_tenant;
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'lote_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_estado <> 'validado' THEN
    resultado := 'RECHAZADO';
    detalle := 'el lote está en estado ' || v_estado || ': hay que correr el ciclo primero';
    RETURN NEXT; RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ingest.reconciliacion WHERE lote_id = p_lote) THEN
    UPDATE ingest.lote SET estado='rechazado',
           motivo_rechazo='sin reconciliación' WHERE id = p_lote;
    resultado := 'RECHAZADO'; detalle := 'sin reconciliación'; RETURN NEXT; RETURN;
  END IF;

  SELECT diferencia_pct INTO v_dif FROM ingest.reconciliacion
   WHERE lote_id = p_lote AND metrica = 'venta_neta';
  IF v_dif IS NOT NULL AND abs(v_dif) > p_umbral_pct THEN
    UPDATE ingest.lote SET estado='rechazado',
           motivo_rechazo = format('venta calculada difiere %s%% del total oficial', round(v_dif,2))
     WHERE id = p_lote;
    resultado := 'RECHAZADO';
    detalle := format('diferencia de %s%% contra el total oficial (umbral %s%%)',
                      round(v_dif,2), p_umbral_pct);
    RETURN NEXT; RETURN;
  END IF;

  SELECT diferencia_pct INTO v_var FROM ingest.reconciliacion
   WHERE lote_id = p_lote AND metrica = 'variacion_filas';
  IF v_var IS NOT NULL AND v_var < -30 AND NOT p_aprobar_caida THEN
    resultado := 'REQUIERE_APROBACION';
    detalle := format('el archivo trae %s%% menos filas que lo vigente. '
                   || 'Si el export está completo, vuelva a publicar aprobando la caída.',
                      round(v_var,2));
    RETURN NEXT; RETURN;
  END IF;

  -- ═══ RESPALDO ANTES DE TOCAR NADA ═══
  IF v_tipo = 'maestra' THEN
    INSERT INTO ingest.respaldo (lote_id, tenant_id, objeto, llave, fila)
    SELECT p_lote, v_tenant, 'core.cliente', c.cliente_key, to_jsonb(c)
      FROM core.cliente c WHERE c.tenant_id = v_tenant;
  ELSIF v_tipo = 'precios' THEN
    INSERT INTO ingest.respaldo (lote_id, tenant_id, objeto, llave, fila)
    SELECT p_lote, v_tenant, 'core.producto', p.sku, to_jsonb(p)
      FROM core.producto p WHERE p.tenant_id = v_tenant;
  ELSIF v_tipo = 'stock' THEN
    INSERT INTO ingest.respaldo (lote_id, tenant_id, objeto, llave, fila)
    SELECT p_lote, v_tenant, 'core.stock', s.sku || '|' || s.almacen, to_jsonb(s)
      FROM core.stock s WHERE s.tenant_id = v_tenant;
  END IF;
  -- ventas es incremental: el respaldo es el propio lote_id de cada
  -- línea, que permite borrarlas selectivamente al revertir.

  -- ═══ APLICAR ═══
  IF v_tipo = 'ventas' THEN
    WITH v AS (
      SELECT fn.nro_fila,
             trim(fn.datos->>'cliente_key')        AS cliente_key,
             ingest.a_fecha(fn.datos->>'fecha')    AS fecha,
             trim(fn.datos->>'sku')                AS sku,
             upper(trim(fn.datos->>'tipo_doc'))    AS tipo_doc,
             nullif(trim(fn.datos->>'documento'),'') AS documento,
             nullif(trim(fn.datos->>'estado_pedido'),'') AS estado_pedido,
             ingest.a_numero(fn.datos->>'cantidad') AS cantidad,
             ingest.a_numero(fn.datos->>'monto')    AS monto,
             ingest.a_numero(fn.datos->>'costo_unitario') AS costo,
             nullif(trim(fn.datos->>'vendedor_origen'),'') AS vendedor
        FROM ingest.fila_norm fn
       WHERE fn.lote_id = p_lote
         AND NOT EXISTS (SELECT 1 FROM ingest.exclusion e
                          WHERE e.lote_id = fn.lote_id AND e.nro_fila = fn.nro_fila
                            AND e.regla NOT LIKE 'AVISO\_%')
    ), faltantes AS (   -- clientes con venta que no están en la maestra
      INSERT INTO core.cliente (tenant_id, cliente_key, nombre, lote_id)
      SELECT DISTINCT v_tenant, v.cliente_key, NULL, p_lote FROM v
      ON CONFLICT (tenant_id, cliente_key) DO NOTHING
      RETURNING 1
    )
    INSERT INTO core.venta_linea (tenant_id, linea_id, cliente_key, fecha, sku,
                                  tipo_doc, documento, estado_pedido, cantidad,
                                  monto_neto, costo_unitario, vendedor_origen, lote_id)
    SELECT v_tenant,
           encode(digest(concat_ws('|', v_tenant::text, v.cliente_key, v.fecha::text,
                                   v.tipo_doc, coalesce(v.documento,''), v.sku,
                                   v.monto::text), 'sha256'), 'hex'),
           v.cliente_key, v.fecha, v.sku, v.tipo_doc, v.documento, v.estado_pedido,
           v.cantidad,
           v.monto * core.signo_documento(v_tenant, v.tipo_doc),   -- D-06
           v.costo, v.vendedor, p_lote
      FROM v
    ON CONFLICT (tenant_id, linea_id) DO NOTHING;   -- idempotente
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF v_tipo = 'maestra' THEN
    -- CONFLICTOS: el archivo trae un valor y alguien editó otro a mano.
    -- Se registran para que gerencia decida; el campo manual NO se pisa.
    INSERT INTO ingest.conflicto (tenant_id, lote_id, objeto, llave, campo,
                                  valor_archivo, valor_manual)
    SELECT v_tenant, p_lote, 'core.cliente', c.cliente_key, x.campo,
           x.valor_archivo, x.valor_manual
      FROM ingest.fila_norm fn
      JOIN core.cliente c
        ON c.tenant_id = v_tenant AND c.cliente_key = trim(fn.datos->>'cliente_key')
      CROSS JOIN LATERAL (VALUES
        ('zona_id',      upper(trim(fn.datos->>'zona')),      c.zona_id),
        ('ejecutivo_id', upper(trim(fn.datos->>'ejecutivo')), c.ejecutivo_id),
        ('comuna',       upper(trim(fn.datos->>'comuna')),    c.comuna),
        ('nombre',       trim(fn.datos->>'nombre'),           c.nombre)
      ) AS x(campo, valor_archivo, valor_manual)
     WHERE fn.lote_id = p_lote
       AND x.campo = ANY(c.campos_manuales)
       AND x.valor_archivo IS DISTINCT FROM x.valor_manual
       AND x.valor_archivo IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM ingest.conflicto k
                        WHERE k.lote_id = p_lote AND k.llave = c.cliente_key
                          AND k.campo = x.campo);

    INSERT INTO core.zona (tenant_id, id, nombre)
    SELECT DISTINCT v_tenant, upper(trim(fn.datos->>'zona')), upper(trim(fn.datos->>'zona'))
      FROM ingest.fila_norm fn WHERE fn.lote_id = p_lote
        AND nullif(trim(fn.datos->>'zona'),'') IS NOT NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO core.ejecutivo (tenant_id, id, nombre, zona_id)
    SELECT DISTINCT v_tenant, upper(trim(fn.datos->>'ejecutivo')),
           trim(fn.datos->>'ejecutivo'), upper(trim(fn.datos->>'zona'))
      FROM ingest.fila_norm fn WHERE fn.lote_id = p_lote
        AND nullif(trim(fn.datos->>'ejecutivo'),'') IS NOT NULL
    ON CONFLICT (tenant_id, id) DO NOTHING;

    INSERT INTO core.cliente (tenant_id, cliente_key, nombre, comuna, direccion,
                              lat, lng, rubro, zona_id, ejecutivo_id, es_bloqueado,
                              activo, lote_id, actualizado_en)
    SELECT v_tenant, trim(fn.datos->>'cliente_key'),
           nullif(trim(fn.datos->>'nombre'),''),
           upper(nullif(trim(fn.datos->>'comuna'),'')),
           nullif(trim(fn.datos->>'direccion'),''),
           ingest.a_numero(fn.datos->>'lat'), ingest.a_numero(fn.datos->>'lng'),
           nullif(trim(fn.datos->>'rubro'),''),
           upper(trim(fn.datos->>'zona')), upper(trim(fn.datos->>'ejecutivo')),
           upper(coalesce(fn.datos->>'es_bloqueado','')) IN ('SI','SÍ','TRUE','1'),
           TRUE, p_lote, now()
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM ingest.exclusion e
                        WHERE e.lote_id = fn.lote_id AND e.nro_fila = fn.nro_fila
                          AND e.regla NOT LIKE 'AVISO\_%')
    -- LA MAESTRA MANDA, salvo en los campos editados a mano desde el
    -- dashboard. Ese es el trato: si el cliente corrige algo, la carga
    -- siguiente no se lo borra; deja el desacuerdo anotado arriba.
    ON CONFLICT (tenant_id, cliente_key) DO UPDATE SET
       nombre = CASE WHEN 'nombre' = ANY(core.cliente.campos_manuales)
                     THEN core.cliente.nombre
                     ELSE COALESCE(EXCLUDED.nombre, core.cliente.nombre) END,
       comuna = CASE WHEN 'comuna' = ANY(core.cliente.campos_manuales)
                     THEN core.cliente.comuna
                     ELSE COALESCE(EXCLUDED.comuna, core.cliente.comuna) END,
       direccion = CASE WHEN 'direccion' = ANY(core.cliente.campos_manuales)
                        THEN core.cliente.direccion
                        ELSE COALESCE(EXCLUDED.direccion, core.cliente.direccion) END,
       lat = CASE WHEN 'lat' = ANY(core.cliente.campos_manuales)
                  THEN core.cliente.lat ELSE COALESCE(EXCLUDED.lat, core.cliente.lat) END,
       lng = CASE WHEN 'lng' = ANY(core.cliente.campos_manuales)
                  THEN core.cliente.lng ELSE COALESCE(EXCLUDED.lng, core.cliente.lng) END,
       rubro = CASE WHEN 'rubro' = ANY(core.cliente.campos_manuales)
                    THEN core.cliente.rubro ELSE COALESCE(EXCLUDED.rubro, core.cliente.rubro) END,
       zona_id = CASE WHEN 'zona_id' = ANY(core.cliente.campos_manuales)
                      THEN core.cliente.zona_id ELSE EXCLUDED.zona_id END,
       ejecutivo_id = CASE WHEN 'ejecutivo_id' = ANY(core.cliente.campos_manuales)
                           THEN core.cliente.ejecutivo_id ELSE EXCLUDED.ejecutivo_id END,
       es_bloqueado = CASE WHEN 'es_bloqueado' = ANY(core.cliente.campos_manuales)
                           THEN core.cliente.es_bloqueado ELSE EXCLUDED.es_bloqueado END,
       activo = TRUE, lote_id = EXCLUDED.lote_id, actualizado_en = now();
    GET DIAGNOSTICS v_n = ROW_COUNT;

    -- Ausente del archivo = se desactiva, NO se borra. La venta
    -- histórica de ese cliente tiene que seguir cuadrando.
    -- Ausente del archivo = se desactiva. PERO sólo lo que vino del
    -- archivo: un prospecto o un cliente creado en el dashboard no está
    -- en la maestra y desactivarlo sería borrar el trabajo del vendedor.
    UPDATE core.cliente c SET activo = FALSE, actualizado_en = now()
     WHERE c.tenant_id = v_tenant AND c.activo
       AND c.origen = 'archivo'
       AND NOT c.es_prospecto
       AND NOT EXISTS (SELECT 1 FROM ingest.fila_norm fn
                        WHERE fn.lote_id = p_lote
                          AND trim(fn.datos->>'cliente_key') = c.cliente_key);

  ELSIF v_tipo = 'precios' THEN
    INSERT INTO core.producto (tenant_id, sku, nombre, categoria, marca,
                               unidad_venta, unidades_caja, kg_unidad, kg_caja,
                               activo, lote_id, actualizado_en)
    SELECT v_tenant, trim(fn.datos->>'sku'), trim(fn.datos->>'nombre'),
           nullif(trim(fn.datos->>'categoria'),''), nullif(trim(fn.datos->>'marca'),''),
           nullif(trim(fn.datos->>'unidad_venta'),''),
           ingest.a_numero(fn.datos->>'unidades_caja'),
           ingest.a_numero(fn.datos->>'kg_unidad'),
           ingest.a_numero(fn.datos->>'kg_caja'),
           TRUE, p_lote, now()
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM ingest.exclusion e
                        WHERE e.lote_id = fn.lote_id AND e.nro_fila = fn.nro_fila
                          AND e.regla NOT LIKE 'AVISO\_%')
    ON CONFLICT (tenant_id, sku) DO UPDATE SET
       nombre = CASE WHEN 'nombre' = ANY(core.producto.campos_manuales)
                     THEN core.producto.nombre ELSE EXCLUDED.nombre END,
       categoria = CASE WHEN 'categoria' = ANY(core.producto.campos_manuales)
                        THEN core.producto.categoria
                        ELSE COALESCE(EXCLUDED.categoria, core.producto.categoria) END,
       marca = CASE WHEN 'marca' = ANY(core.producto.campos_manuales)
                    THEN core.producto.marca
                    ELSE COALESCE(EXCLUDED.marca, core.producto.marca) END,
       unidad_venta = CASE WHEN 'unidad_venta' = ANY(core.producto.campos_manuales)
                           THEN core.producto.unidad_venta
                           ELSE COALESCE(EXCLUDED.unidad_venta, core.producto.unidad_venta) END,
       activo = TRUE, lote_id = EXCLUDED.lote_id, actualizado_en = now();
    GET DIAGNOSTICS v_n = ROW_COUNT;

    -- Precio HISTORIZADO: no se pisa el de ayer, se agrega el de hoy.
    INSERT INTO core.precio (tenant_id, sku, lista, precio_unidad, precio_caja,
                             precio_kilo, vigente_desde, lote_id)
    SELECT v_tenant, trim(fn.datos->>'sku'), 'general',
           ingest.a_numero(fn.datos->>'precio_unidad'),
           ingest.a_numero(fn.datos->>'precio_caja'),
           ingest.a_numero(fn.datos->>'precio_kilo'),
           current_date, p_lote
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM ingest.exclusion e
                        WHERE e.lote_id = fn.lote_id AND e.nro_fila = fn.nro_fila
                          AND e.regla NOT LIKE 'AVISO\_%')
    ON CONFLICT (tenant_id, sku, lista, vigente_desde) DO UPDATE SET
       precio_unidad = EXCLUDED.precio_unidad, precio_caja = EXCLUDED.precio_caja,
       precio_kilo = EXCLUDED.precio_kilo, lote_id = EXCLUDED.lote_id;

  ELSIF v_tipo = 'stock' THEN
    INSERT INTO core.stock (tenant_id, sku, almacen, stock_total, stock_cajas,
                            fecha_venc, lote_id, actualizado_en)
    SELECT v_tenant, trim(fn.datos->>'sku'),
           COALESCE(nullif(trim(fn.datos->>'almacen'),''), 'principal'),
           COALESCE(ingest.a_numero(fn.datos->>'stock_total'), 0),
           ingest.a_numero(fn.datos->>'stock_cajas'),
           ingest.a_fecha(fn.datos->>'fecha_venc'), p_lote, now()
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND EXISTS (SELECT 1 FROM core.producto p
                    WHERE p.tenant_id = v_tenant AND p.sku = trim(fn.datos->>'sku'))
       AND NOT EXISTS (SELECT 1 FROM ingest.exclusion e
                        WHERE e.lote_id = fn.lote_id AND e.nro_fila = fn.nro_fila
                          AND e.regla NOT LIKE 'AVISO\_%')
    ON CONFLICT (tenant_id, sku, almacen) DO UPDATE SET
       stock_total = EXCLUDED.stock_total, stock_cajas = EXCLUDED.stock_cajas,
       fecha_venc = EXCLUDED.fecha_venc, lote_id = EXCLUDED.lote_id,
       actualizado_en = now();
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF v_tipo = 'costos' THEN
    INSERT INTO core.costo (tenant_id, sku, costo_unitario, vigente_desde, origen, lote_id)
    SELECT v_tenant, trim(fn.datos->>'sku'),
           ingest.a_numero(fn.datos->>'costo_unitario'),
           COALESCE(ingest.a_fecha(fn.datos->>'vigente_desde'), current_date),
           'lista', p_lote
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND EXISTS (SELECT 1 FROM core.producto p
                    WHERE p.tenant_id = v_tenant AND p.sku = trim(fn.datos->>'sku'))
       AND ingest.a_numero(fn.datos->>'costo_unitario') IS NOT NULL
    ON CONFLICT (tenant_id, sku, vigente_desde) DO UPDATE SET
       costo_unitario = EXCLUDED.costo_unitario, lote_id = EXCLUDED.lote_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  UPDATE ingest.lote
     SET estado='publicado', publicado_en = now(),
         publicado_por = platform.usuario_actual(), motivo_rechazo = NULL
   WHERE id = p_lote;

  resultado := 'PUBLICADO';
  detalle := v_n || ' filas aplicadas a core · respaldo disponible para revertir';
  RETURN NEXT;
END $$;

-- ─── VUELTA ATRÁS ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.revertir_lote(p_lote UUID)
RETURNS TABLE (resultado TEXT, detalle TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ingest, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_tipo TEXT; v_n INTEGER := 0;
BEGIN
  IF NOT platform.puede('publicar_lote') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  SELECT a.tipo INTO v_tipo
    FROM ingest.lote l JOIN ingest.archivo a ON a.id = l.archivo_id
   WHERE l.id = p_lote AND l.tenant_id = v_tenant AND l.estado = 'publicado';
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'lote_no_publicado' USING ERRCODE = 'P0002';
  END IF;

  IF v_tipo = 'ventas' THEN
    -- Sólo las líneas que ESTE lote creó. Las de lotes anteriores no se
    -- tocan: por eso linea_id guarda su lote de origen.
    DELETE FROM core.venta_linea WHERE tenant_id = v_tenant AND lote_id = p_lote;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_tipo = 'maestra' THEN
    DELETE FROM core.cliente c
     WHERE c.tenant_id = v_tenant AND c.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM ingest.respaldo r
                        WHERE r.lote_id = p_lote AND r.objeto='core.cliente'
                          AND r.llave = c.cliente_key);
    UPDATE core.cliente c SET
      nombre = r.fila->>'nombre', comuna = r.fila->>'comuna',
      direccion = r.fila->>'direccion', zona_id = r.fila->>'zona_id',
      ejecutivo_id = r.fila->>'ejecutivo_id',
      es_bloqueado = (r.fila->>'es_bloqueado')::boolean,
      activo = (r.fila->>'activo')::boolean, actualizado_en = now()
      FROM ingest.respaldo r
     WHERE r.lote_id = p_lote AND r.objeto = 'core.cliente'
       AND c.tenant_id = v_tenant AND c.cliente_key = r.llave;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_tipo = 'precios' THEN
    DELETE FROM core.precio WHERE tenant_id = v_tenant AND lote_id = p_lote;
    UPDATE core.producto p SET
      nombre = r.fila->>'nombre', categoria = r.fila->>'categoria',
      marca = r.fila->>'marca', activo = (r.fila->>'activo')::boolean
      FROM ingest.respaldo r
     WHERE r.lote_id = p_lote AND r.objeto = 'core.producto'
       AND p.tenant_id = v_tenant AND p.sku = r.llave;
    DELETE FROM core.producto p
     WHERE p.tenant_id = v_tenant AND p.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM ingest.respaldo r
                        WHERE r.lote_id = p_lote AND r.objeto='core.producto' AND r.llave = p.sku);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_tipo = 'stock' THEN
    UPDATE core.stock s SET
      stock_total = (r.fila->>'stock_total')::numeric,
      stock_cajas = (r.fila->>'stock_cajas')::numeric
      FROM ingest.respaldo r
     WHERE r.lote_id = p_lote AND r.objeto = 'core.stock'
       AND s.tenant_id = v_tenant AND s.sku || '|' || s.almacen = r.llave;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_tipo = 'costos' THEN
    DELETE FROM core.costo WHERE tenant_id = v_tenant AND lote_id = p_lote;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  UPDATE ingest.lote SET estado = 'validado', publicado_en = NULL,
         motivo_rechazo = 'revertido por ' || COALESCE(platform.usuario_actual()::text,'?')
   WHERE id = p_lote;

  resultado := 'REVERTIDO'; detalle := v_n || ' filas restauradas'; RETURN NEXT;
END $$;

COMMENT ON FUNCTION api.revertir_lote(UUID) IS
  'Deshace UNA publicación sin restaurar la base entera. Existe porque
   la alternativa real, cuando algo sale mal, es que alguien borre una
   tabla a mano a las once de la noche.';

REVOKE ALL ON FUNCTION api.publicar_lote(UUID, NUMERIC, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.revertir_lote(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.publicar_lote(UUID, NUMERIC, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION api.revertir_lote(UUID) TO authenticated;
