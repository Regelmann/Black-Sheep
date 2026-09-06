-- 51 · MULTITENANT / RBAC CANÓNICO
-- Objetivo: preparar la base para múltiples empresas sin fallback inseguro.
-- Ejecutar después de 50_FUNDACION_MULTITENANT.sql.

CREATE TABLE IF NOT EXISTS public.tenant_members (
  tenant_id TEXT NOT NULL REFERENCES public.tenants(id) ON UPDATE CASCADE ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol TEXT NOT NULL DEFAULT 'vendedor',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT tenant_members_rol_chk CHECK (rol IN (
    'owner','admin','gerente','supervisor','vendedor','data_manager','viewer'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_members_active_user
  ON public.tenant_members(user_id)
  WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_tenant_members_user
  ON public.tenant_members(user_id);

CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant
  ON public.tenant_members(tenant_id);

-- Backfill desde ejecutivos existentes. No sobrescribe membresías existentes.
INSERT INTO public.tenant_members (tenant_id, user_id, rol, activo)
SELECT e.tenant_id,
       e.id::uuid,
       CASE lower(COALESCE(e.rol,''))
         WHEN 'superadmin' THEN 'admin'
         WHEN 'supervisor' THEN 'supervisor'
         WHEN 'gerente' THEN 'gerente'
         WHEN 'admin' THEN 'admin'
         ELSE 'vendedor'
       END,
       COALESCE(e.activo, TRUE)
FROM public.ejecutivos e
WHERE e.tenant_id IS NOT NULL
  AND e.id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- Claim helpers: fail closed. No default tenant.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(auth.jwt() ->> 'tenant_id', '');
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(lower(auth.jwt() ->> 'rol'), '');
$$;

CREATE OR REPLACE FUNCTION public.is_role(p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(public.current_user_role() = ANY(p_roles), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_user_role() IN ('owner','admin','gerente');
$$;

-- Hook: selecciona la membresía activa del usuario.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_claims JSONB := COALESCE(event->'claims', '{}'::jsonb);
  v_tenant TEXT;
  v_rol TEXT;
BEGIN
  SELECT tm.tenant_id, lower(tm.rol)
    INTO v_tenant, v_rol
    FROM public.tenant_members tm
   WHERE tm.user_id = (event->>'user_id')::uuid
     AND tm.activo = TRUE
   ORDER BY tm.creado_en
   LIMIT 1;

  -- Sin membresía no se emite contexto privilegiado.
  IF v_tenant IS NOT NULL THEN
    v_claims := jsonb_set(v_claims, '{tenant_id}', to_jsonb(v_tenant), TRUE);
    v_claims := jsonb_set(v_claims, '{rol}', to_jsonb(v_rol), TRUE);
  ELSE
    v_claims := v_claims - 'tenant_id' - 'rol';
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims, TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_role(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin() TO authenticated;

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_members_select ON public.tenant_members;
CREATE POLICY tenant_members_select ON public.tenant_members
FOR SELECT TO authenticated
USING (
  tenant_id = (SELECT public.current_tenant_id())
  AND (
    user_id = auth.uid()
    OR (SELECT public.is_tenant_admin())
  )
);

DROP POLICY IF EXISTS tenant_members_write ON public.tenant_members;
CREATE POLICY tenant_members_write ON public.tenant_members
FOR ALL TO authenticated
USING (
  tenant_id = (SELECT public.current_tenant_id())
  AND (SELECT public.is_tenant_admin())
)
WITH CHECK (
  tenant_id = (SELECT public.current_tenant_id())
  AND (SELECT public.is_tenant_admin())
);
