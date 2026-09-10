-- ═══════════════════════════════════════════════════════════════════
-- 011 · READ MODELS · lo que consumen las pantallas
--
-- D-07 · Los cálculos viven acá, no en el cliente.
-- En la 15.3, Gerencia.jsx tenía 2.360 líneas y Ruta.jsx 1.942 porque
-- calculaban sobre tablas crudas traídas con select('*'). La misma
-- métrica se calculaba distinto en dos pantallas.
--
-- Todas las vistas usan security_invoker = true: la RLS que se aplica
-- es la DEL QUE CONSULTA, no la del dueño de la vista. Sin esto una
-- vista sería un túnel por debajo del aislamiento entre empresas.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Definición ÚNICA del estado de un cliente ─────────────────────
CREATE OR REPLACE FUNCTION core.estado_cliente(
  p_dias_sin_comprar INTEGER,
  p_bloqueado BOOLEAN
) RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN p_bloqueado                THEN 'bloqueado'
    WHEN p_dias_sin_comprar IS NULL THEN 'nunca_compro'
    WHEN p_dias_sin_comprar <=  30  THEN 'activo'
    WHEN p_dias_sin_comprar <=  60  THEN 'enfriandose'
    WHEN p_dias_sin_comprar <=  90  THEN 'en_riesgo'
    WHEN p_dias_sin_comprar <= 180  THEN 'dormido'
    ELSE 'fugado'
  END;
$$;

-- ─── Métricas por cliente ──────────────────────────────────────────
CREATE OR REPLACE VIEW core.v_cliente_metricas
WITH (security_invoker = true) AS
WITH v AS (
  SELECT tenant_id, cliente_key,
         max(fecha)                                              AS ultima_compra,
         sum(monto_neto) FILTER (
           WHERE fecha >= date_trunc('month', current_date)::date) AS venta_mtd,
         sum(monto_neto) FILTER (
           WHERE fecha >= (date_trunc('month', current_date) - interval '3 months')::date
             AND fecha <   date_trunc('month', current_date)::date) / 3.0 AS promedio_3m,
         count(DISTINCT sku) FILTER (
           WHERE fecha >= (current_date - 90))                   AS skus_90d
    FROM core.venta_linea
   GROUP BY tenant_id, cliente_key
)
SELECT c.tenant_id, c.cliente_key, c.nombre, c.comuna, c.direccion,
       c.lat, c.lng, c.rubro, c.zona_id, c.ejecutivo_id,
       c.es_bloqueado, c.es_persona_natural,
       v.ultima_compra,
       (current_date - v.ultima_compra)::int                     AS dias_sin_comprar,
       COALESCE(v.venta_mtd, 0)                                  AS venta_mtd,
       COALESCE(v.promedio_3m, 0)                                AS promedio_3m,
       COALESCE(v.skus_90d, 0)                                   AS skus_90d,
       COALESCE(v.venta_mtd, 0) - COALESCE(v.promedio_3m, 0)     AS brecha,
       core.estado_cliente((current_date - v.ultima_compra)::int, c.es_bloqueado) AS estado
  FROM core.cliente c
  LEFT JOIN v ON v.tenant_id = c.tenant_id AND v.cliente_key = c.cliente_key
 WHERE c.activo;

-- ─── CARTERA ───────────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.cartera
WITH (security_invoker = true) AS
SELECT tenant_id, cliente_key, nombre, comuna, direccion, lat, lng, rubro,
       zona_id, ejecutivo_id, estado, es_bloqueado,
       ultima_compra, dias_sin_comprar, venta_mtd, promedio_3m, brecha, skus_90d
  FROM core.v_cliente_metricas;

