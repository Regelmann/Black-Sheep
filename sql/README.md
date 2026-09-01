# Migraciones SQL

Correr **en orden numérico**. Los saltos (12, 18) son intencionales:
esos archivos se eliminaron por estar obsoletos.

| Archivo | Qué hace | Estado |
|---|---|---|
| `01_COMMERCE_CANON.sql` | Índices de pedidos + `marcar_pedido_externo()` | vigente |
| `02_RIESGO_FUGA.sql` | Índices de riesgo de fuga | vigente |
| `03_PEDIDOS_HISTORIAL.sql` | Índices de historial | vigente |
| `04_ORDER_BRIDGE.sql` | Índices del puente de pedidos | vigente |
| `06_ENCUESTAS_VISITA.sql` | Tabla de encuestas + RLS | vigente |
| `07_STOCK_PRECIOS.sql` | Columnas de precio en stock | vigente |
| `08_PROSPECTOS_RLS.sql` | Tabla de prospectos + RLS | ⚠️ superseded por 28/47 |
| `09_ES_NUEVO_MES.sql` | Marca de cliente nuevo del mes | vigente |
| `10b_STOCK_MEDIA_COLS.sql` | Columnas de imagen en stock | vigente |
| `11_ORDER_INBOX_V26.sql` | `ALTER TABLE pedidos` (estado, fuente, total…) | vigente |
| `13_ADMIN_PANEL.sql` | Tablas del panel admin | ⚠️ superseded por 28/47 |
| `14_ADMIN_CONTROL.sql` | Control Center | ⚠️ superseded por 28/47 |
| `15_CICLO_PEDIDO_V29.sql` | Estados del ciclo de pedido | ⚠️ superseded por 28/47 |
| `17_MEMORY_DECISIONS.sql` | Efectividad de decisiones | ⚠️ superseded por 28/47 |
| `19_CATALOGO_OFERTA_CLIENTE.sql` | Tablas `ofertas_cliente` / `oferta_cliente_items` | ⚠️ superseded por 35/47 |
| `20_CATALOGO_CANONICO.sql` | **`get_public_catalogo()` — CANÓNICA** | ⚠️ políticas superseded por 35/47 |
| `21_PEDIDO_PUBLICO_CANONICO.sql` | **`crear_pedido_publico()` — CANÓNICA** | vigente |
| `28_RLS_ESTRICTO.sql` | RLS estricto núcleo (funciones + políticas) | vigente |
| `35_RLS_CATALOGO.sql` | RLS estricto catálogo público | vigente |
| `47_RLS_CIERRE_FINAL.sql` | **Cierra TODAS las políticas abiertas restantes** | **V13.2** |
| `48_AUDITORIA_TIMESTAMPS.sql` | **`updated_at` + trigger en tablas editables** | **V13.2** |

## Eliminados en V9.3

`05_CATALOGO_PUBLICO.sql`, `10_CATALOGO_WEB_V24.sql`, `16_CATALOGO_LISTA_FIRST.sql`

Los tres sólo redefinían `get_public_catalogo()` y/o `crear_pedido_publico()`.

**Por qué era un problema real:** `create or replace function` sólo pisa la
función de **firma idéntica**. Con la misma función definida en varios archivos,
la que quedaba viva era la del último script ejecutado — y nadie sabía cuál.

De ahí salieron dos bugs de producción:

- **Catálogo:** una versión consultaba `o.activa`, pero la tabla tiene `activo`
  → `column does not exist` → el cliente veía "Link inválido"
- **Pedido:** dos firmas distintas (2 y 3 argumentos) convivían
  → `function reference is not unique` → el pedido fallaba al enviarse

`npm run guard` (regla R8) detecta funciones duplicadas entre archivos.

## RLS multi-tenant — CERRADO

Los SQL históricos (08, 13, 14, 15, 17, 19, 20) abren políticas
`USING (true)` para `authenticated`. Esto NO se usa como estado final:
`28_RLS_ESTRICTO.sql` (núcleo), `35_RLS_CATALOGO.sql` (catálogo) y
`47_RLS_CIERRE_FINAL.sql` (cierre total) las reemplazan.

**Regla operativa:** cualquier deploy de esquema debe terminar corriendo
`47_RLS_CIERRE_FINAL.sql` (y `48_AUDITORIA_TIMESTAMPS.sql` para `updated_at`).
Si se re-ejecuta un SQL viejo, volver a correr `47`.
