-- =============================================================================
-- BLACK SHEEP · Order Inbox V2.6 — cierra ciclo catálogo → ejecutivo
-- =============================================================================
-- 1) columnas de pedidos
-- 2) crear_pedido_publico con p_nota opcional
-- 3) RLS lectura por ejecutivo (si aplica)
-- =============================================================================

alter table public.pedidos add column if not exists estado text default 'recibido';
alter table public.pedidos add column if not exists fuente text;
alter table public.pedidos add column if not exists total_estimado numeric;
alter table public.pedidos add column if not exists token_catalogo text;
alter table public.pedidos add column if not exists ejecutivo_id text;
alter table public.pedidos add column if not exists nota text;
alter table public.pedidos add column if not exists creado_en timestamptz default now();
alter table public.pedidos add column if not exists actualizado_en timestamptz default now();

create index if not exists pedidos_fuente_estado_idx
  on public.pedidos (fuente, estado, creado_en desc);
create index if not exists pedidos_ejecutivo_fuente_idx
  on public.pedidos (ejecutivo_id, fuente, creado_en desc);
create index if not exists pedidos_ejecutivo_creado_idx
  on public.pedidos (ejecutivo_id, creado_en desc);

-- crear_pedido_publico con nota (compatible con catálogo V2.5)
-- ============================================================
-- La definición de crear_pedido_publico() se movió a
-- 21_PEDIDO_PUBLICO_CANONICO.sql (fuente única).
--
-- Estaba duplicada acá, en 01 y en 05 con DOS firmas distintas
-- (2 y 3 argumentos), lo que producía en Postgres:
--   ERROR: function reference "crear_pedido_publico" is not unique
-- y el pedido del cliente desde el catálogo fallaba.
--
-- Este archivo conserva SOLO los ALTER TABLE de arriba, que crean
-- las columnas que la función canónica necesita.
-- ============================================================
