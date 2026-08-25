# Ciclo cerrado de pedidos V2.6

## Flujo 100%

```
Cliente abre /catalogo/:token
    → arma carrito → Enviar pedido
    → RPC crear_pedido_publico
    → fila en pedidos (estado=recibido, fuente=catalogo_publico, ejecutivo_id de la oferta)

Ejecutivo abre Hoy
    → Order Inbox (badge con pendientes)
    → Abrir/editar (PedidoSheet)
    → Confirmar → A bodega → (WhatsApp desde PedidoSheet)
```

## SQL a correr

1. `sql/10b_STOCK_MEDIA_COLS.sql` (si no)
2. `sql/10_CATALOGO_WEB_V24.sql` (catálogo precios)
3. `sql/11_ORDER_INBOX_V26.sql` (crear_pedido + columnas)

## Condición crítica

`ofertas_cliente.ejecutivo_id` debe estar seteado al generar el link de catálogo
(OfertaClienteSheet ya lo escribe). Sin eso el inbox del ejecutivo no ve el pedido.

## Verificación

```sql
-- últimos pedidos web
select id, ejecutivo_id, nombre_cliente, estado, fuente, total_estimado, creado_en
from pedidos
where fuente = 'catalogo_publico'
order by creado_en desc
limit 10;
```

Stamp app: `v-BS-PLATFORM-V2.6-INBOX`

---

## Rollback

Si algo falla después del deploy, seguí **`docs/ROLLBACK.md`**.

Resumen rápido:

1. **App:** Vercel → Deployments → Promote anterior  
2. **Catálogo RPC:** re-ejecutar `sql/05_CATALOGO_PUBLICO.sql`  
3. **Pedido web RPC:** re-ejecutar función en `sql/01_COMMERCE_CANON.sql`  
4. **Columnas nuevas:** no hace falta borrarlas  
