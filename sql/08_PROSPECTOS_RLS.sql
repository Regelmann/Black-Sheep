-- Permitir que cualquier usuario autenticado lea prospectos de todas las zonas
-- (necesario para el selector de gerencia / multi-ejecutivo)

DROP POLICY IF EXISTS prospectos_select ON public.prospectos;
DROP POLICY IF EXISTS prospectos_select_own ON public.prospectos;
DROP POLICY IF EXISTS "prospectos_select" ON public.prospectos;

CREATE POLICY prospectos_select_authenticated
  ON public.prospectos
  FOR SELECT
  TO authenticated
  USING (true);

-- Opcional: detalle clientes por canal para Gerencia (NO_ASIGNADOS, etc.)
CREATE TABLE IF NOT EXISTS public.gerencia_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL,
  cliente_key text,
  nombre_cliente text,
  comuna text,
  venta_mtd numeric,
  fecha_snapshot date,
  UNIQUE (canal, cliente_key)
);

ALTER TABLE public.gerencia_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gerencia_clientes_select ON public.gerencia_clientes;
CREATE POLICY gerencia_clientes_select
  ON public.gerencia_clientes
  FOR SELECT
  TO authenticated
  USING (true);
