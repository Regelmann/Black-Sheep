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
  imagen_url TEXT, precio_unidad NUMERIC, precio_caja NUMERIC, hay_stock BOOLEAN
)
-- VOLATILE (no STABLE): registra el acceso al token. Un catálogo que
-- no deja rastro de quién lo abrió no sirve como evidencia.
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, api, public, extensions AS $$
DECLARE v_hash TEXT; v_tok core.catalog_token%ROWTYPE;
BEGIN
  -- Validación de formato ANTES de tocar la base.
  IF p_token IS NULL OR length(p_token) NOT BETWEEN 20 AND 128
     OR p_token !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;

  IF NOT api.rate_limit_ok('cat:' || left(p_token, 12)) THEN
    RAISE EXCEPTION 'demasiados_intentos' USING ERRCODE = '53400';
  END IF;

  v_hash := api.hash_token(p_token);

  SELECT * INTO v_tok FROM core.catalog_token t
   WHERE t.token_hash = v_hash
     AND t.revocado_en IS NULL
     AND t.expira_en > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;

  UPDATE core.catalog_token
     SET ultimo_acceso = now(), accesos = accesos + 1
   WHERE id = v_tok.id;

  -- EL PRECIO QUE VE EL CLIENTE ES **SU** PRECIO.
  -- Si tiene negociado $800 sobre una lista de $1.000, acá dice $800.
  -- Mandarle la lista es una llamada de reclamo o una venta perdida.
  -- El SKU sin historial ni acuerdo sale a lista, que es lo correcto.
  RETURN QUERY
  SELECT sv.sku, sv.nombre, sv.categoria, sv.marca, sv.unidad_venta,
         sv.imagen_url,
         pp.precio,
         CASE WHEN sv.precio_caja IS NOT NULL AND sv.precio_unidad > 0
              THEN round(pp.precio * sv.precio_caja / sv.precio_unidad) END,
         sv.stock_total > 0
    FROM core.oferta_cliente o
    CROSS JOIN LATERAL unnest(o.skus) AS s(sku)
    JOIN api.stock_vendible sv
      ON sv.tenant_id = o.tenant_id AND sv.sku = s.sku
    CROSS JOIN LATERAL core.precio_para_cliente(v_tok.tenant_id, v_tok.cliente_key, sv.sku) pp
   WHERE o.tenant_id = v_tok.tenant_id
     AND o.cliente_key = v_tok.cliente_key
     AND o.activo
     AND sv.es_vendible
     AND pp.precio IS NOT NULL;
END $$;

COMMENT ON FUNCTION api.get_catalogo(TEXT) IS
  'Devuelve SÓLO productos publicados para ese cliente. El token nunca
   alcanza para leer nada más: ni cartera, ni precios de otros, ni
   datos de contacto.';

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
REVOKE ALL ON FUNCTION api.crear_pedido_publico(TEXT, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION api.emitir_token_catalogo(TEXT)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION api.revocar_token_catalogo(UUID)                FROM PUBLIC;
REVOKE ALL ON FUNCTION api.rate_limit_ok(TEXT, INTEGER)                FROM PUBLIC;
REVOKE ALL ON FUNCTION api.hash_token(TEXT)                            FROM PUBLIC;

GRANT EXECUTE ON FUNCTION api.get_catalogo(TEXT)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION api.crear_pedido_publico(TEXT, JSONB, TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION api.emitir_token_catalogo(TEXT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION api.revocar_token_catalogo(UUID)               TO authenticated;
