-- ═══════════════════════════════════════════════════════════════════
-- 024 · EL CICLO · una empresa, un lote, un candado
--
-- LO QUE HAY QUE ENTENDER: los cuatro archivos NO se comportan igual.
--
--   ventas   → INCREMENTAL. Cada línea es un hecho que ocurrió. Se
--              acumula por linea_id. Volver a subir el mismo archivo no
--              duplica nada, y subir sólo el día de hoy SUMA al mes.
--
--   precios  → SNAPSHOT. El archivo ES la lista vigente hoy. Pero un
--   stock      snapshot no borra: versiona (precios) o actualiza lo que
--   maestra    trae y desactiva lo ausente (productos, clientes), y
--              siempre con respaldo previo.
--
-- Tratar ventas como snapshot borra el histórico. Tratar la maestra
-- como incremental deja clientes fantasma que nadie da de baja. Por eso
-- el modo es del TIPO de archivo, no una opción del usuario.
--
-- Lo corre la propia empresa desde su dashboard. Ningún paso necesita
-- superadmin ni que alguien de Black Sheep abra el SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Candado por empresa ───────────────────────────────────────────
-- Dos personas de la misma empresa subiendo archivos a la vez es una
-- carrera. Con el candado, la segunda espera; nunca se pisan.
-- El candado es POR TENANT: una empresa no bloquea a otra.
CREATE OR REPLACE FUNCTION ingest.tomar_candado(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql SET search_path = pg_catalog AS $$
  SELECT pg_try_advisory_xact_lock(hashtext('bs_ciclo'), hashtext(p_tenant::text));
$$;

-- ─── Helpers de conversión, tolerantes al formato chileno ──────────
CREATE OR REPLACE FUNCTION ingest.a_numero(p TEXT)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE t TEXT;
BEGIN
  t := trim(coalesce(p, ''));
  IF t = '' THEN RETURN NULL; END IF;
  t := replace(replace(replace(t, '$', ''), ' ', ''), chr(160), '');

  -- AMBIGÜEDAD REAL: "12.500" en Chile son doce mil quinientos, no doce
  -- coma cinco. Leerlo mal divide la venta por mil y el error pasa
  -- desapercibido porque el número sigue siendo un número válido.
  IF position(',' in t) > 0 AND position('.' in t) > 0 THEN
    -- Los dos separadores: manda el que está más a la derecha.
    IF position(',' in reverse(t)) < position('.' in reverse(t))
      THEN t := replace(replace(t, '.', ''), ',', '.');   -- 1.234.567,89
      ELSE t := replace(t, ',', '');                      -- 1,234,567.89
    END IF;
  ELSIF position('.' in t) > 0 THEN
    -- Grupos exactos de 3 → separador de miles. Si no, es decimal.
    IF t ~ '^-?\d{1,3}(\.\d{3})+$' THEN t := replace(t, '.', ''); END IF;
  ELSIF position(',' in t) > 0 THEN
    IF t ~ '^-?\d{1,3}(,\d{3})+$'
      THEN t := replace(t, ',', '');       -- 1,234,567
      ELSE t := replace(t, ',', '.');      -- 1,5 → 1.5 (coma decimal chilena)
    END IF;
  END IF;
  RETURN t::numeric;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION ingest.a_fecha(p TEXT)
RETURNS DATE LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE t TEXT; f DATE;
BEGIN
  t := trim(coalesce(p, ''));
  IF t = '' THEN RETURN NULL; END IF;
  -- Excel guarda fechas como número de días desde 1899-12-30
  IF t ~ '^\d{5}$' THEN RETURN DATE '1899-12-30' + t::int; END IF;
  FOREACH t IN ARRAY ARRAY[t] LOOP
    BEGIN f := to_date(t, 'DD-MM-YYYY');
      IF t ~ '^\d{1,2}[-/]\d{1,2}[-/]\d{4}$' THEN RETURN f; END IF;
    EXCEPTION WHEN others THEN NULL; END;
  END LOOP;
  BEGIN RETURN t::date; EXCEPTION WHEN others THEN RETURN NULL; END;
END $$;

-- ─── EL CICLO ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.ejecutar_ciclo(
  p_lote UUID, p_venta_oficial NUMERIC DEFAULT NULL
) RETURNS TABLE (paso TEXT, resultado TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ingest, core, platform AS $$
DECLARE
  v_tenant UUID := platform.tenant_actual();
  v_tipo TEXT; v_n INTEGER; v_exc INTEGER; v_ok INTEGER;
  v_suma NUMERIC; v_prev NUMERIC; v_var NUMERIC; v_actual INTEGER;
BEGIN
  IF NOT platform.puede('cargar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT ingest.tomar_candado(v_tenant) THEN
    RAISE EXCEPTION 'ciclo_en_curso' USING ERRCODE = '55P03',
      HINT = 'Otra carga de esta empresa está corriendo. Espere a que termine.';
  END IF;

  SELECT a.tipo INTO v_tipo
    FROM ingest.lote l JOIN ingest.archivo a ON a.id = l.archivo_id
   WHERE l.id = p_lote AND l.tenant_id = v_tenant AND l.estado IN ('recibido','normalizado');
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'lote_no_disponible' USING ERRCODE = 'P0002';
  END IF;

  -- Reejecutable: se limpia lo derivado, NUNCA la fila cruda.
  DELETE FROM ingest.fila_norm WHERE lote_id = p_lote;
  DELETE FROM ingest.exclusion WHERE lote_id = p_lote;
  DELETE FROM ingest.reconciliacion WHERE lote_id = p_lote;

  -- 1 · NORMALIZAR
  INSERT INTO ingest.fila_norm (lote_id, nro_fila, datos)
  SELECT fc.lote_id, fc.nro_fila, ingest.normalizar(v_tenant, v_tipo, fc.datos)
    FROM ingest.fila_cruda fc WHERE fc.lote_id = p_lote;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  paso := '1 · normalizar'; resultado := v_n || ' filas'; RETURN NEXT;

  -- 2 · VALIDAR obligatorias del contrato
  INSERT INTO ingest.exclusion (lote_id, nro_fila, regla, detalle)
  SELECT fn.lote_id, fn.nro_fila, 'FALTA_OBLIGATORIA', c.campo
    FROM ingest.fila_norm fn
    CROSS JOIN LATERAL unnest(
      CASE v_tipo
        WHEN 'ventas'  THEN ARRAY['cliente_key','fecha','sku','monto','cantidad','tipo_doc']
        WHEN 'maestra' THEN ARRAY['cliente_key','ejecutivo','zona']
        WHEN 'precios' THEN ARRAY['sku','nombre']
        WHEN 'stock'   THEN ARRAY['sku','stock_total']
        WHEN 'costos'  THEN ARRAY['sku','costo_unitario']
      END) AS c(campo)
   WHERE fn.lote_id = p_lote
     AND NULLIF(trim(coalesce(fn.datos ->> c.campo, '')), '') IS NULL
  ON CONFLICT DO NOTHING;

  -- precios: al menos un precio, cualquiera de los tres
  IF v_tipo = 'precios' THEN
    INSERT INTO ingest.exclusion (lote_id, nro_fila, regla, detalle)
    SELECT fn.lote_id, fn.nro_fila, 'SIN_PRECIO', 'ni unidad, ni caja, ni kilo'
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND COALESCE(ingest.a_numero(fn.datos->>'precio_unidad'),
                    ingest.a_numero(fn.datos->>'precio_caja'),
                    ingest.a_numero(fn.datos->>'precio_kilo')) IS NULL
    ON CONFLICT DO NOTHING;
  END IF;

  -- 3 · REGLAS DE VENTA (D-05 y D-06)
  IF v_tipo = 'ventas' THEN
    INSERT INTO ingest.exclusion (lote_id, nro_fila, regla, detalle)
    SELECT fn.lote_id, fn.nro_fila, 'FECHA_INVALIDA', fn.datos->>'fecha'
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND (ingest.a_fecha(fn.datos->>'fecha') IS NULL
            OR ingest.a_fecha(fn.datos->>'fecha') > current_date)
    ON CONFLICT DO NOTHING;

    INSERT INTO ingest.exclusion (lote_id, nro_fila, regla, detalle)
    SELECT fn.lote_id, fn.nro_fila, 'TIPO_DOC_DESCONOCIDO',
           'no configurado como venta: ' || coalesce(fn.datos->>'tipo_doc','(vacío)')
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM core.tipo_documento td
                        WHERE td.tenant_id = v_tenant
                          AND td.codigo = upper(trim(coalesce(fn.datos->>'tipo_doc','')))
                          AND td.cuenta_como_venta)
    ON CONFLICT DO NOTHING;

    INSERT INTO ingest.exclusion (lote_id, nro_fila, regla, detalle)
    SELECT fn.lote_id, fn.nro_fila, 'ESTADO_EXCLUIDO', fn.datos->>'estado_pedido'
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND EXISTS (SELECT 1 FROM core.estado_excluido ee
                    WHERE ee.tenant_id = v_tenant
                      AND ee.estado = upper(trim(coalesce(fn.datos->>'estado_pedido',''))))
    ON CONFLICT DO NOTHING;

    -- Aviso, no exclusión: la venta cuenta igual. El cliente se crea y
    -- queda SIN_ASIGNAR, que es exactamente lo que hay que ir a corregir.
    INSERT INTO ingest.exclusion (lote_id, nro_fila, regla, detalle)
    SELECT fn.lote_id, fn.nro_fila, 'AVISO_CLIENTE_SIN_MAESTRA', fn.datos->>'cliente_key'
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM core.cliente c
                        WHERE c.tenant_id = v_tenant
                          AND c.cliente_key = trim(fn.datos->>'cliente_key'))
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT count(DISTINCT nro_fila) INTO v_exc FROM ingest.exclusion
   WHERE lote_id = p_lote AND regla NOT LIKE 'AVISO\_%';
  v_ok := v_n - v_exc;
  paso := '2 · validar'; resultado := v_ok || ' válidas · ' || v_exc || ' excluidas'; RETURN NEXT;

  -- 4 · RECONCILIAR
  INSERT INTO ingest.reconciliacion (lote_id, metrica, valor_calculado)
  VALUES (p_lote, 'filas_validas', v_ok), (p_lote, 'filas_excluidas', v_exc)
  ON CONFLICT (lote_id, metrica) DO UPDATE SET valor_calculado = EXCLUDED.valor_calculado;

  IF v_tipo = 'ventas' THEN
    SELECT COALESCE(sum(ingest.a_numero(fn.datos->>'monto')
                        * core.signo_documento(v_tenant, fn.datos->>'tipo_doc')), 0)
      INTO v_suma
      FROM ingest.fila_norm fn
     WHERE fn.lote_id = p_lote
       AND NOT EXISTS (SELECT 1 FROM ingest.exclusion e
                        WHERE e.lote_id = fn.lote_id AND e.nro_fila = fn.nro_fila
                          AND e.regla NOT LIKE 'AVISO\_%');

    INSERT INTO ingest.reconciliacion (lote_id, metrica, valor_calculado, valor_oficial, diferencia_pct)
    VALUES (p_lote, 'venta_neta', v_suma, p_venta_oficial,
            CASE WHEN p_venta_oficial IS NOT NULL AND p_venta_oficial <> 0
                 THEN round(100 * (v_suma - p_venta_oficial) / abs(p_venta_oficial), 4) END)
    ON CONFLICT (lote_id, metrica) DO UPDATE
      SET valor_calculado = EXCLUDED.valor_calculado,
          valor_oficial   = EXCLUDED.valor_oficial,
          diferencia_pct  = EXCLUDED.diferencia_pct;

    paso := '3 · reconciliar';
    resultado := 'venta neta ' || to_char(v_suma, 'FM999G999G999G999')
      || COALESCE(' · difiere ' || round((SELECT diferencia_pct FROM ingest.reconciliacion
             WHERE lote_id = p_lote AND metrica='venta_neta'), 2)::text || '% del oficial',
          ' · sin total oficial declarado');
    RETURN NEXT;
  ELSE
    -- CONTROL DE CAÍDA para los archivos snapshot. Un export truncado
    -- que trae 40 productos en vez de 4.000 es el accidente clásico.
    SELECT CASE v_tipo
             WHEN 'precios' THEN (SELECT count(*) FROM core.producto WHERE tenant_id=v_tenant AND activo)
             WHEN 'stock'   THEN (SELECT count(*) FROM core.stock    WHERE tenant_id=v_tenant)
             WHEN 'maestra' THEN (SELECT count(*) FROM core.cliente  WHERE tenant_id=v_tenant AND activo)
             WHEN 'costos'  THEN (SELECT count(*) FROM core.costo    WHERE tenant_id=v_tenant)
           END INTO v_actual;
    v_var := CASE WHEN COALESCE(v_actual,0) > 0
                  THEN round(100.0 * (v_ok - v_actual) / v_actual, 2) END;
    INSERT INTO ingest.reconciliacion (lote_id, metrica, valor_calculado, valor_oficial, diferencia_pct)
    VALUES (p_lote, 'variacion_filas', v_ok, v_actual, v_var)
    ON CONFLICT (lote_id, metrica) DO UPDATE
      SET valor_calculado = EXCLUDED.valor_calculado,
          valor_oficial = EXCLUDED.valor_oficial, diferencia_pct = EXCLUDED.diferencia_pct;
    paso := '3 · reconciliar';
    resultado := v_ok || ' filas vs ' || COALESCE(v_actual,0) || ' actuales'
              || COALESCE(' · variación ' || v_var || '%', ' · primera carga');
    RETURN NEXT;
  END IF;

  UPDATE ingest.lote
     SET estado = 'validado', filas_leidas = v_n,
         filas_validas = v_ok, filas_excluidas = v_exc
   WHERE id = p_lote;

  paso := '4 · listo';
  resultado := 'VALIDADO · revisar y publicar';
  RETURN NEXT;
END $$;

COMMENT ON FUNCTION api.ejecutar_ciclo(UUID, NUMERIC) IS
  'El ciclo de UNA empresa sobre UN lote. No toca core: deja el lote en
   `validado` con su reconciliación a la vista. Publicar es un segundo
   acto deliberado (025). Es reejecutable: borra lo derivado y vuelve a
   calcular desde la fila cruda, que nunca se toca.';

REVOKE ALL ON FUNCTION api.ejecutar_ciclo(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.ejecutar_ciclo(UUID, NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION ingest.tomar_candado(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ingest.a_numero(TEXT), ingest.a_fecha(TEXT) TO authenticated;
