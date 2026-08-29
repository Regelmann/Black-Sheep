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

## Lote del patch 7 (V10.5)

| Test | Por qué está acá |
|---|---|
| `importantes.test.js` | Mide **155 `!important`**, 128 de ellos en `v90-fixes.css`. Es deuda de la limpieza de CSS (Fase 3), no un bug activo. El test es correcto y debe reactivarse cuando esa hoja se consolide. |
| `cascadaContraste.test.js` | Contraste sobre la cascada completa. Falla por lo mismo: la cascada tiene 7 hojas peleando. |
| `pedidoTotales.test.js` | Node no resuelve `lib/precios` sin extensión al importar `pedido.js`. Falla la resolución de módulos, no la lógica. |
| `syncIdempotencia.test.js` | Igual: `supabase.js` importa `./tenants` sin extensión. |

Los dos últimos se arreglan agregando la extensión `.js` a esos imports —
cambio de una línea cada uno, pero toca módulos del arranque y prefiero
hacerlo con el repo ya ordenado.

## Reintentados en V11.6 — siguen sin poder correr

Con los 86 imports sin extensión corregidos en V11.5 esperaba que
arrancaran. No es un problema de resolución:

```
SyntaxError: './pedido.js' does not provide an export named 'lineasValidas'
```

**Esperan funciones que nunca se escribieron.** Son tests de una versión
de `pedido.js` y `syncHandlers.js` que existió en el árbol de la otra
herramienta y no acá.

Reactivarlos exige escribir `lineasValidas()` y el resto de la API que
asumen — no es renombrar un archivo. Queda anotado como trabajo real,
no como pendiente administrativo.
