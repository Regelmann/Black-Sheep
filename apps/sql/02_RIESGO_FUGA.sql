-- Black Sheep / KeyFoods — columnas riesgo de fuga en cartera
-- Correr una vez en SQL Editor (Supabase)

alter table public.cartera add column if not exists riesgo_score int;
alter table public.cartera add column if not exists riesgo_nivel text;
alter table public.cartera add column if not exists riesgo_label text;
alter table public.cartera add column if not exists riesgo_razones text;
alter table public.cartera add column if not exists riesgo_plata numeric;

create index if not exists cartera_riesgo_score_idx
  on public.cartera (riesgo_score desc nulls last);

create index if not exists cartera_riesgo_nivel_idx
  on public.cartera (riesgo_nivel);

comment on column public.cartera.riesgo_score is '0-100 algoritmo fuga (ciclo + front)';
comment on column public.cartera.riesgo_nivel is '1_ACTIVO … 5_FUGADO | 0_NUNCA | BLOQUEADO';
