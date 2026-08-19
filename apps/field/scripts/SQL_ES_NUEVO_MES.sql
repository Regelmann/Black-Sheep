-- Ejecutar una vez en Supabase SQL Editor
alter table public.cartera add column if not exists es_nuevo_mes boolean default false;