-- ─── STOCK VENDIBLE ────────────────────────────────────────────────
-- Vendible = tiene precio Y stock > 0. Un SKU con stock y sin precio
-- es operativo, no vendible: sale marcado, no se esconde.
CREATE OR REPLACE VIEW api.stock_vendible
WITH (security_invoker = true) AS
SELECT p.tenant_id, p.sku, p.nombre, p.categoria, p.familia, p.marca,
       p.unidad_venta, p.imagen_url,
       COALESCE(s.stock_total, 0)  AS stock_total,
       s.stock_cajas, s.fecha_venc, COALESCE(s.es_foco_mes, false) AS es_foco_mes,
       pr.precio_unidad, pr.precio_caja, pr.precio_kilo,
       (pr.sku IS NOT NULL AND COALESCE(s.stock_total, 0) > 0) AS es_vendible,
       CASE WHEN pr.sku IS NULL THEN 'SIN_PRECIO_LISTA'
            WHEN COALESCE(s.stock_total, 0) <= 0 THEN 'SIN_STOCK'
            ELSE 'OK' END AS motivo_no_vendible
  FROM core.producto p
  LEFT JOIN LATERAL (
        SELECT * FROM core.stock s2
         WHERE s2.tenant_id = p.tenant_id AND s2.sku = p.sku
         ORDER BY s2.actualizado_en DESC LIMIT 1) s ON true
  LEFT JOIN LATERAL (
        SELECT * FROM core.precio p2
         WHERE p2.tenant_id = p.tenant_id AND p2.sku = p.sku
           AND p2.vigente_desde <= current_date
         ORDER BY p2.vigente_desde DESC LIMIT 1) pr ON true
 WHERE p.activo;

-- ─── MI DÍA ────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.mi_dia
WITH (security_invoker = true) AS
SELECT m.tenant_id, m.ejecutivo_id,
       sum(m.venta_mtd)                                          AS venta_mtd,
       max(mt.monto)                                             AS meta_mes,
       CASE WHEN max(mt.monto) > 0
            THEN round(100 * sum(m.venta_mtd) / max(mt.monto), 1) END AS avance_pct,
       count(*) FILTER (WHERE m.estado = 'activo')               AS clientes_activos,
       count(*)                                                  AS clientes_cartera,
       count(*) FILTER (WHERE m.brecha < 0)                      AS clientes_cayendo,
       sum(m.brecha) FILTER (WHERE m.brecha < 0)                 AS brecha_cartera
  FROM core.v_cliente_metricas m
  LEFT JOIN core.meta mt
         ON mt.tenant_id = m.tenant_id
        AND mt.ejecutivo_id = m.ejecutivo_id
        AND mt.mes = date_trunc('month', current_date)::date
 GROUP BY m.tenant_id, m.ejecutivo_id;

-- ─── A QUIÉN LLAMAR HOY ────────────────────────────────────────────
CREATE OR REPLACE VIEW api.llamar_hoy
WITH (security_invoker = true) AS
SELECT m.tenant_id, m.ejecutivo_id, m.cliente_key, m.nombre,
       m.dias_sin_comprar, m.promedio_3m, m.venta_mtd, m.brecha, m.estado
  FROM core.v_cliente_metricas m
 WHERE NOT m.es_bloqueado
   AND m.estado IN ('enfriandose','en_riesgo','dormido')
 ORDER BY m.promedio_3m DESC NULLS LAST;

-- ─── RUTA DEL DÍA ──────────────────────────────────────────────────
-- Sólo clientes ubicables. Los que no tienen coordenadas NO se
-- esconden: salen en api.integridad para que alguien los corrija.
CREATE OR REPLACE VIEW api.ruta_dia
WITH (security_invoker = true) AS
SELECT v.tenant_id, v.id AS visita_id, v.orden, v.estado AS estado_visita,
       v.ejecutivo_id, v.fecha,
       m.cliente_key, m.nombre, m.comuna, m.direccion, m.lat, m.lng,
       m.estado AS estado_cliente, m.promedio_3m,
       o.skus AS oferta_skus
  FROM core.visita v
  JOIN core.v_cliente_metricas m
    ON m.tenant_id = v.tenant_id AND m.cliente_key = v.cliente_key
  LEFT JOIN core.oferta_cliente o
    ON o.tenant_id = v.tenant_id AND o.cliente_key = v.cliente_key AND o.activo
 WHERE v.fecha = current_date
   AND m.lat IS NOT NULL AND m.lng IS NOT NULL;

