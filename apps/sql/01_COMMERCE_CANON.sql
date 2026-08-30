-- =============================================================================
-- KEYFOODS V56.16 CANON — Commerce Premium + Catálogo completo + Pedido seguro
-- Ejecutar DESPUÉS de SUPABASE_FIX_STOCK_PRECIOS.sql
-- Idempotente. Reemplaza get_public_catalogo / crear_pedido_publico.
-- =============================================================================
-- Contrato:
--   Excel → stock.precio_* → RPC → front (precios.js)
--   Precio: negociado → histórico → lista → consultar
--   Orden: habitual → reposición → ofertas/focos → corta fecha → resto
--   Catálogo = oferta_cliente_items ∪ stock con precio (operativo)
--   Pedido: valida SKU + stock + recalcula precio en servidor
-- =============================================================================

alter table public.stock add column if not exists es_foco_mes boolean default false;
alter table public.stock add column if not exists cobertura_dias numeric;
alter table public.stock add column if not exists estado_stock text;
alter table public.stock add column if not exists precio_unidad numeric;
alter table public.stock add column if not exists precio_caja numeric;
alter table public.stock add column if not exists precio_kilo numeric;
alter table public.stock add column if not exists imagen_url text;
alter table public.stock add column if not exists ficha_url text;
alter table public.stock add column if not exists resena text;

alter table public.pedidos add column if not exists estado text default 'recibido';
alter table public.pedidos add column if not exists fuente text;
alter table public.pedidos add column if not exists total_estimado numeric;
alter table public.pedidos add column if not exists nombre_cliente text;
alter table public.pedidos add column if not exists cargado_externo_en timestamptz;
alter table public.pedidos add column if not exists keylogistics_order_id text;
alter table public.pedidos add column if not exists token_catalogo text;

create index if not exists pedidos_cliente_fecha_idx
  on public.pedidos(cliente_key, creado_en desc);
create index if not exists pedidos_fuente_estado_idx
  on public.pedidos(fuente, estado, creado_en desc);

-- ---------------------------------------------------------------------------
-- get_public_catalogo
-- ---------------------------------------------------------------------------
-- ============================================================
-- get_public_catalogo()  → movida a 20_CATALOGO_CANONICO.sql
-- crear_pedido_publico() → movida a 21_PEDIDO_PUBLICO_CANONICO.sql
--
-- Estaban duplicadas en 01/05/10/11/16/19. En Postgres, `create or
-- replace` sólo pisa la función de firma IDÉNTICA, así que las
-- versiones viejas seguían vivas en la base. De ahí salieron dos
-- bugs de producción:
--   · catálogo: la función consultaba `activa`, la tabla tiene `activo`
--   · pedido:   dos firmas (2 y 3 args) → "function is not unique"
--
-- Este archivo conserva los índices y marcar_pedido_externo().
-- ============================================================

create or replace function public.marcar_pedido_externo(
  p_pedido_id uuid,
  p_estado text,
  p_keylogistics_order_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pedidos
  set
    estado = lower(trim(p_estado)),
    keylogistics_order_id = coalesce(
      nullif(trim(p_keylogistics_order_id), ''),
      keylogistics_order_id
    ),
    cargado_externo_en = case
      when lower(trim(p_estado)) = 'cargado_externo' then now()
      else cargado_externo_en
    end
  where id = p_pedido_id;
  return found;
end;
$$;

grant execute on function public.marcar_pedido_externo(uuid, text, text) to authenticated;
