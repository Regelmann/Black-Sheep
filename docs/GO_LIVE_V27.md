# Black Sheep Platform V2.7 LIVE — Go-Live

Stamp: `v-BS-PLATFORM-V2.7-LIVE`

## Qué incluye este salto

| Módulo | Mejora |
|--------|--------|
| Catálogo web | Shop V2.5 (hero, grid, drawer, precios personalizados) |
| Order Inbox | Pedidos web → Hoy → confirmar → bodega |
| Gerencia | Solo clientes con venta MTD > 0 (sin $0) |
| Hoy / Action Queue | Bloqueados fuera de la cola |
| Mapa | GPS-first + zoom 15 reforzado |
| SQL 10/10b/11 | Catálogo precios + media + pedido con nota |
| Rollback | `docs/ROLLBACK.md` |

## Deploy en 4 bloques

### A. Supabase (SQL Editor, en orden)

```
sql/10b_STOCK_MEDIA_COLS.sql
sql/10_CATALOGO_WEB_V24.sql
sql/11_ORDER_INBOX_V26.sql
```

Si algo de catálogo falla → rollback con `sql/05_CATALOGO_PUBLICO.sql` (ver ROLLBACK.md).

### B. Field app (Vercel root = apps/field)

Copiá/mergeá desde este zip:

- `apps/field/src/**` (completo preferible)
- Verificar `package.json` + lock en `apps/field`

```bash
cd apps/field
npm install --legacy-peer-deps
npm run build   # debe pasar local
```

Push a GitHub → Vercel deploy. Stamp esperado: `v-BS-PLATFORM-V2.7-LIVE`.

### C. Ciclo de datos

1. Excel del mes (ventas) + lista de precios + maestra en carpeta de producción.
2. Correr `scripts/KEYFOODS_CICLO_UNICO.py`.
3. Verificar:

```sql
select count(*) total,
  count(*) filter (where coalesce(precio_unidad,0)>0) con_precio
from stock;

select count(*) from gerencia_clientes where coalesce(venta_mtd,0)>0;
```

### D. Prueba del ciclo comercial (15 min)

1. Login ejecutivo → Hoy carga, Inbox visible.
2. Cliente → generar link catálogo (oferta con ejecutivo_id).
3. Abrir catálogo → ver precios (no todo “Consultar”).
4. Pedir 1 producto → Enviar.
5. Hoy → Inbox muestra pedido 🌐 → Confirmar → Abrir/editar.
6. Gerencia → zona → solo clientes con venta; abrir mix SKU.
7. Mapa → centra cerca de tu GPS.

## Si falla

Ver `docs/ROLLBACK.md`:

1. Vercel Promote deployment anterior  
2. SQL 05 / 01 según RPC  
3. No borrar columnas nuevas  

## Siguiente después de LIVE

- GitHub Actions ciclo diario (ops)
- PRODUCTOS_MEDIA (fotos reales)
- Prospectos por zona (ZONAS_COMUNAS)