-- ─── GERENCIA ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW api.gerencia_zona
WITH (security_invoker = true) AS
SELECT m.tenant_id, m.zona_id,
       sum(m.venta_mtd)                            AS venta_mtd,
       count(*)                                    AS clientes,
       count(*) FILTER (WHERE m.estado = 'activo') AS activos,
       count(*) FILTER (WHERE m.estado IN ('dormido','fugado')) AS dormidos,
       count(*) FILTER (WHERE m.brecha < 0)        AS cayendo,
       CASE WHEN count(*) > 0
            THEN round(100.0 * count(*) FILTER (WHERE m.estado='activo') / count(*), 1)
       END                                         AS cobertura_pct
  FROM core.v_cliente_metricas m
 GROUP BY m.tenant_id, m.zona_id;

CREATE OR REPLACE VIEW api.gerencia_ejecutivo
WITH (security_invoker = true) AS
SELECT m.tenant_id, m.ejecutivo_id, e.nombre AS ejecutivo, e.zona_id,
       sum(m.venta_mtd)                                         AS venta_mtd,
       max(mt.monto)                                            AS meta_mes,
       count(*) FILTER (WHERE m.estado = 'activo')              AS activos,
       count(*) FILTER (WHERE m.brecha < 0)                     AS cayendo,
       count(*) FILTER (WHERE m.estado IN ('dormido','fugado')) AS dormidos
  FROM core.v_cliente_metricas m
  JOIN core.ejecutivo e
    ON e.tenant_id = m.tenant_id AND e.id = m.ejecutivo_id
  LEFT JOIN core.meta mt
    ON mt.tenant_id = m.tenant_id AND mt.ejecutivo_id = m.ejecutivo_id
   AND mt.mes = date_trunc('month', current_date)::date
 GROUP BY m.tenant_id, m.ejecutivo_id, e.nombre, e.zona_id;

-- MIX corregido: el denominador es la venta del MES, no la de la línea.
-- En la 15.3 promClp se calculaba por línea de factura y el mix salía inflado.
CREATE OR REPLACE VIEW api.gerencia_producto
WITH (security_invoker = true) AS
WITH mes AS (
  SELECT tenant_id, sku,
         sum(monto_neto) AS venta_sku,
         sum(cantidad)   AS unidades,
         sum(CASE WHEN costo_unitario IS NOT NULL
                  THEN monto_neto - (costo_unitario * cantidad) END) AS margen
    FROM core.venta_linea
   WHERE fecha >= date_trunc('month', current_date)::date
   GROUP BY tenant_id, sku
), total AS (
  SELECT tenant_id, sum(venta_sku) AS venta_mes FROM mes GROUP BY tenant_id
)
SELECT m.tenant_id, m.sku, p.nombre, p.categoria,
       m.venta_sku, m.unidades, m.margen,
       CASE WHEN t.venta_mes <> 0
            THEN round(100 * m.venta_sku / t.venta_mes, 2) END AS mix_pct
  FROM mes m
  JOIN total t ON t.tenant_id = m.tenant_id
  LEFT JOIN core.producto p ON p.tenant_id = m.tenant_id AND p.sku = m.sku;

