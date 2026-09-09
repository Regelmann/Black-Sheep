# Rendimiento

**Versión:** `v-BS-PLATFORM-V15.4` · medido el 2026-09-08 (mismo pipeline que el CI)

## Punto de partida

```
738 kB · UN SOLO ARCHIVO
```

Un vendedor descargaba **todo** para abrir "Hoy": Gerencia (2.300 líneas),
Admin (958), el catálogo del cliente. En 4G de terreno son varios segundos
mirando una pantalla en blanco.

El estándar es tajante: **el 70% de los usuarios espera menos de 2 segundos.**

## Resultado

| Chunk | Tamaño | Cuándo se descarga |
|---|---|---|
| **app** | **269 kB** (82 kB gzip) | siempre — es lo que cambia en cada deploy |
| vendor-react | 190 kB | una vez, se cachea meses |
| vendor-supabase | 214 kB | una vez, se cachea meses |
| vendor (xlsx) | 435 kB | sólo al cargar datos — el vendedor nunca lo baja |
| Gerencia | 61 kB | sólo si abre Gerencia |
| Admin | 27 kB | sólo si abre Admin |
| CatalogoCliente | 15 kB | sólo el cliente, por su link |
| Stock | 12 kB | sólo si abre Stock |

**269 kB en el chunk de la app — dentro del techo de 350 kB del CI, pero sobre
el objetivo de 250 kB: el CI emite aviso.** Bajarlo de vuelta es trabajo pendiente
del roadmap (3.1), no un logro cerrado.

## Las dos decisiones

### 1 · Qué se carga a demanda

El criterio **no** es el tamaño. Es **dónde se usa**:

- **Directo:** Login, Hoy, Ruta, Visita, Cartera.
  Se usan **en la calle**, sin señal garantizada. Si el vendedor entra a un
  subterráneo y Ruta no está descargada, no puede trabajar.
- **A demanda:** Gerencia, Admin, Stock, Catálogo.
  Se abren desde una oficina con wifi.

Cargar Ruta a demanda habría bajado más el bundle y **roto la app en terreno**.

### 2 · Vendors separados por frecuencia de cambio

React y Supabase cambian una vez cada varios meses. El código de la app cambia
en cada deploy.

Juntos: **cada deploy invalida 363 kB de librerías** que el vendedor ya tenía
cacheadas, y las vuelve a bajar en 4G.

Separados: un deploy normal baja **sólo 236 kB**.

Esa es la diferencia real en el teléfono, más que el número absoluto.

## Nunca pantalla en blanco

`<Suspense>` con un esqueleto mientras baja el chunk. El estándar offline-first
lo pide explícitamente: *"nunca mostrar pantalla en blanco ni error críptico"*.

## Que no se degrade

**CI** — mide el chunk de la app (`index-*`), no el mayor de todos:
- \> 350 kB → **falla el build**
- \> 250 kB → aviso
- Menos de 4 chunks → **falla**: el splitting se deshizo

Además publica una tabla de chunks en el resumen de cada corrida.

**Guard R12** — bloquea si `App.jsx` vuelve a importar Gerencia, Admin, Stock
o CatalogoCliente sin `lazy()`. Probado: restaurar el import estático rompe
el build.

## Pendiente

- **CSS: 139 kB.** Conviven `index.css`, `v90-fixes`, `ds-2026`, `system` y
  `v99-ux`. Falta consolidar en un sistema único.
- **Snapshot de cartera en localStorage.** La cola offline ya vive en IndexedDB
  (`outboxDb.js`), pero el snapshot sigue en localStorage: escritura síncrona
  que bloquea el hilo al guardarlo.
- **Medición real**: LCP e INP en un teléfono de gama media, no en desktop.
