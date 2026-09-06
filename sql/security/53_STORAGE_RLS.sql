-- 53 · STORAGE MULTI-TENANT
-- Buckets privados. La primera carpeta de cada objeto es el tenant_id.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('cargas', 'cargas', FALSE, 26214400)
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = 26214400;

DROP POLICY IF EXISTS bs_cargas_select ON storage.objects;
CREATE POLICY bs_cargas_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'cargas'
  AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())
);

DROP POLICY IF EXISTS bs_cargas_insert ON storage.objects;
CREATE POLICY bs_cargas_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cargas'
  AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())
  AND (SELECT public.is_tenant_admin())
);

DROP POLICY IF EXISTS bs_cargas_delete ON storage.objects;
CREATE POLICY bs_cargas_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'cargas'
  AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())
  AND (SELECT public.is_tenant_admin())
);

-- Los objetos de producto siguen el mismo patrón.
DROP POLICY IF EXISTS bs_productos_select ON storage.objects;
CREATE POLICY bs_productos_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'productos'
  AND (storage.foldername(name))[1] = (SELECT public.current_tenant_id())
);
