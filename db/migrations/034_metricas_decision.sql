-- ═══════════════════════════════════════════════════════════════════
-- 034 · LO QUE EL MOTOR DE DECISIÓN NECESITA SABER
--
-- El motor (decisionEngine, portado de la V15.4) puntúa a cada cliente
-- con urgencia, valor, probabilidad, accionabilidad y confianza. Para
-- eso necesita tres cosas que hoy NO entrega el servidor:
--
--   ciclo_dias     cada cuánto compra ESTE cliente
--   venta_mensual  cuánto compra en un mes típico
--   estado_fuga    si el atraso ya pasó de ser normal
--
-- Podrían calcularse en el teléfono, y sería un error: el mismo cliente
-- saldría "en riesgo" en Hoy y "al día" en el dashboard, porque cada
-- pantalla habría elegido su umbral. La definición vive UNA vez, acá.
--
-- CICLO PROPIO, NO UN NÚMERO FIJO
-- Un hotel que compra cada 7 días y una pizzería que compra cada 30 no
-- se pueden medir con la misma vara. Con 30 días de atraso el hotel
-- está perdido y la pizzería está normal. Por eso el ciclo se calcula
-- por cliente, con la MEDIANA de los días entre compras: el promedio lo
-- destruye una compra de Navidad.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW core.v_cliente_ritmo
WITH (security_invoker = true) AS
WITH compras AS (
  -- Un día con varias facturas es UNA compra. Contarlas por separado
  -- daría un ciclo de cero días.
  SELECT DISTINCT tenant_id, cliente_key, fecha
    FROM core.venta_linea
   WHERE monto_neto > 0
     AND fecha >= current_date - interval '12 months'
), huecos AS (
  SELECT tenant_id, cliente_key,
         (fecha - lag(fecha) OVER (PARTITION BY tenant_id, cliente_key ORDER BY fecha))::int AS dias
    FROM compras
), mensual AS (
  SELECT tenant_id, cliente_key,
         sum(monto_neto) / GREATEST(1,
           (EXTRACT(YEAR FROM age(max(fecha), min(fecha))) * 12
            + EXTRACT(MONTH FROM age(max(fecha), min(fecha))))::numeric) AS venta_mensual,
         count(DISTINCT fecha) AS compras_12m
    FROM core.venta_linea
   WHERE monto_neto > 0 AND fecha >= current_date - interval '12 months'
   GROUP BY tenant_id, cliente_key
)
SELECT m.tenant_id, m.cliente_key,
       round(m.venta_mensual) AS venta_mensual,
       m.compras_12m,
       (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY h.dias))::int
          FROM huecos h
         WHERE h.tenant_id = m.tenant_id AND h.cliente_key = m.cliente_key
           AND h.dias IS NOT NULL AND h.dias > 0) AS ciclo_dias
  FROM mensual m;

GRANT SELECT ON core.v_cliente_ritmo TO authenticated;

-- ─── La cartera, ahora con ritmo ───────────────────────────────────
CREATE OR REPLACE VIEW api.cartera
WITH (security_invoker = true) AS
SELECT m.tenant_id, m.cliente_key, m.nombre, m.comuna, m.direccion,
       m.lat, m.lng, m.rubro, m.zona_id, m.ejecutivo_id,
       m.estado, m.es_bloqueado,
       m.ultima_compra, m.dias_sin_comprar, m.venta_mtd, m.promedio_3m,
       m.brecha, m.skus_90d,
       -- Con menos de tres compras no hay ritmo que medir: se declara
       -- NULL en vez de inventar un ciclo con dos puntos.
       CASE WHEN r.compras_12m >= 3 THEN r.ciclo_dias END AS ciclo_dias,
       COALESCE(r.venta_mensual, 0)                       AS venta_mensual,
       r.compras_12m,
       -- Atraso RELATIVO al ritmo del propio cliente.
       CASE WHEN r.ciclo_dias > 0 AND m.dias_sin_comprar IS NOT NULL
            THEN round(m.dias_sin_comprar::numeric / r.ciclo_dias, 2) END AS atraso_ciclos,
       CASE
         WHEN m.es_bloqueado THEN 'bloqueado'
         WHEN r.compras_12m IS NULL OR r.compras_12m < 3 THEN 'sin_ritmo'
         WHEN m.dias_sin_comprar <= r.ciclo_dias           THEN 'al_dia'
         WHEN m.dias_sin_comprar <= r.ciclo_dias * 1.5     THEN 'atrasado'
         WHEN m.dias_sin_comprar <= r.ciclo_dias * 3       THEN 'en_fuga'
         ELSE 'perdido'
       END AS estado_fuga
  FROM core.v_cliente_metricas m
  LEFT JOIN core.v_cliente_ritmo r
    ON r.tenant_id = m.tenant_id AND r.cliente_key = m.cliente_key;

COMMENT ON VIEW api.cartera IS
  'Lo que consumen la app de terreno, el dashboard y el motor de
   decisión. Si "en fuga" significa lo mismo en las tres, es porque
   se define acá y en ningún otro lado.';

-- ─── Lo que el motor lee para armar el día ─────────────────────────
CREATE OR REPLACE VIEW api.decision_cartera
WITH (security_invoker = true) AS
SELECT c.tenant_id, c.cliente_key, c.nombre, c.comuna, c.lat, c.lng,
       c.zona_id, c.ejecutivo_id, c.es_bloqueado,
       c.dias_sin_comprar, c.ciclo_dias, c.atraso_ciclos, c.estado_fuga,
       c.venta_mtd, c.venta_mensual, c.promedio_3m, c.brecha,
       c.ultima_compra, c.compras_12m,
       -- ¿Hay algo concreto que ofrecerle? Sin esto el motor sugiere
       -- visitar a alguien y el vendedor llega sin nada que vender.
       (SELECT count(*) FROM core.oferta_cliente o
         WHERE o.tenant_id = c.tenant_id AND o.cliente_key = c.cliente_key
           AND o.activo AND array_length(o.skus, 1) > 0) > 0 AS tiene_oferta,
       (SELECT max(v.fecha) FROM core.visita v
         WHERE v.tenant_id = c.tenant_id AND v.cliente_key = c.cliente_key
           AND v.estado = 'visitada') AS ultima_visita
  FROM api.cartera c;

GRANT SELECT ON api.decision_cartera TO authenticated;
