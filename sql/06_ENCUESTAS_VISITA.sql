-- Encuesta de visita (primera visita / check-in estructurado)
-- Correr una vez en Supabase → SQL Editor

create table if not exists public.encuestas_visita (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid,
  checkin_id uuid,
  ejecutivo_id uuid,
  cliente_key text,
  nombre_local text,
  encargado_presente boolean,
  nombre_contacto text,
  telefono_contacto text,
  correo_contacto text,
  observaciones text,
  lat_real double precision,
  lng_real double precision,
  creado_en timestamptz default now()
);

create index if not exists encuestas_visita_visita_idx on public.encuestas_visita (visita_id);
create index if not exists encuestas_visita_ejecutivo_idx on public.encuestas_visita (ejecutivo_id);
create index if not exists encuestas_visita_creado_idx on public.encuestas_visita (creado_en desc);

alter table public.encuestas_visita enable row level security;

drop policy if exists encuestas_own on public.encuestas_visita;
create policy encuestas_own on public.encuestas_visita
  for all
  using (ejecutivo_id = auth.uid())
  with check (ejecutivo_id = auth.uid());

-- Superadmin lectura opcional
drop policy if exists encuestas_superadmin on public.encuestas_visita;
create policy encuestas_superadmin on public.encuestas_visita
  for select
  using (
    exists (
      select 1 from public.ejecutivos e
      where e.id = auth.uid() and coalesce(e.es_superadmin, false) = true
    )
  );
