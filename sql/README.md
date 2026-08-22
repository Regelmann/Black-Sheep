# SQL Supabase — orden de ejecución

Ejecutar **una sola vez** (o al actualizar schema) en el SQL Editor del proyecto Supabase del tenant.

| # | Archivo | Qué hace |
|---|---------|----------|
| 01 | `01_COMMERCE_CANON.sql` | Pedidos, ofertas, catálogo público, RPCs |
| 02 | `02_RIESGO_FUGA.sql` | Columnas / vista riesgo de fuga |
| 03 | `03_PEDIDOS_HISTORIAL.sql` | Historial de pedidos |
| 04 | `04_ORDER_BRIDGE.sql` | Bridge inbox / bodega |
| 05 | `05_CATALOGO_PUBLICO.sql` | Catálogo completo + familia |
| 06 | `06_ENCUESTAS_VISITA.sql` | Encuestas post check-in |
| 07 | `07_STOCK_PRECIOS.sql` | Stock + precios alineados |
| 08 | `08_PROSPECTOS_RLS.sql` | RLS prospectos |
| 09 | `09_ES_NUEVO_MES.sql` | Flag clientes nuevos del mes |

Si un statement falla por “already exists”, seguir con el siguiente.
No correr SQL viejos de carpetas V56.3 / V56.4 sueltos: **este folder es la fuente de verdad**.

| 10 | `10_CATALOGO_WEB_V24.sql` | Catálogo web: histórico + lista + negociado + media |
| 10b | `10b_STOCK_MEDIA_COLS.sql` | Columnas imagen/resena/ficha/precios en stock |

| 11 | `11_ORDER_INBOX_V26.sql` | Order Inbox: crear_pedido + nota + índices |
