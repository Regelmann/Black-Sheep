-- ═══════════════════════════════════════════════════════════════════
-- 022 · LAS DOS CONSOLAS
--
--   A · Dashboard de gerencia — lo opera cada empresa sobre SUS datos
--   B · Consola de plataforma — la opera Black Sheep sobre TODAS
--
-- Toda función valida permiso en el servidor. El front oculta botones;
-- ocultar un botón no es un control de acceso.
-- ═══════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  A · DASHBOARD DE GERENCIA                                    ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- ─── Qué puede hacer esta empresa (el front dibuja según esto) ─────
CREATE OR REPLACE VIEW api.mis_capacidades
WITH (security_invoker = true) AS
SELECT c.codigo, c.nombre, c.descripcion, c.requiere,
       platform.capacidad_activa(c.codigo) AS activa
  FROM platform.capacidad c;

CREATE OR REPLACE VIEW api.mi_suscripcion
WITH (security_invoker = true) AS
SELECT s.tenant_id, t.nombre AS empresa, s.plan, s.estado, s.vigente_hasta,
       s.dias_gracia,
       (s.vigente_hasta - current_date)                    AS dias_restantes,
       platform.tenant_habilitado(s.tenant_id)             AS habilitado
  FROM platform.suscripcion s
  JOIN platform.tenants t ON t.id = s.tenant_id;

-- ─── Cargas de archivos ────────────────────────────────────────────
CREATE OR REPLACE VIEW api.cargas
WITH (security_invoker = true) AS
SELECT l.id AS lote_id, l.tenant_id, a.tipo, a.nombre_original, a.sha256,
       a.subido_en, l.estado, l.filas_leidas, l.filas_validas,
       l.filas_excluidas, l.motivo_rechazo, l.publicado_en
  FROM ingest.lote l
  JOIN ingest.archivo a ON a.id = l.archivo_id;

CREATE OR REPLACE VIEW api.carga_exclusiones
WITH (security_invoker = true) AS
SELECT l.tenant_id, e.lote_id, e.regla, count(*) AS filas,
       min(e.nro_fila) AS primera_fila
  FROM ingest.exclusion e
  JOIN ingest.lote l ON l.id = e.lote_id
 GROUP BY l.tenant_id, e.lote_id, e.regla;

