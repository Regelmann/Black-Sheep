# V2.9 Integrado — pedido + offline + admin + recomendaciones

Un solo salto (no parches sueltos):

## A · Ciclo de pedido
- Estados: borrador → recibido → confirmado → preparado → enviado → entregado (cancelado)
- `lib/pedidoEstados.js` — máquina de estados
- Order Inbox: botones del siguiente estado + **WhatsApp bodega**
- SQL `15_CICLO_PEDIDO_V29.sql`

## B · Offline
- Ya existía cola `enqueueAction` / `flushActionQueue` en `lib/offline.js`
- Hoy muestra cola y reintenta al volver online
- Pedidos: si no hay red, quedan en cola hasta flush

## C · Admin usuarios
- Pestaña **Usuarios**: alta ejecutivo, zona, rol
- Luego crear el mismo email en Supabase Auth

## D · Recomendaciones Hoy
- `lib/recomendaciones.js` — prioriza reponer / riesgo / ritmo
- Banner “Hoy: X a reponer · Y en riesgo · brecha …”

## Deploy
1. SQL 15 (y 14 si no corriste Admin Control)
2. Merge field src → push
3. Stamp `v-BS-PLATFORM-V2.9-INTEGRADO`
