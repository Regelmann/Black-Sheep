# V2.7.1 POLISH

Stamp: `v-BS-PLATFORM-V2.7.1-POLISH`

## Cambios

1. **Cartera filtros** — `filter-row` con flex-wrap; chips pill consistentes (no se desordenan).
2. **Visita** — CTA primario = Tomar pedido (PedidoSheet); secundario = Enviar catálogo web (sin duplicar el mismo botón).
3. **Gerencia** — empty states claros: sin mix / sin clientes con venta MTD.
4. **CSS** — utilidades `.oi-card`, `.gerencia-sku-empty`, filtros móviles.

## Deploy

Solo field `src/` + hard refresh. SQL sin cambios respecto a V2.7.

## Rollback

Vercel Promote al deployment `v-BS-PLATFORM-V2.7-LIVE` si algo se ve mal.
