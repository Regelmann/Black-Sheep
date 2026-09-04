-- ═══════════════════════════════════════════════════════════════════
-- 47 · BUCKET DE CARGAS — la base de replicación
--
-- Cada empresa sube sus 4 archivos a SU carpeta:
--
--   cargas/keyfoods/2026-09-04/precios.xlsx
--   cargas/keyfoods/2026-09-04/stock.xlsx
--   cargas/keyfoods/2026-09-04/maestra.xlsx
--   cargas/keyfoods/2026-09-04/ventas.xlsx
--
-- El primer segmento es el tenant. **Sin eso, dos clientes se pisarían
-- los archivos** — y con el bucket privado, uno podría leer los del otro.
--
-- El ciclo ETL los toma de acá en vez de Drive: una carpeta por empresa
-- y por fecha, así se puede reprocesar un día puntual sin tocar el resto.
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('cargas', 'cargas', false, 26214400)   -- 25 MB, igual que la UI
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 26214400;

-- ── Aislamiento por empresa ────────────────────────────────────────
-- La política compara el PRIMER segmento de la ruta contra el tenant
-- del usuario. Un gerente de la empresa A no puede escribir ni leer en
-- la carpeta de la empresa B.

DROP POLICY IF EXISTS cargas_subir  ON storage.objects;
DROP POLICY IF EXISTS cargas_leer   ON storage.objects;
DROP POLICY IF EXISTS cargas_borrar ON storage.objects;

CREATE POLICY cargas_subir ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cargas'
  AND (storage.foldername(name))[1] = COALESCE(
        (SELECT tenant_id FROM public.ejecutivos WHERE id = auth.uid()),
        'keyfoods'
      )
  AND EXISTS (
        SELECT 1 FROM public.ejecutivos
        WHERE id = auth.uid()
          AND rol IN ('gerente', 'admin', 'superadmin')
      )
);

CREATE POLICY cargas_leer ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'cargas'
  AND (storage.foldername(name))[1] = COALESCE(
        (SELECT tenant_id FROM public.ejecutivos WHERE id = auth.uid()),
        'keyfoods'
      )
);

-- Sobrescribir una carga del mismo día requiere borrar primero
-- (el upsert de Supabase Storage hace DELETE + INSERT).
CREATE POLICY cargas_borrar ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'cargas'
  AND (storage.foldername(name))[1] = COALESCE(
        (SELECT tenant_id FROM public.ejecutivos WHERE id = auth.uid()),
        'keyfoods'
      )
  AND EXISTS (
        SELECT 1 FROM public.ejecutivos
        WHERE id = auth.uid()
          AND rol IN ('gerente', 'admin', 'superadmin')
      )
);

-- ── La columna que hace posible todo esto ──────────────────────────
-- Sin `tenant_id` en ejecutivos, las políticas de arriba caen siempre
-- al default 'keyfoods' y el aislamiento no existe.
ALTER TABLE public.ejecutivos
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'keyfoods';

CREATE INDEX IF NOT EXISTS idx_ejecutivos_tenant
  ON public.ejecutivos (tenant_id);

-- ── Diagnóstico ────────────────────────────────────────────────────
SELECT tenant_id, COUNT(*) AS ejecutivos
FROM public.ejecutivos
GROUP BY tenant_id;
