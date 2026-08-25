-- Índices para historial de pedidos (idempotente)
create index if not exists pedidos_ejecutivo_creado_idx
  on public.pedidos (ejecutivo_id, creado_en desc);
create index if not exists pedidos_cliente_creado_idx
  on public.pedidos (cliente_key, creado_en desc);
create index if not exists pedidos_estado_idx
  on public.pedidos (estado);
