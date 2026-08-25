-- ============================================================
-- 21_PEDIDO_PUBLICO_CANONICO.sql  ·  v-BS-PLATFORM-V9.3
--
-- PROBLEMA
-- --------
-- crear_pedido_publico() está definida con DOS FIRMAS distintas:
--
--   01_COMMERCE_CANON.sql   → (p_token text, p_lineas jsonb)
--   05_CATALOGO_PUBLICO.sql → (p_token text, p_lineas jsonb)
--   11_ORDER_INBOX_V26.sql  → (p_token text, p_lineas jsonb, p_nota text DEFAULT null)
--
-- En Postgres esas son FUNCIONES DISTINTAS (sobrecarga), no un reemplazo:
-- `create or replace` sólo pisa la que tiene la MISMA firma exacta.
-- Las dos conviven en la base.
--
-- Como la de 3 argumentos tiene DEFAULT, una llamada con 2 argumentos
-- matchea las dos:
--
--   ERROR:  function reference "crear_pedido_publico" is not unique
--   HINT:   Could not choose a best candidate function.
--
-- EFECTO: el cliente arma el pedido en el catálogo, aprieta enviar,
-- y falla. Mismo patrón que el bug activo/activa del catálogo.
--
-- Detectado por scripts/guard.js (regla R8).
--
-- ESTE ARCHIVO ES LA ÚNICA FUENTE DE VERDAD. Ejecutar después de 20.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Diagnóstico previo — mirar ANTES de borrar
-- ------------------------------------------------------------
SELECT
  p.oid::regprocedure                      AS firma_actual,
  pg_get_function_identity_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'crear_pedido_publico';
-- Si devuelve más de una fila, la ambigüedad está confirmada.

-- ------------------------------------------------------------
-- 2) Eliminar TODAS las sobrecargas
--    DROP FUNCTION exige la firma exacta, así que se recorre pg_proc.
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'crear_pedido_publico'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Sobrecargas eliminadas: %', n;
END $$;

-- ------------------------------------------------------------
-- 3) UNA sola definición. Base: la de 11_ORDER_INBOX_V26.sql,
--    que es la única que usa `activo` (no `activa`) y acepta nota.
--
--    p_nota SIN default: obliga a que el front pase los 3 argumentos
--    siempre. Sin default no puede volver a haber ambigüedad aunque
--    alguien recree la versión de 2 argumentos por error.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crear_pedido_publico(
  p_token  TEXT,
  p_lineas JSONB,
  p_nota   TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o            RECORD;
  l            JSONB;
  v_sku        TEXT;
  v_qty        NUMERIC;
  v_name       TEXT;
  v_price      NUMERIC;
  v_lista      NUMERIC;
  v_oferta_cli NUMERIC;
  v_origen     TEXT;
  valid        JSONB := '[]'::JSONB;
  total        NUMERIC := 0;
  pid          UUID;
BEGIN
  -- Columna `activo` (nunca `activa`) — ver 20_CATALOGO_CANONICO.sql
  SELECT * INTO o
  FROM public.ofertas_cliente
  WHERE token = trim(p_token)
    AND COALESCE(activo, TRUE) = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CATALOGO_NO_DISPONIBLE';
  END IF;

  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'PEDIDO_VACIO';
  END IF;

  FOR l IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    v_sku := NULLIF(trim(COALESCE(l->>'sku', l->>'sku_canon', '')), '');
    v_qty := GREATEST(0, COALESCE((l->>'cantidad')::NUMERIC, 0));
    CONTINUE WHEN v_sku IS NULL OR v_qty <= 0;

    v_name       := COALESCE(NULLIF(trim(COALESCE(l->>'nombre', l->>'producto_nombre', '')), ''), v_sku);
    v_price      := COALESCE(NULLIF((l->>'precio')::NUMERIC, 0), 0);
    v_lista      := 0;
    v_oferta_cli := NULL;
    v_origen     := 'lista';

    -- Precio: oferta del cliente > precio enviado > lista
    SELECT
      COALESCE(i.producto_nombre, s.producto_nombre, v_name),
      NULLIF(i.precio_cliente, 0),
      COALESCE(NULLIF(i.precio_lista, 0), NULLIF(s.precio_unidad, 0), NULLIF(s.precio_caja, 0), 0)
    INTO v_name, v_oferta_cli, v_lista
    FROM public.oferta_cliente_items i
    LEFT JOIN public.stock s ON s.sku_canon = i.sku_canon
    WHERE i.oferta_id = o.id AND i.sku_canon = v_sku
    LIMIT 1;

    IF FOUND THEN
      v_price  := COALESCE(v_oferta_cli, NULLIF(v_price, 0), NULLIF(v_lista, 0), 0);
      v_origen := CASE WHEN v_oferta_cli IS NOT NULL THEN 'negociado' ELSE 'lista' END;
    ELSE
      SELECT
        COALESCE(s.producto_nombre, v_name),
        COALESCE(NULLIF(s.precio_unidad, 0), NULLIF(s.precio_caja, 0), NULLIF(s.precio_kilo, 0), 0)
      INTO v_name, v_lista
      FROM public.stock s
      WHERE s.sku_canon = v_sku
      LIMIT 1;
      v_price := COALESCE(NULLIF(v_price, 0), NULLIF(v_lista, 0), 0);
    END IF;

    valid := valid || jsonb_build_object(
      'sku_canon',       v_sku,
      'producto_nombre', v_name,
      'cantidad',        v_qty,
      'precio',          v_price,
      'precio_origen',   v_origen,
      'subtotal',        v_price * v_qty
    );
    total := total + (v_price * v_qty);
  END LOOP;

  IF jsonb_array_length(valid) = 0 THEN
    RAISE EXCEPTION 'PEDIDO_SIN_LINEAS_VALIDAS';
  END IF;

  INSERT INTO public.pedidos (
    ejecutivo_id, cliente_key, nombre_cliente,
    lineas, nota, estado, fuente, total_estimado
  ) VALUES (
    o.ejecutivo_id, o.cliente_key, o.nombre_cliente,
    valid, NULLIF(trim(COALESCE(p_nota, '')), ''),
    'recibido', 'catalogo_publico', total
  )
  RETURNING id INTO pid;

  RETURN pid;
END $$;

REVOKE ALL    ON FUNCTION public.crear_pedido_publico(TEXT, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_pedido_publico(TEXT, JSONB, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.crear_pedido_publico(TEXT, JSONB, TEXT) IS
  'CANÓNICA v9.3 — reemplaza 01/05/11. Firma ÚNICA de 3 args sin DEFAULT '
  'para impedir ambigüedad por sobrecarga. Usa `activo`, nunca `activa`.';

-- ------------------------------------------------------------
-- 4) Verificación — debe devolver EXACTAMENTE una fila
-- ------------------------------------------------------------
SELECT
  p.oid::regprocedure AS firma,
  p.prosecdef         AS security_definer,
  CASE WHEN COUNT(*) OVER () = 1
       THEN 'OK · firma única'
       ELSE 'ERROR · sigue habiendo sobrecarga' END AS estado
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'crear_pedido_publico';

-- 5) Prueba de humo (reemplazar el token):
-- SELECT public.crear_pedido_publico(
--   'TOKEN_REAL',
--   '[{"sku":"300918318","cantidad":2}]'::jsonb,
--   'prueba desde SQL'
-- );
