-- ═══════════════════════════════════════════════════════════════════
-- 41 · ventas_lineas — LA TABLA QUE FALTABA
--
-- 🔴 POR QUÉ EL INCREMENTAL NUNCA FUNCIONÓ
--
-- `CICLO_UNICO.py` tiene toda la lógica escrita y correcta:
--
--   línea 11    "Excel nuevo se SUMA a public.ventas_lineas (no reemplaza el mes)"
--   línea 3143  fetch_ventas_supabase()   → lee el histórico, paginado
--   línea 3446  merge_ventas_incremental() → fusiona Excel + histórico
--                                            con anti-doble-conteo
--
-- **Pero la tabla nunca existió.** El propio ciclo lo avisa:
--
--   "⚠ tabla public.ventas_lineas no existe → corré SUPABASE_VENTAS_LINEAS.sql
--    sin histórico: el Excel se usará solo (peligroso si es parcial)"
--
-- Ese archivo nunca estuvo en el repo. Sin tabla no hay dónde acumular,
-- así que cada corrida caía a "solo Excel" — y por eso subir la venta de
-- un día dejaba a todos los clientes sin historial y sin promedio.
--
-- CÓMO QUEDA DESPUÉS DE ESTO
--   corrida 1 · Excel del mes completo  → se guarda cada línea
--   corrida 2 · Excel de HOY solamente  → se suma; el promedio y el MTD
--                                          salen del histórico guardado
--
-- Idempotente: `linea_id` es un SHA1 de
-- cliente + fecha + documento + sku + monto + cantidad. Subir dos veces
-- el mismo archivo NO duplica nada.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ventas_lineas (
  -- Clave estable por línea de factura. La calcula el ciclo con SHA1,
  -- así que la misma línea siempre da el mismo id: reprocesar es seguro.
  linea_id          TEXT PRIMARY KEY,

  cliente_key       TEXT NOT NULL,
  nombre_cliente    TEXT,
  fecha             DATE NOT NULL,
  numero_documento  TEXT,

  sku_canon         TEXT,
  producto_nombre   TEXT,
  cantidad          NUMERIC,
  venta_neta_clp    NUMERIC NOT NULL DEFAULT 0,

  -- El vendedor de la FACTURA, sin promover a canal de gerencia.
  -- La maestra reparte las ventas, no este campo: puede decir
  -- VENDEDOR_07 y no significar nada comercial.
  vendedor_raw      TEXT,
  zona_vendedor     TEXT,

  fuente            TEXT DEFAULT 'excel_incremental',
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El merge lee por rango de fechas (6 meses hacia atrás). Sin este
-- índice cada corrida hace un barrido completo de la tabla.
CREATE INDEX IF NOT EXISTS idx_ventas_lineas_fecha
  ON public.ventas_lineas (fecha);

-- Historial por cliente: lo usa el promedio de los 3 meses.
CREATE INDEX IF NOT EXISTS idx_ventas_lineas_cliente_fecha
  ON public.ventas_lineas (cliente_key, fecha DESC);

-- Ranking de SKU y focos del mes.
CREATE INDEX IF NOT EXISTS idx_ventas_lineas_sku_fecha
  ON public.ventas_lineas (sku_canon, fecha DESC);

-- ── Seguridad ──────────────────────────────────────────────────────
-- Son las ventas de toda la compañía. Sólo el ciclo (service_role)
-- escribe; nadie más lee directo. La app usa las tablas agregadas
-- (cartera, gerencia, gerencia_clientes), no esta.
ALTER TABLE public.ventas_lineas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ventas_lineas_lectura ON public.ventas_lineas;
-- Sin política de lectura para anon/authenticated: acceso sólo por
-- service_role, que salta RLS por definición.

-- ═══════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO
-- ═══════════════════════════════════════════════════════════════════

-- ¿Cuánto histórico hay acumulado?
SELECT
  COUNT(*)                        AS lineas,
  COUNT(DISTINCT cliente_key)     AS clientes,
  COUNT(DISTINCT sku_canon)       AS skus,
  MIN(fecha)                      AS desde,
  MAX(fecha)                      AS hasta,
  ROUND(SUM(venta_neta_clp))      AS venta_total
FROM public.ventas_lineas;

-- Venta por mes. Sirve para confirmar que el incremental suma y no pisa:
-- después de subir el Excel de un día, el mes debe CRECER, no reiniciarse.
SELECT
  date_trunc('month', fecha)::date AS mes,
  COUNT(*)                         AS lineas,
  COUNT(DISTINCT cliente_key)      AS clientes,
  ROUND(SUM(venta_neta_clp))       AS venta
FROM public.ventas_lineas
GROUP BY 1
ORDER BY 1 DESC
LIMIT 12;
