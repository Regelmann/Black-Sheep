-- ============================================================
-- 26_CATALOGO_ORDEN.sql  ·  v-BS-PLATFORM-V9.9.3
--
-- ORDEN DEL CATÁLOGO QUE VE EL CLIENTE
--
-- Regla de negocio (pedido explícito, repetido varias veces):
--
--   1. LO QUE YA COMPRA   — primero, siempre. Es su lista de reposición.
--                           Dentro de este grupo, lo más reciente arriba:
--                           lo que compró hace 3 días importa más que
--                           lo que compró hace 5 meses.
--   2. SUGERENCIAS        — productos de las MISMAS categorías que ya
--                           compra. No sugerir carne a una heladería.
--   3. RESTO DEL CATÁLOGO — el catálogo completo, disponible pero abajo.
--
--   Dentro de cada grupo: por RUBRO (subfamilia) y luego ALFABÉTICO.
--
-- POR QUÉ EN SQL Y NO EN EL FRONT
-- El orden es regla de negocio, no presentación. Si vive en el front,
-- el catálogo web y la app pueden mostrar cosas distintas. Una sola
-- fuente de verdad: la función.
--
-- DOBLE CHEQUEO
-- Al final hay un bloque que verifica el orden REAL sobre un token de
-- prueba, no sólo que la función exista. Ver sección 3.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_catalogo(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.ofertas_cliente%ROWTYPE;
  v_items JSONB;
BEGIN
  -- ---- Validación de entrada -------------------------------
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalido');
  END IF;

  SELECT * INTO v_offer
  FROM public.ofertas_cliente
  WHERE token = trim(p_token)
    AND COALESCE(activo, TRUE) = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalido');
  END IF;

  -- ---- Armado con orden comercial --------------------------
  WITH
  -- Qué compra este cliente y cuándo fue la última vez.
  -- LEFT JOIN a propósito: si ventas_lineas está vacía para este
  -- cliente, el catálogo igual sale — sólo pierde la personalización.
  historial AS (
    SELECT
      vl.sku_canon,
      MAX(vl.fecha)            AS ultima_compra,
      SUM(vl.cantidad)         AS unidades_hist,
      COUNT(DISTINCT vl.fecha) AS veces
    FROM public.ventas_lineas vl
    WHERE vl.cliente_key = v_offer.cliente_key
      AND vl.fecha >= CURRENT_DATE - INTERVAL '6 months'
    GROUP BY vl.sku_canon
  ),

  -- Rubros en los que el cliente ya opera. Base de las sugerencias.
  rubros_cliente AS (
    SELECT DISTINCT COALESCE(NULLIF(TRIM(s.subfamilia), ''), 'SIN RUBRO') AS rubro
    FROM historial h
    JOIN public.stock s ON s.sku_canon = h.sku_canon
  ),

  base AS (
    SELECT
      i.sku_canon,
      COALESCE(NULLIF(TRIM(i.producto_nombre), ''), st.producto_nombre, i.sku_canon) AS nombre,
      COALESCE(NULLIF(TRIM(st.subfamilia), ''), 'SIN RUBRO')                          AS rubro,
      COALESCE(i.precio_lista, 0)                                                     AS p_lista,
      COALESCE(i.precio_cliente, 0)                                                   AS p_cliente,
      COALESCE(i.destacado, false)                                                    AS destacado,
      COALESCE(i.prioridad, 0)                                                        AS prioridad,
      h.ultima_compra,
      h.unidades_hist,
      h.veces,
      (h.sku_canon IS NOT NULL)                                                       AS ya_compra,
      (h.sku_canon IS NULL
        AND COALESCE(NULLIF(TRIM(st.subfamilia), ''), 'SIN RUBRO')
            IN (SELECT rubro FROM rubros_cliente))                                    AS es_sugerencia
    FROM public.oferta_cliente_items i
    LEFT JOIN public.stock   st ON st.sku_canon = i.sku_canon
    LEFT JOIN historial      h  ON h.sku_canon  = i.sku_canon
    WHERE i.oferta_id = v_offer.id
      AND COALESCE(i.visible, true) = true
  ),

  ordenado AS (
    SELECT
      b.*,
      CASE
        WHEN b.ya_compra      THEN 1   -- 1 · lo que ya compra
        WHEN b.es_sugerencia  THEN 2   -- 2 · sugerido por su rubro
        ELSE                       3   -- 3 · resto del catálogo
      END AS grupo
    FROM base b
  )

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'sku_canon',        o.sku_canon,
             'producto_nombre',  o.nombre,
             'rubro',            o.rubro,
             'grupo',            o.grupo,
             'grupo_nombre',     CASE o.grupo
                                   WHEN 1 THEN 'Lo que compras'
                                   WHEN 2 THEN 'Para tu rubro'
                                   ELSE        'Más productos'
                                 END,
             'ya_compra',        o.ya_compra,
             'ultima_compra',    o.ultima_compra,
             'veces_comprado',   COALESCE(o.veces, 0),
             'precio_lista',     o.p_lista,
             'precio_cliente',   o.p_cliente,
             'precio',           COALESCE(NULLIF(o.p_cliente, 0), NULLIF(o.p_lista, 0), 0),
             'precio_origen',    CASE
                                   WHEN o.p_cliente > 0 THEN 'negociado'
                                   WHEN o.p_lista   > 0 THEN 'lista'
                                   ELSE 'consultar'
                                 END,
             'recomendado',      o.destacado,
             'destacado',        o.destacado,
             'prioridad',        o.prioridad,
             'visible',          true,
             'stock_disponible', true
           )
           ORDER BY
             o.grupo,                                   -- 1) compra > sugerido > resto
             -- Dentro de "lo que compra": lo más reciente primero.
             CASE WHEN o.grupo = 1 THEN o.ultima_compra END DESC NULLS LAST,
             -- Dentro de sugerencias: lo que el vendedor destacó primero.
             CASE WHEN o.grupo = 2 THEN o.prioridad END DESC NULLS LAST,
             o.rubro   ASC,                             -- 2) por rubro
             o.nombre  ASC                              -- 3) alfabético
         ), '[]'::jsonb)
    INTO v_items
  FROM ordenado o;

  RETURN jsonb_build_object(
    'ok',             true,
    'nombre_cliente', COALESCE(v_offer.nombre_cliente, 'Cliente'),
    'cliente_key',    v_offer.cliente_key,
    'actualizado_en', v_offer.actualizado_en,
    'items',          v_items,
    -- Conteos por grupo: el front arma los encabezados sin recorrer todo.
    'resumen',        jsonb_build_object(
                        'compra',    (SELECT COUNT(*) FROM ordenado WHERE grupo = 1),
                        'sugerido',  (SELECT COUNT(*) FROM ordenado WHERE grupo = 2),
                        'resto',     (SELECT COUNT(*) FROM ordenado WHERE grupo = 3)
                      )
  );