-- Registra el archivo y abre el lote. El contenido lo procesa el
-- pipeline; esto es la puerta de entrada desde el dashboard.
CREATE OR REPLACE FUNCTION api.registrar_carga(
  p_tipo TEXT, p_nombre TEXT, p_sha256 TEXT,
  p_bytes BIGINT DEFAULT NULL, p_storage_path TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ingest, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
        v_archivo UUID; v_lote UUID; v_previo INTEGER;
BEGIN
  IF NOT platform.puede('cargar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT platform.tenant_habilitado(v_tenant) THEN
    RAISE EXCEPTION 'suscripcion_inactiva' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN ('precios','stock','maestra','ventas','costos') THEN
    RAISE EXCEPTION 'tipo_archivo_invalido' USING ERRCODE = '22023';
  END IF;

  -- Mismo archivo ya cargado antes: se avisa, no se bloquea. Puede ser
  -- legítimo (recarga tras corregir la base) pero nunca debe pasar
  -- desapercibido: así se duplicó la venta en la 15.3.
  SELECT count(*) INTO v_previo
    FROM ingest.archivo WHERE tenant_id = v_tenant AND sha256 = p_sha256;

  INSERT INTO ingest.archivo (tenant_id, tipo, nombre_original, sha256, bytes,
                              storage_path, subido_por)
       VALUES (v_tenant, p_tipo, p_nombre, p_sha256, p_bytes,
               p_storage_path, platform.usuario_actual())
    RETURNING id INTO v_archivo;

  INSERT INTO ingest.lote (tenant_id, archivo_id, estado,
                           motivo_rechazo)
       VALUES (v_tenant, v_archivo, 'recibido',
               CASE WHEN v_previo > 0
                    THEN 'AVISO: archivo con hash ya cargado ' || v_previo || ' vez(ces)' END)
    RETURNING id INTO v_lote;

  RETURN v_lote;
END $$;

-- ─── Metas por ejecutivo ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.set_meta(
  p_ejecutivo TEXT, p_mes DATE, p_monto NUMERIC
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('ver_gerencia') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT platform.capacidad_activa('metas_ejecutivo') THEN
    RAISE EXCEPTION 'capacidad_desactivada' USING ERRCODE = '0A000';
  END IF;
  INSERT INTO core.meta (tenant_id, ejecutivo_id, mes, monto)
       VALUES (v_tenant, p_ejecutivo, date_trunc('month', p_mes)::date, p_monto)
  ON CONFLICT (tenant_id, ejecutivo_id, mes)
    DO UPDATE SET monto = EXCLUDED.monto;
END $$;

-- ─── Focos del mes (sólo si la empresa mide por SKU) ───────────────
CREATE OR REPLACE FUNCTION api.set_foco(
  p_mes DATE, p_sku TEXT, p_meta_unidades NUMERIC, p_zona TEXT DEFAULT '*'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('ver_gerencia') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT platform.capacidad_activa('foco_sku') THEN
    RAISE EXCEPTION 'capacidad_desactivada' USING ERRCODE = '0A000';
  END IF;
  INSERT INTO core.foco (tenant_id, mes, sku, zona_id, meta_unidades)
       VALUES (v_tenant, date_trunc('month', p_mes)::date, p_sku,
               COALESCE(p_zona,'*'), p_meta_unidades)
  ON CONFLICT (tenant_id, mes, sku, zona_id)
    DO UPDATE SET meta_unidades = EXCLUDED.meta_unidades;
  UPDATE core.stock SET es_foco_mes = TRUE
   WHERE tenant_id = v_tenant AND sku = p_sku;
END $$;

-- ─── Alta y baja de ejecutivos ─────────────────────────────────────
CREATE OR REPLACE FUNCTION api.alta_ejecutivo(
  p_id TEXT, p_nombre TEXT, p_zona TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL, p_usuario UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('gestionar_usuarios') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  INSERT INTO core.ejecutivo (tenant_id, id, nombre, zona_id, email, usuario_id)
       VALUES (v_tenant, p_id, p_nombre, p_zona, p_email, p_usuario)
  ON CONFLICT (tenant_id, id) DO UPDATE
    SET nombre = EXCLUDED.nombre, zona_id = EXCLUDED.zona_id,
        email = EXCLUDED.email, usuario_id = COALESCE(EXCLUDED.usuario_id, core.ejecutivo.usuario_id),
        activo = TRUE;
END $$;

-- ─── Reasignar cliente o prospecto de zona / ejecutivo ─────────────
CREATE OR REPLACE FUNCTION api.reasignar_cliente(
  p_cliente_key TEXT, p_zona TEXT DEFAULT NULL, p_ejecutivo TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('gestionar_zonas') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE core.cliente
     SET zona_id      = COALESCE(p_zona, zona_id),
         ejecutivo_id = COALESCE(p_ejecutivo, ejecutivo_id),
         actualizado_en = now()
   WHERE tenant_id = v_tenant AND cliente_key = p_cliente_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_no_encontrado' USING ERRCODE = 'P0002';
  END IF;
END $$;

COMMENT ON FUNCTION api.reasignar_cliente(TEXT, TEXT, TEXT) IS
  'OJO: la próxima carga de la maestra PISA esta reasignación, porque
   la maestra manda. Si el cambio es permanente hay que corregir el
   archivo, no la base. El dashboard debe decirlo al confirmar.';

-- ─── Zonas y comunas ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.set_zona_comuna(p_comuna TEXT, p_zona TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT platform.puede('gestionar_zonas') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  INSERT INTO core.zona_comuna (tenant_id, comuna, zona_id)
       VALUES (v_tenant, upper(trim(p_comuna)), p_zona)
  ON CONFLICT (tenant_id, comuna) DO UPDATE SET zona_id = EXCLUDED.zona_id;
END $$;


-- ─── Cargar filas del archivo al lote ──────────────────────────────
-- El dashboard sube el Excel, lo parsea en el navegador y manda las
-- filas TAL CUAL. La interpretación es del pipeline, no del front.
CREATE OR REPLACE FUNCTION api.agregar_filas(p_lote UUID, p_filas JSONB)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ingest, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_n INTEGER; v_base INTEGER;
BEGIN
  IF NOT platform.puede('cargar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ingest.lote l
                  WHERE l.id = p_lote AND l.tenant_id = v_tenant
                    AND l.estado = 'recibido') THEN
    RAISE EXCEPTION 'lote_no_disponible' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'filas_debe_ser_arreglo' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(nro_fila), 0) INTO v_base
    FROM ingest.fila_cruda WHERE lote_id = p_lote;

  INSERT INTO ingest.fila_cruda (lote_id, nro_fila, datos)
  SELECT p_lote, v_base + ordinalidad, f
    FROM jsonb_array_elements(p_filas) WITH ORDINALITY AS t(f, ordinalidad)
  ON CONFLICT (lote_id, nro_fila) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE ingest.lote SET filas_leidas = filas_leidas + v_n WHERE id = p_lote;
  RETURN v_n;
END $$;

-- La compuerta (api.publicar_lote) vive en 025_ingest_publicacion.sql,
-- junto con el respaldo y la reversión. Un objeto, un archivo.

-- ─── Baja de ejecutivo ─────────────────────────────────────────────
-- No se borra: la venta histórica quedaría sin dueño.
CREATE OR REPLACE FUNCTION api.baja_ejecutivo(
  p_id TEXT, p_reasignar_a TEXT DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_n INTEGER := 0;
BEGIN
  IF NOT platform.puede('gestionar_usuarios') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_reasignar_a IS NOT NULL THEN
    UPDATE core.cliente SET ejecutivo_id = p_reasignar_a, actualizado_en = now()
     WHERE tenant_id = v_tenant AND ejecutivo_id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  UPDATE core.ejecutivo SET activo = FALSE, usuario_id = NULL
   WHERE tenant_id = v_tenant AND id = p_id;
  UPDATE platform.membresias m SET activo = FALSE
    FROM core.ejecutivo e
   WHERE e.tenant_id = v_tenant AND e.id = p_id
     AND m.usuario_id = e.usuario_id AND m.tenant_id = v_tenant;
  RETURN v_n;
END $$;

-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  B · CONSOLA DE PLATAFORMA · sólo superadmin                  ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- Función y no vista: tiene que leer TODAS las empresas, y las
-- políticas RLS de core impiden eso a propósito. La única llave es
-- es_superadmin(), verificada acá adentro.
CREATE OR REPLACE FUNCTION api.admin_empresas()
RETURNS TABLE (
  tenant_id UUID, slug TEXT, empresa TEXT, activo BOOLEAN,
  plan TEXT, estado TEXT, vigente_hasta DATE, dias_restantes INTEGER,
  habilitado BOOLEAN, usuarios BIGINT, clientes BIGINT,
  venta_mtd NUMERIC, ultima_carga TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform, core, ingest AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT t.id, t.slug, t.nombre, t.activo,
         s.plan, s.estado, s.vigente_hasta,
         (s.vigente_hasta - current_date)::int,
         platform.tenant_habilitado(t.id),
         (SELECT count(*) FROM platform.membresias m WHERE m.tenant_id = t.id AND m.activo),
         (SELECT count(*) FROM core.cliente c WHERE c.tenant_id = t.id AND c.activo),
         (SELECT COALESCE(sum(v.monto_neto),0) FROM core.venta_linea v
           WHERE v.tenant_id = t.id AND v.fecha >= date_trunc('month', current_date)::date),
         (SELECT max(a.subido_en) FROM ingest.archivo a WHERE a.tenant_id = t.id)
    FROM platform.tenants t
    LEFT JOIN platform.suscripcion s ON s.tenant_id = t.id
   ORDER BY t.nombre;
END $$;

CREATE OR REPLACE FUNCTION api.admin_alta_empresa(
  p_slug TEXT, p_nombre TEXT, p_plan TEXT DEFAULT 'base',
  p_dias_trial INTEGER DEFAULT 30, p_color TEXT DEFAULT '#39ff14'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  INSERT INTO platform.tenants (slug, nombre, color)
       VALUES (p_slug, p_nombre, p_color) RETURNING id INTO v_id;
  INSERT INTO platform.suscripcion (tenant_id, plan, estado, vigente_hasta)
       VALUES (v_id, p_plan, 'trial', current_date + p_dias_trial);
  PERFORM platform.sembrar_capacidades(v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION api.admin_set_suscripcion(
  p_tenant UUID, p_estado TEXT, p_vigente_hasta DATE DEFAULT NULL,
  p_nota TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE platform.suscripcion
     SET estado = p_estado,
         vigente_hasta = COALESCE(p_vigente_hasta, vigente_hasta),
         notas = COALESCE(p_nota, notas),
         actualizado_en = now()
   WHERE tenant_id = p_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'empresa_sin_suscripcion' USING ERRCODE = 'P0002';
  END IF;
END $$;

COMMENT ON FUNCTION api.admin_set_suscripcion(UUID, TEXT, DATE, TEXT) IS
  'Poner estado = suspendida corta el acceso de esa empresa por
   completo y de inmediato: app, dashboard, catálogo y consultas
   directas. El corte vive en la RLS, no en la interfaz.';

CREATE OR REPLACE FUNCTION api.admin_registrar_pago(
  p_tenant UUID, p_periodo DATE, p_monto NUMERIC,
  p_referencia TEXT DEFAULT NULL, p_meses INTEGER DEFAULT 1
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  INSERT INTO platform.pago (tenant_id, periodo, monto, pagado_en, referencia, registrado_por)
       VALUES (p_tenant, date_trunc('month', p_periodo)::date, p_monto,
               current_date, p_referencia, platform.usuario_actual())
  ON CONFLICT (tenant_id, periodo) DO UPDATE
    SET monto = EXCLUDED.monto, pagado_en = EXCLUDED.pagado_en,
        referencia = EXCLUDED.referencia;

  UPDATE platform.suscripcion
     SET estado = 'activa',
         vigente_hasta = GREATEST(vigente_hasta, current_date)
                         + (p_meses || ' months')::interval,
         actualizado_en = now()
   WHERE tenant_id = p_tenant;
END $$;

CREATE OR REPLACE FUNCTION api.admin_set_capacidad(
  p_tenant UUID, p_capacidad TEXT, p_activa BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  INSERT INTO platform.tenant_capacidad (tenant_id, capacidad, activa)
       VALUES (p_tenant, p_capacidad, p_activa)
  ON CONFLICT (tenant_id, capacidad) DO UPDATE SET activa = EXCLUDED.activa;
END $$;

-- ─── Permisos ──────────────────────────────────────────────────────
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.registrar_carga(TEXT,TEXT,TEXT,BIGINT,TEXT)',
    'api.set_meta(TEXT,DATE,NUMERIC)',
    'api.set_foco(DATE,TEXT,NUMERIC,TEXT)',
    'api.alta_ejecutivo(TEXT,TEXT,TEXT,TEXT,UUID)',
    'api.reasignar_cliente(TEXT,TEXT,TEXT)',
    'api.set_zona_comuna(TEXT,TEXT)',
    'api.agregar_filas(UUID,JSONB)',
    'api.baja_ejecutivo(TEXT,TEXT)',
    'api.admin_empresas()',
    'api.admin_alta_empresa(TEXT,TEXT,TEXT,INTEGER,TEXT)',
    'api.admin_set_suscripcion(UUID,TEXT,DATE,TEXT)',
    'api.admin_registrar_pago(UUID,DATE,NUMERIC,TEXT,INTEGER)',
    'api.admin_set_capacidad(UUID,TEXT,BOOLEAN)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

GRANT SELECT ON api.mis_capacidades, api.mi_suscripcion,
                api.cargas, api.carga_exclusiones TO authenticated;
GRANT USAGE  ON SCHEMA ingest TO authenticated;
GRANT SELECT ON ingest.lote, ingest.archivo, ingest.exclusion,
                ingest.reconciliacion TO authenticated;
