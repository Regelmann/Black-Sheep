-- ═══════════════════════════════════════════════════════════════════
-- 028 · API DE TERRENO
--
-- Lo que la app del vendedor puede escribir. Todo lleva `client_op_id`
-- (D-13): el teléfono genera el UUID y el servidor aplica ON CONFLICT
-- DO NOTHING. Reintentar diez veces produce UN registro.
--
-- El ejecutivo sólo toca SU cartera. No es un filtro en la pantalla:
-- estas funciones lo verifican contra core.ejecutivo antes de escribir.
-- ═══════════════════════════════════════════════════════════════════

/** ¿Este cliente es del ejecutivo que está pidiendo? */
CREATE OR REPLACE FUNCTION core.es_mi_cliente(p_cliente_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
  SELECT EXISTS (
    SELECT 1 FROM core.cliente c
     WHERE c.tenant_id = platform.tenant_actual()
       AND c.cliente_key = p_cliente_key
       AND (
         -- gerencia y administración ven toda la cartera
         platform.puede('ver_gerencia')
         OR c.ejecutivo_id IN (
           SELECT e.id FROM core.ejecutivo e
            WHERE e.tenant_id = c.tenant_id
              AND e.usuario_id = platform.usuario_actual()
         )
       )
  );
$$;
REVOKE ALL ON FUNCTION core.es_mi_cliente(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.es_mi_cliente(TEXT) TO authenticated;

/** El código de ejecutivo del usuario de la sesión. */
CREATE OR REPLACE FUNCTION core.mi_ejecutivo()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
  SELECT e.id FROM core.ejecutivo e
   WHERE e.tenant_id = platform.tenant_actual()
     AND e.usuario_id = platform.usuario_actual()
     AND e.activo
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION core.mi_ejecutivo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.mi_ejecutivo() TO authenticated;

-- ─── Visita ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.registrar_visita(
  p_client_op_id UUID, p_cliente_key TEXT,
  p_estado TEXT DEFAULT 'visitada', p_resultado TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_id UUID; v_eje TEXT;
BEGIN
  IF NOT platform.puede('registrar_visita') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT core.es_mi_cliente(p_cliente_key) THEN
    RAISE EXCEPTION 'cliente_ajeno' USING ERRCODE = '42501';
  END IF;
  v_eje := COALESCE(core.mi_ejecutivo(),
                    (SELECT ejecutivo_id FROM core.cliente
                      WHERE tenant_id = v_tenant AND cliente_key = p_cliente_key));

  INSERT INTO core.visita (tenant_id, client_op_id, cliente_key, ejecutivo_id,
                           estado, resultado)
       VALUES (v_tenant, p_client_op_id, p_cliente_key, v_eje, p_estado, p_resultado)
  ON CONFLICT (tenant_id, client_op_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN   -- ya estaba: el reintento devuelve lo mismo
    SELECT id INTO v_id FROM core.visita
     WHERE tenant_id = v_tenant AND client_op_id = p_client_op_id;
  END IF;
  RETURN v_id;
END $$;

-- ─── Check-in ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.registrar_checkin(
  p_client_op_id UUID, p_cliente_key TEXT,
  p_lat DOUBLE PRECISION DEFAULT NULL, p_lng DOUBLE PRECISION DEFAULT NULL,
  p_precision_m NUMERIC DEFAULT NULL, p_visita_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_id UUID;
        v_eje TEXT; v_dist NUMERIC; v_lat DOUBLE PRECISION; v_lng DOUBLE PRECISION;
BEGIN
  IF NOT platform.puede('registrar_visita') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT core.es_mi_cliente(p_cliente_key) THEN
    RAISE EXCEPTION 'cliente_ajeno' USING ERRCODE = '42501';
  END IF;
  -- El GPS del trabajador es dato personal: se guarda sólo si la
  -- empresa tiene contratada la verificación por posición (021).
  IF NOT platform.capacidad_activa('checkin_gps') THEN
    p_lat := NULL; p_lng := NULL; p_precision_m := NULL;
  END IF;

  SELECT lat, lng INTO v_lat, v_lng FROM core.cliente
   WHERE tenant_id = v_tenant AND cliente_key = p_cliente_key;

  -- Distancia aproximada en metros. Sirve para marcar el check-in como
  -- verificado, no para vigilar a nadie.
  IF p_lat IS NOT NULL AND v_lat IS NOT NULL THEN
    v_dist := 6371000 * acos(LEAST(1, GREATEST(-1,
      cos(radians(v_lat)) * cos(radians(p_lat)) *
      cos(radians(p_lng) - radians(v_lng)) +
      sin(radians(v_lat)) * sin(radians(p_lat)))));
  END IF;

  v_eje := core.mi_ejecutivo();

  INSERT INTO core.checkin (tenant_id, client_op_id, visita_id, cliente_key,
                            ejecutivo_id, lat, lng, precision_m, distancia_m, verificado)
       VALUES (v_tenant, p_client_op_id, p_visita_id, p_cliente_key,
               COALESCE(v_eje, '?'), p_lat, p_lng, p_precision_m, v_dist,
               v_dist IS NOT NULL AND v_dist <= 200)
  ON CONFLICT (tenant_id, client_op_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM core.checkin
     WHERE tenant_id = v_tenant AND client_op_id = p_client_op_id;
  END IF;
  RETURN v_id;
END $$;

-- ─── Nota ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.registrar_nota(
  p_client_op_id UUID, p_cliente_key TEXT, p_texto TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_id UUID;
BEGIN
  IF NOT platform.puede('registrar_visita') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT core.es_mi_cliente(p_cliente_key) THEN
    RAISE EXCEPTION 'cliente_ajeno' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(trim(p_texto),'') IS NULL THEN
    RAISE EXCEPTION 'nota_vacia' USING ERRCODE = '22023';
  END IF;

  INSERT INTO core.nota_cliente (tenant_id, client_op_id, cliente_key,
                                 ejecutivo_id, texto)
       VALUES (v_tenant, p_client_op_id, p_cliente_key,
               COALESCE(core.mi_ejecutivo(), '?'), trim(p_texto))
  ON CONFLICT (tenant_id, client_op_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM core.nota_cliente
     WHERE tenant_id = v_tenant AND client_op_id = p_client_op_id;
  END IF;
  RETURN v_id;
END $$;

-- ─── Pedido ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.crear_pedido(
  p_client_op_id UUID, p_cliente_key TEXT, p_lineas JSONB,
  p_nota TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_id UUID; v_total NUMERIC;
BEGIN
  IF NOT platform.puede('crear_pedido') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT core.es_mi_cliente(p_cliente_key) THEN
    RAISE EXCEPTION 'cliente_ajeno' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'pedido_vacio' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM core.cliente
              WHERE tenant_id = v_tenant AND cliente_key = p_cliente_key
                AND es_bloqueado) THEN
    RAISE EXCEPTION 'cliente_bloqueado' USING ERRCODE = '42501',
      HINT = 'Este cliente está bloqueado en la maestra.';
  END IF;

  -- El precio lo pone el SERVIDOR. Lo que manda el teléfono es una
  -- intención: el vendedor pudo haber cargado la app hace tres horas.
  SELECT COALESCE(sum((l->>'cantidad')::numeric * COALESCE(pp.precio, 0)), 0)
    INTO v_total
    FROM jsonb_array_elements(p_lineas) l
    CROSS JOIN LATERAL core.precio_para_cliente(v_tenant, p_cliente_key, l->>'sku') pp;

  INSERT INTO core.pedido (tenant_id, client_op_id, cliente_key, ejecutivo_id,
                           origen, lineas, nota, total_estimado)
       VALUES (v_tenant, p_client_op_id, p_cliente_key, core.mi_ejecutivo(),
               'app', p_lineas, p_nota, v_total)
  ON CONFLICT (tenant_id, client_op_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM core.pedido
     WHERE tenant_id = v_tenant AND client_op_id = p_client_op_id;
  END IF;
  RETURN v_id;
END $$;

-- ─── Lo que lee el vendedor ────────────────────────────────────────
CREATE OR REPLACE VIEW api.mi_cartera
WITH (security_invoker = true) AS
SELECT c.*
  FROM api.cartera c
 WHERE c.ejecutivo_id = core.mi_ejecutivo()
    OR platform.puede('ver_gerencia');

CREATE OR REPLACE VIEW api.mis_pedidos
WITH (security_invoker = true) AS
SELECT p.id, p.tenant_id, p.cliente_key, c.nombre AS cliente, p.estado,
       p.origen, p.lineas, p.total_estimado, p.nota, p.creado_en
  FROM core.pedido p
  LEFT JOIN core.cliente c
    ON c.tenant_id = p.tenant_id AND c.cliente_key = p.cliente_key
 WHERE p.ejecutivo_id = core.mi_ejecutivo()
    OR platform.puede('ver_gerencia');

GRANT SELECT ON api.mi_cartera, api.mis_pedidos TO authenticated;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.registrar_visita(UUID,TEXT,TEXT,TEXT)',
    'api.registrar_checkin(UUID,TEXT,DOUBLE PRECISION,DOUBLE PRECISION,NUMERIC,UUID)',
    'api.registrar_nota(UUID,TEXT,TEXT)',
    'api.crear_pedido(UUID,TEXT,JSONB,TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
