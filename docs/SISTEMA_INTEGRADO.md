# Black Sheep — Sistema integrado

## Principio
Todo cambio se entrega como **paquete completo** (field + web + sql + scripts).
No se publican parches de una sola pantalla.

## Fuentes de verdad
| Dominio | Módulo |
|---------|--------|
| Métricas de terreno | `lib/metrics.js` |
| Mix / reposición | `lib/coach.js` → `parseSkuDetalle` |
| Precios | `lib/precios.js` |
| Ciclo pedido | `lib/pedidoEstados.js` + `lib/pedido.js` |
| Zonas | `lib/zonas.js` |
| Tokens visuales | `styles/tokens.css` + `index.legacy.css` |
| Headers / carga | `.bs-page-hero` / `.bs-spinner` |

## Navegación
4 tabs: Hoy · Mapa · Clientes · Más  
Más = Stock, Gerencia (rol), Admin (rol), Salir

## Multi-tenant
`lib/tenants.js` + Supabase por empresa. Landing en `apps/web`.
