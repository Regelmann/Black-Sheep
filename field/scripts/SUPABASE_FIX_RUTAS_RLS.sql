-- ============================================================
-- KeyFoods Field · RLS rutas / visitas multi-zona
-- Correr TODO el script de una vez en Supabase → SQL Editor
-- ============================================================

-- 1) Columnas que faltan en ejecutivos
ALTER TABLE public.ejecutivos
  ADD COLUMN IF NOT EXISTS es_superadmin boolean DEFAULT false;

ALTER TABLE public.ejecutivos
  ADD COLUMN IF NOT EXISTS rol text;

-- 2) Marcar superadmin / gerente (ajustá emails si hace falta)
UPDATE public.ejecutivos
SET es_superadmin = true,
    rol = coalesce(nullif(rol, ''), 'gerente')
WHERE email ILIKE '%sebastian%'
   OR email ILIKE '%admin%'
   OR email ILIKE '%gerencia%';

-- Verificación rápida
SELECT id, email, zona, nombre, es_superadmin, rol
FROM public.ejecutivos
ORDER BY zona;

-- 3) Limpiar policies viejas de rutas
DROP POLICY IF EXISTS rutas_insert_own ON public.rutas;
DROP POLICY IF EXISTS rutas_insert ON public.rutas;
DROP POLICY IF EXISTS rutas_select_own ON public.rutas;
DROP POLICY IF EXISTS rutas_select ON public.rutas;
DROP POLICY IF EXISTS rutas_update_own ON public.rutas;
DROP POLICY IF EXISTS rutas_update ON public.rutas;
DROP POLICY IF EXISTS rutas_delete ON public.rutas;
DROP POLICY IF EXISTS rutas_delete_own ON public.rutas;

-- 4) Policies rutas
CREATE POLICY rutas_select ON public.rutas
  FOR SELECT TO authenticated
  USING (
    ejecutivo_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.ejecutivos e
      WHERE e.id = auth.uid()
        AND (
          COALESCE(e.es_superadmin, false) = true
          OR lower(COALESCE(e.rol, '')) IN ('gerente', 'admin', 'superadmin')
        )
    )
  );

CREATE POLICY rutas_insert ON public.rutas
  FOR INSERT TO authenticated
  WITH CHECK (
    ejecutivo_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.ejecutivos e
      WHERE e.id = auth.uid()
        AND (
          COALESCE(e.es_superadmin, false) = true
          OR lower(COALESCE(e.rol, '')) IN ('gerente', 'admin', 'superadmin')
        )
    )
  );

CREATE POLICY rutas_update ON public.rutas
  FOR UPDATE TO authenticated
  USING (
    ejecutivo_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.ejecutivos e
      WHERE e.id = auth.uid()
        AND (
          COALESCE(e.es_superadmin, false) = true
          OR lower(COALESCE(e.rol, '')) IN ('gerente', 'admin', 'superadmin')
        )
    )
  );

CREATE POLICY rutas_delete ON public.rutas
  FOR DELETE TO authenticated
  USING (
    ejecutivo_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.ejecutivos e
      WHERE e.id = auth.uid()
        AND (
          COALESCE(e.es_superadmin, false) = true
          OR lower(COALESCE(e.rol, '')) IN ('gerente', 'admin', 'superadmin')
        )
    )
  );

-- 5) Policies visitas
DROP POLICY IF EXISTS visitas_all ON public.visitas;
DROP POLICY IF EXISTS visitas_select ON public.visitas;
DROP POLICY IF EXISTS visitas_insert ON public.visitas;
DROP POLICY IF EXISTS visitas_update ON public.visitas;
DROP POLICY IF EXISTS visitas_delete ON public.visitas;
DROP POLICY IF EXISTS visitas_select_own ON public.visitas;
DROP POLICY IF EXISTS visitas_insert_own ON public.visitas;

CREATE POLICY visitas_select ON public.visitas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rutas r
      WHERE r.id = visitas.ruta_id
        AND (
          r.ejecutivo_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.ejecutivos e
            WHERE e.id = auth.uid()
              AND (
                COALESCE(e.es_superadmin, false) = true
                OR lower(COALESCE(e.rol, '')) IN ('gerente', 'admin', 'superadmin')
              )
          )
        )
    )
  );

CREATE POLICY visitas_insert ON public.visitas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.rutas r
      WHERE r.id = visitas.ruta_id
        AND (
          r.ejecutivo_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.ejecutivos e
            WHERE e.id = auth.uid()
              AND (
                COALESCE(e.es_superadmin, false) = true
                OR lower(COALESCE(e.rol, '')) IN ('gerente', 'admin', 'superadmin')
              )
          )
        )
    )
  );

CREATE POLICY visitas_update ON public.visitas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rutas r
      WHERE r.id = visitas.ruta_id
        AND (
          r.ejecutivo_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.ejecutivos e
            WHERE e.id = auth.uid()
              AND (
                COALESCE(e.es_superadmin, false) = true
                OR lower(COALESCE(e.rol, '')) IN ('gerente', 'admin', 'superadmin')
              )
          )
        )
    )
  );

CREATE POLICY visitas_delete ON public.visitas
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rutas r
      WHERE r.id = visitas.ruta_id
        AND (
          r.ejecutivo_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.ejecutivos e
            WHERE e.id = auth.uid()
              AND (
                COALESCE(e.es_superadmin, false) = true
                OR lower(COALESCE(e.rol, '')) IN ('gerente', 'admin', 'superadmin')
              )
          )
        )
    )
  );

-- 6) RLS activo
ALTER TABLE public.rutas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas ENABLE ROW LEVEL SECURITY;

-- Listo. Probá: zona NOR-PONIENTE / ZONA SUR → pin → + A la ruta
