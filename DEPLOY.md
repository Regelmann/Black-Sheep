# DEPLOY — Black Sheep V13.1

**Versión:** `v-BS-PLATFORM-V13.1`

## Orden obligatorio

1. Verificar estado de Supabase con `sql/00_VERIFICAR_ESTADO.sql`.
2. Backup si el cambio modifica esquema/datos.
3. Ejecutar `sql/44_VENTAS_INTEGRACION_TOTAL.sql` si la capa de ventas no existe.
4. Ejecutar `sql/46_VENTAS_REPORTES_APP.sql`.
5. Ejecutar el Ciclo Único en modo validación/sin escritura.
6. Revisar totales histórico + nuevo.
7. `cd apps/field && npm ci && npm run verify`.
8. Verificar Web: `cd apps/web && npm ci && npm run lint && npm run typecheck && npm run build`.
9. Commit + push.
10. Esperar CI verde y verificar Vercel.
11. Confirmar `BUILD_STAMP = v-BS-PLATFORM-V13.1`.
12. Smoke test móvil y offline.

## Ventas

`sql/44_VENTAS_INTEGRACION_TOTAL.sql` crea la capa operacional.
`sql/46_VENTAS_REPORTES_APP.sql` crea/actualiza las vistas que consume `/ventas`.

**Reglas:** Pedido no suma venta; Factura suma; NC resta; Venta neta = Factura − NC.

## Colab

Ejecutar `scripts/CICLO_UNICO.py`. Debe encontrar histórico, `Nuevas ventas.xlsx`, maestra, stock y precios según la configuración vigente.

Primera corrida recomendada:

```python
import os
os.environ['KF_SKIP_SUPABASE'] = '1'
os.environ['KF_SKIP_PLACES'] = '1'
```

Revisar el reporte y luego correr normalmente.

## GitHub

Usar `scripts/DEPLOY_VENTAS_V13_1.sh`. El script primero hace `rsync --dry-run`, luego sincroniza, verifica, muestra eliminaciones y sólo después permite commit/push.

## Rollback

El rollback de código se hace por commit. El rollback de esquema/datos se hace con el backup de Supabase. No borrar tablas de ventas para “corregir” una corrida: primero auditar duplicados e idempotencia.

## Inventario SQL versionado

El guard exige que **todo `.sql` del repositorio aparezca aquí**. Los archivos históricos siguen versionados porque son parte del esquema existente; para una base ya instalada no se vuelven a ejecutar indiscriminadamente. Las migraciones nuevas de la entrega actual están marcadas.

- `00_VERIFICAR_ESTADO.sql`
- `01_COMMERCE_CANON.sql`
- `02_RIESGO_FUGA.sql`
- `03_PEDIDOS_HISTORIAL.sql`
- `04_ORDER_BRIDGE.sql`
- `06_ENCUESTAS_VISITA.sql`
- `07_STOCK_PRECIOS.sql`
- `08_PROSPECTOS_RLS.sql`
- `09_ES_NUEVO_MES.sql`
- `10b_STOCK_MEDIA_COLS.sql`
- `11_ORDER_INBOX_V26.sql`
- `13_ADMIN_PANEL.sql`
- `14_ADMIN_CONTROL.sql`
- `15_CICLO_PEDIDO_V29.sql`
- `17_MEMORY_DECISIONS.sql`
- `19_CATALOGO_OFERTA_CLIENTE.sql`
- `20_CATALOGO_CANONICO.sql`
- `21_PEDIDO_PUBLICO_CANONICO.sql`
- `22_HOTFIX_V931.sql`
- `23_DATA_ISOLATION_CATALOGO.sql`
- `25_CATALOGO_FINAL.sql`
- `26_CATALOGO_ORDEN.sql`
- `27_IDEMPOTENCIA.sql`
- `28_RLS_ESTRICTO.sql`
- `29_CONTAR_PROSPECTOS.sql`
- `30_SEED_ZONAS_COMUNAS.sql`
- `31_ZONAS_QUE_USA_LA_APP.sql`
- `32_CONTRADICCION_ZONA_COMUNA.sql`
- `33_ALINEAR_MAESTRA_ZONAS.sql`
- `34_POR_QUE_FALTAN_PROSPECTOS.sql`
- `35_RLS_CATALOGO.sql`
- `36_CARTERA_INSERT_ADMIN.sql`
- `37_PUSH_SUSCRIPCIONES.sql`
- `38_PUSH_AUTO.sql`
- `39_PORTAL_PEDIDOS.sql`
- `40_STOCK_COLUMNAS_CICLO.sql`
- `41_VENTAS_LINEAS.sql`
- `44_VENTAS_INTEGRACION_TOTAL.sql` — **VENTAS V13.1**
- `46_VENTAS_REPORTES_APP.sql` — **VENTAS V13.1**
