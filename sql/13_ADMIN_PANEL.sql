-- ⚠️  ATENCIÓN · las políticas `using (true)` de este archivo quedan
--     REEMPLAZADAS por 28_RLS_ESTRICTO.sql.
--     `using (true)` = cualquier usuario autenticado ve TODO. Con un
--     solo tenant no duele; con el segundo es fuga entre empresas.
--     Correr 28 SIEMPRE después de este archivo.

-- =============================================================================
-- BLACK SHEEP · Admin panel (zonas / cartera / precios)
-- Permite a usuarios autenticados actualizar asignación y precios desde la app.
-- Ejecutar UNA vez. Ajustá políticas si usás roles más estrictos.
-- =============================================================================

-- Mapa comuna → zona (también usado por prospectos)
create table if not exists public.zonas_comunas (
  comuna text primary key,
  zona text not null
);

alter table public.zonas_comunas enable row level security;

drop policy if exists zonas_comunas_select on public.zonas_comunas;
drop policy if exists zonas_comunas_write on public.zonas_comunas;
create policy zonas_comunas_select on public.zonas_comunas
  for select to authenticated using (true);
create policy zonas_comunas_write on public.zonas_comunas
  for all to authenticated using (true) with check (true);

-- Cartera: update zona / ejecutivo / comuna
drop policy if exists cartera_update_admin on public.cartera;
create policy cartera_update_admin on public.cartera
  for update to authenticated
  using (true)
  with check (true);

-- Stock precios
drop policy if exists stock_update_admin on public.stock;
create policy stock_update_admin on public.stock
  for update to authenticated
  using (true)
  with check (true);

-- Prospectos reasignación zona
drop policy if exists prospectos_update_admin on public.prospectos;
create policy prospectos_update_admin on public.prospectos
  for update to authenticated
  using (true)
  with check (true);

-- Seed mínimo si vacío
insert into public.zonas_comunas (comuna, zona)
select * from (values
  ('LAS CONDES', 'NOR-ORIENTE'),
  ('VITACURA', 'NOR-ORIENTE'),
  ('PROVIDENCIA', 'NOR-PONIENTE'),
  ('NUNOA', 'NOR-PONIENTE'),
  ('LA FLORIDA', 'ZONA SUR'),
  ('MAIPU', 'ZONA SUR')
) as v(comuna, zona)
on conflict (comuna) do nothing;

comment on table public.zonas_comunas is 'Admin panel + prospectos: comuna → zona de terreno';
