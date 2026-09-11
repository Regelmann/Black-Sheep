-- ═══════════════════════════════════════════════════════════════════
-- 014 · CATÁLOGO PÚBLICO Y PEDIDO SIN SESIÓN
--
-- La única superficie que toca internet sin sesión. Se trata como tal.
--
-- UNA función por objeto, en UN archivo (regla 5 / guard R8). En la
-- 15.3 `get_public_catalogo` estaba definida en cuatro archivos y la
-- que quedaba viva era la del último script ejecutado. Nadie sabía cuál.
-- ═══════════════════════════════════════════════════════════════════

-- NOTA · pgcrypto (digest, gen_random_bytes) vive en `public` en una
-- instalación estándar y en `extensions` en Supabase. Las funciones de
-- este archivo listan AMBOS en su search_path: fijarlo es obligatorio
-- por seguridad, pero fijarlo mal deja la función rota en un entorno.
CREATE OR REPLACE FUNCTION api.hash_token(p_token TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, extensions AS $$
  SELECT encode(digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');
$$;

-- Rate limit: ventana de 1 minuto por clave (token o IP).
CREATE OR REPLACE FUNCTION api.rate_limit_ok(p_key TEXT, p_max INTEGER DEFAULT 30)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, core, public, extensions AS $$
DECLARE v_ventana TIMESTAMPTZ := date_trunc('minute', now());
        v_n INTEGER;
BEGIN
  INSERT INTO core.rate_limit (bucket_key, ventana, intentos)
       VALUES (p_key, v_ventana, 1)
  ON CONFLICT (bucket_key, ventana)
    DO UPDATE SET intentos = core.rate_limit.intentos + 1
  RETURNING intentos INTO v_n;
  RETURN v_n <= p_max;
END $$;

-- ─── Catálogo ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.get_catalogo(p_token TEXT)
RETURNS TABLE (
  sku TEXT, nombre TEXT, categoria TEXT, marca TEXT, unidad_venta TEXT,
  imagen_url TEXT, precio NUMERIC, precio_lista NUMERIC, origen_precio TEXT,
  hay_stock BOOLEAN, habitual BOOLEAN, compras_6m BIGINT,
  ultima_compra DATE, sugerido BOOLEAN
)
-- VOLATILE (no STABLE): registra el acceso al token. Un catálogo que no
-- deja rastro de quién lo abrió no sirve como evidencia.
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, api, public, extensions AS $$
DECLARE v_tok core.catalog_token%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{20,128}$' THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;
  IF NOT api.rate_limit_ok('cat:' || left(p_token, 12)) THEN
    RAISE EXCEPTION 'demasiados_intentos' USING ERRCODE = '53400';
  END IF;

  SELECT * INTO v_tok FROM core.catalog_token t
   WHERE t.token_hash = api.hash_token(p_token)
     AND t.revocado_en IS NULL
     AND t.expira_en > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;

  UPDATE core.catalog_token
     SET ultimo_acceso = now(), accesos = accesos + 1
   WHERE id = v_tok.id;

  -- EL PRECIO QUE VE EL CLIENTE ES **SU** PRECIO (007).
  --
  -- Y el catálogo NO se limita a lo que alguien le curó: un comprador
  -- de restaurante repone lo de siempre y de vez en cuando agrega algo.
  -- Se devuelve todo lo vendible marcando qué compra habitualmente,
  -- para poder ponerlo primero. Esconderle el resto es perder la venta
  -- que justifica tener un catálogo.
  RETURN QUERY
  WITH historial AS (
    SELECT v.sku, count(*) AS veces, max(v.fecha) AS ultima
      FROM core.venta_linea v
     WHERE v.tenant_id = v_tok.tenant_id
       AND v.cliente_key = v_tok.cliente_key
       AND v.monto_neto > 0
       AND v.fecha >= current_date - interval '6 months'
     GROUP BY v.sku
  ), sugeridos AS (
    SELECT unnest(o.skus) AS sku
      FROM core.oferta_cliente o
     WHERE o.tenant_id = v_tok.tenant_id
       AND o.cliente_key = v_tok.cliente_key
       AND o.activo
  )
  SELECT sv.sku, sv.nombre, sv.categoria, sv.marca, sv.unidad_venta,
         sv.imagen_url, pp.precio, pp.precio_lista, pp.origen,
         sv.stock_total > 0,
         h.sku IS NOT NULL,
         COALESCE(h.veces, 0),
         h.ultima,
         g.sku IS NOT NULL
    FROM api.stock_vendible sv
    CROSS JOIN LATERAL core.precio_para_cliente(v_tok.tenant_id, v_tok.cliente_key, sv.sku) pp
    LEFT JOIN historial h ON h.sku = sv.sku
    LEFT JOIN sugeridos g ON g.sku = sv.sku
   WHERE sv.tenant_id = v_tok.tenant_id
     AND sv.es_vendible
     AND pp.precio IS NOT NULL
   ORDER BY (h.sku IS NOT NULL) DESC, h.veces DESC NULLS LAST,
            (g.sku IS NOT NULL) DESC, sv.categoria NULLS LAST, sv.nombre;
END $$;

COMMENT ON FUNCTION api.get_catalogo(TEXT) IS
  'Todo lo vendible con el precio de ESE cliente, marcando lo habitual
   para mostrarlo primero. El token no alcanza para leer nada más: ni
   cartera, ni precios de otros, ni datos de contacto.';

-- ─── La cabecera: de quién es el catálogo y para quién ─────────────
CREATE OR REPLACE FUNCTION api.get_catalogo_cabecera(p_token TEXT)
RETURNS TABLE (
  empresa TEXT, color TEXT, logo_url TEXT, cliente TEXT,
  expira_en TIMESTAMPTZ, habituales BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, platform, api, public, extensions AS $$
DECLARE v_tok core.catalog_token%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{20,128}$' THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_tok FROM core.catalog_token t
   WHERE t.token_hash = api.hash_token(p_token)
     AND t.revocado_en IS NULL AND t.expira_en > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT t.nombre, t.color, t.logo_url,
         COALESCE(c.nombre, v_tok.cliente_key),
         v_tok.expira_en,
         (SELECT count(DISTINCT v.sku) FROM core.venta_linea v
           WHERE v.tenant_id = v_tok.tenant_id
             AND v.cliente_key = v_tok.cliente_key
             AND v.fecha >= current_date - interval '6 months'
             AND v.monto_neto > 0)
    FROM platform.tenants t
    LEFT JOIN core.cliente c
      ON c.tenant_id = v_tok.tenant_id AND c.cliente_key = v_tok.cliente_key
   WHERE t.id = v_tok.tenant_id;
END $$;

COMMENT ON FUNCTION api.get_catalogo_cabecera(TEXT) IS
  'Lo abre alguien que NO conoce Black Sheep: tiene que ver la marca de
   SU proveedor y su propio nombre. Devuelve sólo lo del encabezado.';

-- ─── Pedido público ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.crear_pedido_publico(
  p_token  TEXT,
  p_lineas JSONB,
  p_nota   TEXT DEFAULT NULL,
  p_client_op_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, api, public, extensions AS $$
DECLARE v_hash TEXT; v_tok core.catalog_token%ROWTYPE;
        v_total NUMERIC := 0; v_id UUID; v_op UUID := COALESCE(p_client_op_id, gen_random_uuid());
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{20,128}$' THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;
  IF NOT api.rate_limit_ok('ped:' || left(p_token, 12), 10) THEN
    RAISE EXCEPTION 'demasiados_intentos' USING ERRCODE = '53400';
  END IF;
  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'pedido_vacio' USING ERRCODE = '22023';
  END IF;

  v_hash := api.hash_token(p_token);
  SELECT * INTO v_tok FROM core.catalog_token t
   WHERE t.token_hash = v_hash AND t.revocado_en IS NULL AND t.expira_en > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;

  -- El precio se recalcula SIEMPRE en el servidor: lo que manda el
  -- cliente es una intención, no un dato.
  -- MISMA función que usó el catálogo: si mostró $800, cobra $800.
  -- Duplicar el cálculo es cómo se llega a un pedido que no cuadra con
  -- lo que el cliente vio en pantalla.
  SELECT COALESCE(sum((l->>'cantidad')::numeric * COALESCE(pp.precio, 0)), 0)
    INTO v_total
    FROM jsonb_array_elements(p_lineas) l
    CROSS JOIN LATERAL core.precio_para_cliente(
      v_tok.tenant_id, v_tok.cliente_key, l->>'sku') pp;

  INSERT INTO core.pedido (tenant_id, client_op_id, cliente_key, origen,
                           lineas, nota, total_estimado)
       VALUES (v_tok.tenant_id, v_op, v_tok.cliente_key, 'catalogo_publico',
               p_lineas, p_nota, v_total)
  ON CONFLICT (tenant_id, client_op_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN                       -- idempotencia (D-13)
    SELECT id INTO v_id FROM core.pedido
     WHERE tenant_id = v_tok.tenant_id AND client_op_id = v_op;
  END IF;

  RETURN v_id;
END $$;

-- ─── Emisión y revocación de tokens (con sesión) ───────────────────
CREATE OR REPLACE FUNCTION api.emitir_token_catalogo(p_cliente_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform, api, public, extensions AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_token TEXT;
BEGIN
  IF NOT platform.puede('emitir_catalogo') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  v_token := replace(replace(encode(gen_random_bytes(32),'base64'),'+','-'),'/','_');
  v_token := replace(v_token, '=', '');

  INSERT INTO core.catalog_token (tenant_id, token_hash, cliente_key, creado_por)
       VALUES (v_tenant, api.hash_token(v_token), p_cliente_key, platform.usuario_actual());

  RETURN v_token;   -- se muestra UNA vez. Después sólo existe el hash.
END $$;

CREATE OR REPLACE FUNCTION api.revocar_token_catalogo(p_token_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform, public, extensions AS $$
BEGIN
  IF NOT platform.puede('emitir_catalogo') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE core.catalog_token SET revocado_en = now()
   WHERE id = p_token_id AND tenant_id = platform.tenant_actual();
END $$;

REVOKE ALL ON FUNCTION api.get_catalogo(TEXT)                          FROM PUBLIC;
REVOKE ALL ON FUNCTION api.get_catalogo_cabecera(TEXT)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION api.crear_pedido_publico(TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.emitir_token_catalogo(TEXT)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION api.revocar_token_catalogo(UUID)                FROM PUBLIC;
REVOKE ALL ON FUNCTION api.rate_limit_ok(TEXT, INTEGER)                FROM PUBLIC;
REVOKE ALL ON FUNCTION api.hash_token(TEXT)                            FROM PUBLIC;

GRANT EXECUTE ON FUNCTION api.get_catalogo(TEXT)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_catalogo_cabecera(TEXT)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION api.crear_pedido_publico(TEXT, JSONB, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION api.emitir_token_catalogo(TEXT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION api.revocar_token_catalogo(UUID)               TO authenticated;
