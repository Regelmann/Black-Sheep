-- ═══════════════════════════════════════════════════════════════════
-- 032 · EL CATÁLOGO DEL CLIENTE · una sola llamada
--
-- Quien abre este enlace NO explora: repone. Es el encargado de compras
-- de un restaurante que ya sabe qué pide. Por eso lo primero que tiene
-- que ver es LO QUE COMPRA SIEMPRE, con la cantidad que suele pedir, y
-- no una grilla de productos ordenada alfabéticamente.
--
-- Todo en UNA llamada: marca de la empresa, datos del cliente, su
-- historial y el catálogo con SU precio. Cuatro viajes contra un
-- teléfono en 3G es medio segundo de pantalla en blanco por viaje.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION api.catalogo(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, api, platform, public, extensions AS $$
DECLARE v_tok core.catalog_token%ROWTYPE; v_hash TEXT; v_out JSONB;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{20,128}$' THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;
  IF NOT api.rate_limit_ok('cat:' || left(p_token, 12)) THEN
    RAISE EXCEPTION 'demasiados_intentos' USING ERRCODE = '53400';
  END IF;

  v_hash := api.hash_token(p_token);
  SELECT * INTO v_tok FROM core.catalog_token t
   WHERE t.token_hash = v_hash AND t.revocado_en IS NULL AND t.expira_en > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = '28000';
  END IF;

  UPDATE core.catalog_token
     SET ultimo_acceso = now(), accesos = accesos + 1 WHERE id = v_tok.id;

  SELECT jsonb_build_object(
    'empresa', (SELECT jsonb_build_object('nombre', t.nombre, 'color', t.color,
                                          'logo_url', t.logo_url)
                  FROM platform.tenants t WHERE t.id = v_tok.tenant_id),
    'cliente', (SELECT jsonb_build_object('nombre', c.nombre, 'comuna', c.comuna)
                  FROM core.cliente c
                 WHERE c.tenant_id = v_tok.tenant_id AND c.cliente_key = v_tok.cliente_key),

    -- LO QUE COMPRA SIEMPRE. Últimos 6 meses, ordenado por frecuencia y
    -- no por fecha: lo que más repite es lo que más va a repetir.
    'habituales', (
      SELECT COALESCE(jsonb_agg(h ORDER BY (h->>'veces')::int DESC,
                                (h->>'ultima')::date DESC), '[]')
        FROM (
          SELECT jsonb_build_object(
                   'sku', v.sku,
                   'veces', count(*)::int,
                   'ultima', max(v.fecha),
                   'cantidad_habitual', round(percentile_cont(0.5)
                       WITHIN GROUP (ORDER BY v.cantidad))::numeric
                 ) AS h
            FROM core.venta_linea v
           WHERE v.tenant_id = v_tok.tenant_id
             AND v.cliente_key = v_tok.cliente_key
             AND v.monto_neto > 0 AND v.cantidad > 0
             AND v.fecha >= current_date - interval '6 months'
           GROUP BY v.sku
        ) s),

    -- OFERTAS · lo que la empresa quiere mover: remate, stock parado o
    -- algo por vencer. Filtradas por rubro cuando corresponde.
    'ofertas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'sku', o.sku, 'motivo', o.motivo, 'detalle', o.detalle,
               'fecha_venc', o.fecha_venc, 'precio_oferta', o.precio_oferta
             ) ORDER BY o.creado_en DESC), '[]')
        FROM core.oferta o
        LEFT JOIN core.cliente cl
          ON cl.tenant_id = v_tok.tenant_id AND cl.cliente_key = v_tok.cliente_key
       WHERE o.tenant_id = v_tok.tenant_id
         AND o.vigente_desde <= current_date
         AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date)
         AND (o.rubros IS NULL OR cl.rubro = ANY(o.rubros))),

    -- SUGERENCIAS POR RUBRO · qué compran los otros locales del mismo
    -- giro que este cliente todavía no pide.
    'sugerencias', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'sku', s.sku, 'clientes', s.clientes_del_rubro,
               'penetracion', s.penetracion) ORDER BY s.clientes_del_rubro DESC), '[]')
        FROM core.sugerencias_rubro(v_tok.tenant_id, v_tok.cliente_key, 8) s),

    -- El catálogo, con SU precio. Si tiene oferta publicada, sólo eso;
    -- si no, todo lo vendible: un catálogo vacío no vende nada.
    'productos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'sku', sv.sku, 'nombre', sv.nombre,
               'categoria', sv.categoria, 'marca', sv.marca,
               'unidad', sv.unidad_venta, 'imagen', sv.imagen_url,
               'precio', pp.precio,
               'precio_lista', pp.precio_lista,
               'origen_precio', pp.origen,
               'hay_stock', sv.stock_total > 0
             ) ORDER BY sv.nombre), '[]')
        FROM api.stock_vendible sv
        CROSS JOIN LATERAL core.precio_para_cliente(
          v_tok.tenant_id, v_tok.cliente_key, sv.sku) pp
       WHERE sv.tenant_id = v_tok.tenant_id
         AND sv.es_vendible
         AND pp.precio IS NOT NULL
         AND (NOT EXISTS (SELECT 1 FROM core.oferta_cliente o
                           WHERE o.tenant_id = v_tok.tenant_id
                             AND o.cliente_key = v_tok.cliente_key AND o.activo)
              OR EXISTS (SELECT 1 FROM core.oferta_cliente o
                          WHERE o.tenant_id = v_tok.tenant_id
                            AND o.cliente_key = v_tok.cliente_key
                            AND o.activo
                            AND sv.sku = ANY(o.skus))))
  ) INTO v_out;

  RETURN v_out;
END $$;

COMMENT ON FUNCTION api.catalogo(TEXT) IS
  'Devuelve marca, cliente, habituales y catálogo en UNA llamada. Los
   habituales salen del histórico de venta del propio cliente, con la
   cantidad MEDIANA que suele pedir: el promedio lo distorsiona una
   compra grande de una vez.';

REVOKE ALL ON FUNCTION api.catalogo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.catalogo(TEXT) TO anon, authenticated;

-- ─── Emitir el enlace desde Gerencia ───────────────────────────────
CREATE OR REPLACE VIEW api.enlaces_catalogo
WITH (security_invoker = true) AS
SELECT ct.id, ct.tenant_id, ct.cliente_key, c.nombre AS cliente,
       ct.creado_en, ct.expira_en, ct.revocado_en,
       ct.ultimo_acceso, ct.accesos,
       (ct.revocado_en IS NULL AND ct.expira_en > now()) AS vigente
  FROM core.catalog_token ct
  LEFT JOIN core.cliente c
    ON c.tenant_id = ct.tenant_id AND c.cliente_key = ct.cliente_key;

GRANT SELECT ON api.enlaces_catalogo TO authenticated;
