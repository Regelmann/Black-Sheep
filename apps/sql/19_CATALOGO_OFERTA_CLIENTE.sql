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
-- get_public_catalogo() → definición ÚNICA en 25_CATALOGO_FINAL.sql
-- Este archivo conserva SOLO las tablas ofertas_cliente / oferta_cliente_items.


-- Permisos públicos al RPC
GRANT EXECUTE ON FUNCTION public.get_public_catalogo(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_catalogo(TEXT) TO authenticated;

-- Verificar
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('ofertas_cliente', 'oferta_cliente_items')
ORDER BY 1;
