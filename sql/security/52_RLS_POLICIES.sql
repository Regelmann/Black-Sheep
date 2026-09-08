-- 52 · RLS CANÓNICO POR TENANT
-- No ejecutar sobre producción sin revisar el preflight de 99_SECURITY_DIAGNOSTICS.sql.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cartera','prospectos','stock','ventas_lineas','ventas_documentos','pedidos',
    'notas_cliente','checkins','ofertas_cliente','oferta_cliente_items',
    'gerencia','gerencia_clientes','zonas','zonas_comunas','metas','metas_zona',
    'focos','tendencia','snapshot_meta','ejecutivos'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=t
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='tenant_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

      -- Las entidades con ejecutivo_id reciben una política SELECT más
      -- restrictiva abajo. PostgreSQL combina políticas permisivas con OR,
      -- por lo que NO debemos dejar una política tenant-only adicional.
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=t AND column_name='ejecutivo_id'
      ) THEN
        EXECUTE format('DROP POLICY IF EXISTS bs_tenant_select ON public.%I', t);
        EXECUTE format($p$
          CREATE POLICY bs_tenant_select ON public.%I
          FOR SELECT TO authenticated
          USING (tenant_id = (SELECT public.current_tenant_id()))
        $p$, t);
      ELSE
        EXECUTE format('DROP POLICY IF EXISTS bs_tenant_select ON public.%I', t);
      END IF;

      EXECUTE format('DROP POLICY IF EXISTS bs_tenant_insert ON public.%I', t);
      EXECUTE format($p$
        CREATE POLICY bs_tenant_insert ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (tenant_id = (SELECT public.current_tenant_id()))
      $p$, t);

      EXECUTE format('DROP POLICY IF EXISTS bs_tenant_update ON public.%I', t);
      EXECUTE format($p$
        CREATE POLICY bs_tenant_update ON public.%I
        FOR UPDATE TO authenticated
        USING (tenant_id = (SELECT public.current_tenant_id()))
        WITH CHECK (tenant_id = (SELECT public.current_tenant_id()))
      $p$, t);

      EXECUTE format('DROP POLICY IF EXISTS bs_tenant_delete ON public.%I', t);
      EXECUTE format($p$
        CREATE POLICY bs_tenant_delete ON public.%I
        FOR DELETE TO authenticated
        USING (tenant_id = (SELECT public.current_tenant_id()))
      $p$, t);
    END IF;
  END LOOP;
END $$;

-- Restricción adicional por ownership para entidades de terreno/comerciales.
-- Gerencia/admin ve todo su tenant; vendedor sólo sus filas cuando existe ejecutivo_id.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cartera','prospectos','checkins','metas','focos'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='ejecutivo_id'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS bs_owner_select ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS bs_tenant_update ON public.%I', t);
      EXECUTE format('DROP POLICY IF EXISTS bs_tenant_delete ON public.%I', t);
      EXECUTE format($p$
        CREATE POLICY bs_owner_select ON public.%I
        FOR SELECT TO authenticated
        USING (
          tenant_id = (SELECT public.current_tenant_id())
          AND (
            (SELECT public.is_tenant_admin())
            OR ejecutivo_id::text = auth.uid()::text
          )
        )
      $p$, t);
      EXECUTE format($p$
        CREATE POLICY bs_owner_update ON public.%I
        FOR UPDATE TO authenticated
        USING (
          tenant_id = (SELECT public.current_tenant_id())
          AND (
            (SELECT public.is_tenant_admin())
            OR ejecutivo_id::text = auth.uid()::text
          )
        )
        WITH CHECK (
          tenant_id = (SELECT public.current_tenant_id())
          AND (
            (SELECT public.is_tenant_admin())
            OR ejecutivo_id::text = auth.uid()::text
          )
        )
      $p$, t);
      EXECUTE format($p$
        CREATE POLICY bs_owner_delete ON public.%I
        FOR DELETE TO authenticated
        USING (
          tenant_id = (SELECT public.current_tenant_id())
          AND (
            (SELECT public.is_tenant_admin())
            OR ejecutivo_id::text = auth.uid()::text
          )
        )
      $p$, t);
    END IF;
  END LOOP;
END $$;

-- Nota: Storage usa políticas propias en storage.objects.
-- El catálogo público por token es una excepción deliberada y debe
-- mantenerse con una política anon específica, nunca con USING(true) global.