-- ─── PRECIO POR CLIENTE ────────────────────────────────────────────
-- Lo que el vendedor ve al tomar un pedido y lo que el cliente ve en su
-- catálogo. Muestra los tres números a la vez: lo que paga, lo que dice
-- la lista y de dónde salió. Sin eso, un precio distinto al de la lista
-- parece un error del sistema.
CREATE OR REPLACE FUNCTION api.precios_cliente(p_cliente_key TEXT)
RETURNS TABLE (
  sku TEXT, nombre TEXT, categoria TEXT, precio NUMERIC, origen TEXT,
  precio_lista NUMERIC, descuento_pct NUMERIC, hay_stock BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, api, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual();
BEGIN
  IF NOT core.es_mi_cliente(p_cliente_key) THEN
    RAISE EXCEPTION 'cliente_ajeno' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT sv.sku, sv.nombre, sv.categoria,
         pp.precio, pp.origen, pp.precio_lista,
         CASE WHEN pp.precio_lista > 0 AND pp.precio IS NOT NULL
              THEN round(100 * (pp.precio_lista - pp.precio) / pp.precio_lista, 1) END,
         sv.stock_total > 0
    FROM api.stock_vendible sv
    CROSS JOIN LATERAL core.precio_para_cliente(v_tenant, p_cliente_key, sv.sku) pp
   WHERE sv.tenant_id = v_tenant AND sv.es_vendible
   ORDER BY sv.nombre;
END $$;

REVOKE ALL ON FUNCTION api.precios_cliente(TEXT) FROM PUBLIC;

-- ─── INTEGRIDAD · lo que hoy nadie ve ──────────────────────────────
CREATE OR REPLACE VIEW api.integridad
WITH (security_invoker = true) AS
  SELECT c.tenant_id, 'ZONA_COMUNA_CONTRADICTORIA' AS hallazgo,
         c.cliente_key AS ref,
         c.zona_id || ' vs ' || COALESCE(c.comuna,'(sin comuna)') AS detalle
    FROM core.cliente c
    JOIN core.zona_comuna zc
      ON zc.tenant_id = c.tenant_id AND zc.comuna = c.comuna
   WHERE c.activo AND zc.zona_id IS DISTINCT FROM c.zona_id
UNION ALL
  SELECT c.tenant_id, 'CLIENTE_SIN_UBICACION', c.cliente_key,
         COALESCE(c.comuna, '(sin comuna)')
    FROM core.cliente c
   WHERE c.activo AND (c.lat IS NULL OR c.lng IS NULL)
UNION ALL
  SELECT sv.tenant_id, 'SKU_SIN_PRECIO', sv.sku, sv.nombre
    FROM api.stock_vendible sv
   WHERE sv.motivo_no_vendible = 'SIN_PRECIO_LISTA' AND sv.stock_total > 0
UNION ALL
  SELECT v.tenant_id, 'VENTA_SIN_CLIENTE_EN_MAESTRA', v.cliente_key,
         'líneas: ' || count(*)::text
    FROM core.venta_linea v
    LEFT JOIN core.cliente c
      ON c.tenant_id = v.tenant_id AND c.cliente_key = v.cliente_key
   WHERE c.cliente_key IS NULL
   GROUP BY v.tenant_id, v.cliente_key
UNION ALL
  -- Precio histórico absurdo contra la lista: unidad de medida
  -- distinta, combo cargado como una línea, o liquidación. El catálogo
  -- lo ignora y cae a lista; acá queda visible para corregirlo.
  SELECT v.tenant_id, 'PRECIO_HISTORICO_FUERA_DE_BANDA',
         v.cliente_key || ' · ' || v.sku,
         'cobrado ' || round(v.monto_neto / v.cantidad)::text ||
         ' vs lista ' || round(pr.precio)::text
    FROM core.venta_linea v
    JOIN LATERAL (
      SELECT COALESCE(p.precio_unidad, p.precio_caja, p.precio_kilo) AS precio
        FROM core.precio p
       WHERE p.tenant_id = v.tenant_id AND p.sku = v.sku
         AND p.vigente_desde <= current_date
       ORDER BY p.vigente_desde DESC LIMIT 1) pr ON pr.precio > 0
   WHERE v.cantidad > 0 AND v.monto_neto > 0
     AND v.fecha >= current_date - interval '6 months'
     AND (v.monto_neto / v.cantidad) NOT BETWEEN pr.precio * 0.4 AND pr.precio * 1.6
UNION ALL
  SELECT z.tenant_id, 'ZONA_SIN_VENTAS', z.id, z.nombre
    FROM core.zona z
   WHERE z.activo
     AND NOT EXISTS (
       SELECT 1 FROM core.cliente c
        JOIN core.venta_linea v
          ON v.tenant_id = c.tenant_id AND v.cliente_key = c.cliente_key
       WHERE c.tenant_id = z.tenant_id AND c.zona_id = z.id);
