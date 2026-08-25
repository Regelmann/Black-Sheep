-- =============================================================================
-- BLACK SHEEP · Order Bridge / Inbox (V56.13)
-- SQL canónico de commerce: SUPABASE_COMMERCE_V56_4.sql (NO ejecutar V56_3 encima)
-- Este archivo solo refuerza índices y documenta estados del pipeline.
-- =============================================================================

-- Estados usados por el front (text libre en pedidos.estado):
--   recibido | borrador | enviado | confirmado | pendiente_carga
--   | enviado_bodega | cargado | cancelado
-- Fuente:
--   catalogo_publico | field_app

create index if not exists pedidos_fuente_estado_idx
  on public.pedidos (fuente, estado, creado_en desc);

create index if not exists pedidos_ejecutivo_fuente_idx
  on public.pedidos (ejecutivo_id, fuente, creado_en desc);

-- crear_pedido_publico (V56.4) ya inserta:
--   estado = 'recibido', fuente = 'catalogo_publico'
