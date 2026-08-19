-- Agregar columnas sku_detalle y productos_top a gerencia_clientes
-- Correr UNA VEZ en Supabase SQL Editor
ALTER TABLE public.gerencia_clientes
  ADD COLUMN IF NOT EXISTS sku_detalle   TEXT,
  ADD COLUMN IF NOT EXISTS productos_top TEXT;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'gerencia_clientes'
  AND column_name IN ('sku_detalle', 'productos_top');