EXCEPTION
  -- Si ventas_lineas o stock no existen en este entorno, el catálogo
  -- NO debe caerse: pierde la personalización y sale alfabético.
  WHEN undefined_table OR undefined_column THEN
    RAISE WARNING 'Catálogo sin personalización: %', SQLERRM;
    SELECT COALESCE(jsonb_agg(
             jsonb_build_object(
               'sku_canon',       i.sku_canon,
               'producto_nombre', COALESCE(i.producto_nombre, i.sku_canon),
               'rubro',           'SIN RUBRO',
               'grupo',           3,
               'grupo_nombre',    'Productos',
               'ya_compra',       false,
               'precio_lista',    COALESCE(i.precio_lista, 0),
               'precio_cliente',  COALESCE(i.precio_cliente, 0),
               'precio',          COALESCE(NULLIF(i.precio_cliente, 0), i.precio_lista, 0),
               'precio_origen',   CASE
                                    WHEN COALESCE(i.precio_cliente,0) > 0 THEN 'negociado'
                                    WHEN COALESCE(i.precio_lista,0)   > 0 THEN 'lista'
                                    ELSE 'consultar' END,
               'recomendado',     COALESCE(i.destacado, false),
               'visible',         true,
               'stock_disponible', true
             ) ORDER BY COALESCE(i.producto_nombre, i.sku_canon)
           ), '[]'::jsonb)
      INTO v_items
    FROM public.oferta_cliente_items i
    WHERE i.oferta_id = v_offer.id
      AND COALESCE(i.visible, true) = true;

    RETURN jsonb_build_object(
      'ok', true,
      'degradado', true,
      'nombre_cliente', COALESCE(v_offer.nombre_cliente, 'Cliente'),
      'cliente_key', v_offer.cliente_key,
      'items', v_items
    );
