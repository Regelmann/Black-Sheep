-- ═══════════════════════════════════════════════════════════════════
-- 40 · LA TABLA STOCK ACEPTA TODO LO QUE ESCRIBE EL CICLO
--
-- POR QUÉ EXISTE ESTE ARCHIVO
-- `CICLO_UNICO.py` → `build_stock_rows()` escribe 26 columnas. Si la
-- tabla no tiene alguna, el upsert falla o —peor— la descarta en
-- silencio y el dato nunca llega a la app.
--
-- Ya pasó con `decision_comercial`: el ciclo la calcula desde 2025 y la
-- tabla nunca la tuvo. Por eso el catálogo no podía distinguir un
-- producto de la LISTA DE PRECIOS de uno que sólo está en el inventario.
--
-- LA LÓGICA DEL NEGOCIO, que es la de siempre:
--
--   LISTA DE PRECIOS  → define QUÉ SE VENDE. Es la base del catálogo.
--   STOCK             → dice SI HAY. No define el catálogo.
--   MAESTRA           → define de QUIÉN es cada cliente.
--   VENTAS            → dice QUÉ COMPRÓ cada uno.
--
-- Un SKU que está en el inventario pero no en la lista de precios NO
-- es catálogo: es operativo. El ciclo lo marca `SIN_PRECIO_LISTA` y
-- `get_public_catalogo` lo excluye.
--
-- Idempotente: se puede correr las veces que haga falta.
-- ═══════════════════════════════════════════════════════════════════

-- ── Identidad y nombre ─────────────────────────────────────────────
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS sku_canon        TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS producto_nombre  TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS descripcion      TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS marca            TEXT;

-- ── Clasificación ──────────────────────────────────────────────────
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS categoria        TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS familia          TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS subfamilia       TEXT;

-- ── Precios · vienen de la LISTA DE PRECIOS ────────────────────────
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS precio_unidad    NUMERIC;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS precio_caja      NUMERIC;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS precio_kilo      NUMERIC;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS unidad_venta     TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS kg_unidad        NUMERIC;

-- ── Disponibilidad · viene del STOCK ───────────────────────────────
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS stock_total      NUMERIC;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS stock_operativo  NUMERIC;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS cobertura_dias   NUMERIC;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS estado_stock     TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS fecha_venc       DATE;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS dias_venc        NUMERIC;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS status_venc      TEXT;

-- ── 🔴 LA COLUMNA QUE FALTABA ──────────────────────────────────────
-- El ciclo la calcula y la tabla no la tenía. Sin ella el catálogo no
-- puede distinguir "está a la venta" de "está en la bodega".
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS decision_comercial TEXT;

-- ── Foco del mes y media ───────────────────────────────────────────
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS es_foco_mes      BOOLEAN DEFAULT FALSE;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS foco             TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS imagen_url       TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS ficha_url        TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS resena           TEXT;
ALTER TABLE public.stock ADD COLUMN IF NOT EXISTS fecha_snapshot   DATE;

-- El catálogo filtra por esta columna en cada carga: sin índice, un
-- barrido completo de la tabla por cada cliente que abre su link.
CREATE INDEX IF NOT EXISTS idx_stock_decision
  ON public.stock (decision_comercial);
CREATE INDEX IF NOT EXISTS idx_stock_sku_canon
  ON public.stock (sku_canon);

-- ═══════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO · qué tiene la tabla hoy
-- ═══════════════════════════════════════════════════════════════════
SELECT
  COUNT(*)                                                          AS skus_totales,
  COUNT(*) FILTER (WHERE COALESCE(precio_unidad, 0) > 0
                      OR COALESCE(precio_caja,   0) > 0)            AS con_precio,
  COUNT(*) FILTER (WHERE decision_comercial = 'SIN_PRECIO_LISTA')   AS solo_bodega,
  COUNT(*) FILTER (WHERE COALESCE(stock_total, 0) > 0)              AS con_existencia,
  COUNT(*) FILTER (WHERE NULLIF(TRIM(imagen_url), '') IS NOT NULL)  AS con_foto,
  COUNT(*) FILTER (WHERE es_foco_mes)                               AS focos_del_mes
FROM public.stock;

-- Cuántos productos va a ver realmente un cliente en su catálogo.
-- Si este número es bajo, el problema está en la carga de la lista de
-- precios, no en la app.
SELECT
  COUNT(*) AS productos_en_catalogo
FROM public.stock
WHERE COALESCE(decision_comercial, '') <> 'SIN_PRECIO_LISTA'
  AND COALESCE(NULLIF(precio_unidad, 0), NULLIF(precio_caja, 0), 0) > 0;

-- Los que están en bodega y NO se venden: son operativos, no catálogo.
SELECT sku_canon, producto_nombre, stock_total, decision_comercial
FROM public.stock
WHERE decision_comercial = 'SIN_PRECIO_LISTA'
ORDER BY stock_total DESC NULLS LAST
LIMIT 20;
