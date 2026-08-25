-- ============================================================
-- 19_CATALOGO_OFERTA_CLIENTE.sql
-- Tablas para el catálogo público por cliente
-- El ejecutivo genera un link único → el cliente lo abre en su cel
-- Correr UNA VEZ en Supabase SQL Editor
-- ============================================================

-- Cabecera de la oferta por cliente
CREATE TABLE IF NOT EXISTS public.ofertas_cliente (
  id              BIGSERIAL PRIMARY KEY,
  cliente_key     TEXT NOT NULL,
  nombre_cliente  TEXT,
  ejecutivo_id    UUID,
  token           TEXT UNIQUE NOT NULL,
  activo          BOOLEAN DEFAULT TRUE,
  actualizado_en  TIMESTAMPTZ DEFAULT NOW(),
  creado_en       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS oc_cliente_idx ON public.ofertas_cliente (cliente_key);
CREATE INDEX IF NOT EXISTS oc_token_idx   ON public.ofertas_cliente (token);
ALTER TABLE public.ofertas_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oc_auth" ON public.ofertas_cliente;
CREATE POLICY "oc_auth" ON public.ofertas_cliente
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Lectura pública por token (para la app del cliente sin login)
DROP POLICY IF EXISTS "oc_public_read" ON public.ofertas_cliente;
CREATE POLICY "oc_public_read" ON public.ofertas_cliente
  FOR SELECT TO anon USING (activo = true);

-- Items de la oferta
CREATE TABLE IF NOT EXISTS public.oferta_cliente_items (
  id              BIGSERIAL PRIMARY KEY,
  oferta_id       BIGINT REFERENCES public.ofertas_cliente(id) ON DELETE CASCADE,
  sku_canon       TEXT,
  producto_nombre TEXT,
  precio_lista    NUMERIC,
  precio_cliente  NUMERIC,
  visible         BOOLEAN DEFAULT TRUE,
  destacado       BOOLEAN DEFAULT FALSE,
  prioridad       INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS oci_oferta_idx ON public.oferta_cliente_items (oferta_id);
ALTER TABLE public.oferta_cliente_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oci_auth" ON public.oferta_cliente_items;
CREATE POLICY "oci_auth" ON public.oferta_cliente_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "oci_public_read" ON public.oferta_cliente_items;
CREATE POLICY "oci_public_read" ON public.oferta_cliente_items
  FOR SELECT TO anon USING (true);

-- RPC pública: retorna el catálogo completo dado un token
CREATE OR REPLACE FUNCTION public.get_public_catalogo(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oferta  JSONB;
  v_items   JSONB;
  v_stock   JSONB;
  v_result  JSONB;
BEGIN
  -- 1. Buscar la oferta activa
  SELECT to_jsonb(o) INTO v_oferta
  FROM ofertas_cliente o
  WHERE o.token = p_token AND o.activo = true
  LIMIT 1;

  IF v_oferta IS NULL THEN
    RETURN jsonb_build_object('error', 'Catálogo no encontrado');
  END IF;

  -- 2. Items de la oferta
  SELECT jsonb_agg(
    jsonb_build_object(
      'sku_canon',       i.sku_canon,
      'producto_nombre', i.producto_nombre,
      'precio_lista',    i.precio_lista,
      'precio_cliente',  i.precio_cliente,
      'visible',         i.visible,
      'destacado',       i.destacado,
      'prioridad',       i.prioridad,
      -- Enriquecer con stock actual
      'stock_operativo', s.stock_operativo,
      'stock_disponible', CASE WHEN COALESCE(s.stock_operativo, 0) > 0 THEN true ELSE false END,
      'cobertura_dias',  s.cobertura_dias,
      'imagen_url',      s.imagen_url,
      'subfamilia',      s.subfamilia,
      'resena',          s.resena,
      'es_foco_mes',     COALESCE(s.es_foco_mes, false),
      'precio_unidad',   COALESCE(i.precio_cliente, i.precio_lista, s.precio_unidad),
      'precio_origen',   CASE
        WHEN i.precio_cliente IS NOT NULL THEN 'negociado'
        WHEN i.precio_lista   IS NOT NULL THEN 'historico'
        WHEN s.precio_unidad  IS NOT NULL THEN 'lista'
        ELSE 'consultar'
      END
    )
    ORDER BY i.destacado DESC, i.prioridad ASC
  )
  INTO v_items
  FROM oferta_cliente_items i
  LEFT JOIN stock s ON s.sku_canon = i.sku_canon
  WHERE i.oferta_id = (v_oferta->>'id')::BIGINT
    AND i.visible = true;

  -- 3. Retornar todo
  RETURN jsonb_build_object(
    'nombre_cliente',  v_oferta->>'nombre_cliente',
    'cliente_key',     v_oferta->>'cliente_key',
    'ejecutivo_id',    v_oferta->>'ejecutivo_id',
    'token',           v_oferta->>'token',
    'actualizado_en',  v_oferta->>'actualizado_en',
    'items',           COALESCE(v_items, '[]'::jsonb),
    'total_items',     jsonb_array_length(COALESCE(v_items, '[]'::jsonb))
  );
END;
$$;

-- Permisos públicos al RPC
GRANT EXECUTE ON FUNCTION public.get_public_catalogo(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_catalogo(TEXT) TO authenticated;

-- Verificar
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('ofertas_cliente', 'oferta_cliente_items')
ORDER BY 1;
