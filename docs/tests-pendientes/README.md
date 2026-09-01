# Tests pendientes

Vinieron en el patch V11 y **esperan versiones de componentes que no se
integraron** (Admin con TanStack, diálogos propios, `demoData` cableado).

No están borrados ni desactivados por conveniencia: **cada uno describe algo
cierto**. Se reactivan renombrando a `.test.js` cuando exista lo que verifican.

Lo que sí se arregló de este lote, porque eran bugs reales de la app actual:

| Hallazgo | Estado |
|---|---|
| Áreas táctiles < 44px en 8 elementos | ✅ corregido |
| El `Proxy` de Supabase lanza `TypeError` genérico con cliente null | ✅ corregido |
| `ErrorBoundary` no envolvía a los providers | ✅ corregido |
| El SW se registraba en dev y cacheaba el HTML | ✅ corregido |

Lo que queda descrito acá y sigue abierto:

- `cascada.test.js` — `.bs-nav` definida en CSS y usada en ningún `.jsx`;
  la barra se centra dos veces (`translateX` + `margin auto`)
- `muertas.test.js` — reglas CSS sin selector correspondiente
- `dialogos.test.js` — los diálogos deben decir **qué** eliminan, no sólo
  "¿Confirmar?"

Son deuda de la limpieza de CSS (Fase 3 del plan), no bugs activos.

## Reactivados en V13.2

- **`pedidoTotales`** → vive en `apps/field/src/lib/pedidoTotales.test.js`.
  Se escribieron `lineasValidas()` y `totalLineas()`, y los cuatro totales
  (guardar, WhatsApp cliente, WhatsApp bodega, PDF forma) ya usan la misma
  regla.
- **`syncIdempotencia`** → vive en `apps/field/src/lib/syncIdempotencia.test.js`.
  `handleNota`, `handlePedido` y `handleNoVenta` ahora mandan
  `client_op_id`, tratan `23505` como éxito y degradan si la migración
  `sql/27` no está aplicada. El test también valida que un error de RLS no
  produzca dos inserts.

## Lote del patch 7 (V10.5) — aún pendiente

| Test | Por qué está acá |
|---|---|
| `importantes.test.js` | Mide **155 `!important`**, 128 de ellos en `v90-fixes.css`. Es deuda de la limpieza de CSS (Fase 3), no un bug activo. |
| `cascadaContraste.test.js` | Contraste sobre la cascada completa. Falla por lo mismo: la cascada tiene 7 hojas peleando. |
