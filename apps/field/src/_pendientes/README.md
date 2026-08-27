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
