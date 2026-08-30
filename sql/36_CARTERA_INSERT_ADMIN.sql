-- ============================================================
-- 36 · CARTERA INSERT DESDE ADMIN
-- ============================================================
-- El alta de cliente en /admin hace INSERT en public.cartera.
-- Si solo existe política de UPDATE, el alta falla.
-- Idempotente.
-- ============================================================

drop policy if exists cartera_insert_admin on public.cartera;
create policy cartera_insert_admin on public.cartera
  for insert to authenticated
  with check (public.soy_admin() AND (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant()));

-- Opcional: permitir insert de prospectos desde admin en el futuro
drop policy if exists prospectos_insert_admin on public.prospectos;
create policy prospectos_insert_admin on public.prospectos
  for insert to authenticated
  with check (public.soy_admin() AND (public.mi_tenant() IS NULL OR tenant_id = public.mi_tenant()));