END $$;

REVOKE ALL    ON FUNCTION public.get_public_catalogo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_catalogo(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_catalogo(TEXT) IS
  'CANÓNICA v9.9.3 — orden: 1) lo que ya compra (reciente primero), '
  '2) sugeridos del mismo rubro, 3) resto. Dentro de cada grupo: rubro + alfabético.';

-- Índice para el cruce con historial: sin esto el catálogo escanea
-- ventas_lineas entera en cada apertura.
CREATE INDEX IF NOT EXISTS vl_cliente_sku_fecha_idx
  ON public.ventas_lineas (cliente_key, sku_canon, fecha DESC);


-- ============================================================
-- DOBLE CHEQUEO
-- No alcanza con que la función exista: hay que verificar que el
-- ORDEN sea el correcto sobre datos reales.
-- ============================================================

-- CHEQUEO 1 · una sola firma y permiso de anon
SELECT
  p.oid::regprocedure                        AS firma,
  CASE WHEN COUNT(*) OVER () = 1 THEN '✅ única' ELSE '❌ SOBRECARGADA' END AS firmas,
  CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
       THEN '✅ anon OK' ELSE '❌ falta GRANT' END AS permiso
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_public_catalogo';

-- CHEQUEO 2 · el orden es correcto sobre un catálogo real
-- Toma el primer catálogo activo que tenga items y verifica que
-- los grupos salgan en orden 1,1,...,2,2,...,3,3,... sin mezclarse.
DO $$
DECLARE
  v_token TEXT;
  v_res   JSONB;
  v_prev  INT := 0;
  v_it    JSONB;
  v_err   INT := 0;
  v_n     INT := 0;
BEGIN
  SELECT o.token INTO v_token
  FROM public.ofertas_cliente o
  JOIN public.oferta_cliente_items i ON i.oferta_id = o.id
  WHERE COALESCE(o.activo, TRUE) = TRUE
  GROUP BY o.token
  HAVING COUNT(i.*) > 0
  LIMIT 1;

  IF v_token IS NULL THEN
    RAISE NOTICE '⚠️  Sin catálogos con items: no se pudo verificar el orden.';
    RETURN;
  END IF;

  v_res := public.get_public_catalogo(v_token);

  IF (v_res->>'ok')::boolean IS NOT TRUE THEN
    RAISE WARNING '❌ La función devolvió error: %', v_res->>'error';
    RETURN;
  END IF;

  FOR v_it IN SELECT * FROM jsonb_array_elements(v_res->'items')
  LOOP
    v_n := v_n + 1;
    IF (v_it->>'grupo')::int < v_prev THEN
      v_err := v_err + 1;
      RAISE WARNING '❌ Orden roto en "%": grupo % después de grupo %',
        v_it->>'producto_nombre', v_it->>'grupo', v_prev;
    END IF;
    v_prev := (v_it->>'grupo')::int;
  END LOOP;

  IF v_err = 0 THEN
    RAISE NOTICE '✅ Orden correcto · % items · compra=% sugerido=% resto=%',
      v_n,
      v_res->'resumen'->>'compra',
      v_res->'resumen'->>'sugerido',
      v_res->'resumen'->>'resto';
  ELSE
    RAISE WARNING '❌ % elementos fuera de orden', v_err;
  END IF;
END $$;

-- CHEQUEO 3 · ningún catálogo activo queda vacío para el cliente
SELECT
  COUNT(*)                                          AS catalogos_activos,
  COUNT(*) FILTER (WHERE n_items = 0)               AS vacios,
  CASE WHEN COUNT(*) FILTER (WHERE n_items = 0) = 0
       THEN '✅ ninguno vacío'
       ELSE '⚠️ hay catálogos activos sin productos visibles' END AS estado
FROM (
  SELECT o.id,
         COUNT(i.*) FILTER (WHERE COALESCE(i.visible, true)) AS n_items
  FROM public.ofertas_cliente o
  LEFT JOIN public.oferta_cliente_items i ON i.oferta_id = o.id
  WHERE COALESCE(o.activo, TRUE) = TRUE
  GROUP BY o.id
) t;
