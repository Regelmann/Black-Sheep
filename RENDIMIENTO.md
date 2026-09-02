# Rendimiento

**Versión:** `v-BS-PLATFORM-V9.9.6`

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
| **app** | **236 kB** | siempre — es lo que cambia en cada deploy |
| vendor-supabase | 209 kB | una vez, se cachea meses |
| vendor-react | 154 kB | una vez, se cachea meses |
| Gerencia | 58 kB | sólo si abre Gerencia |
| Admin | 27 kB | sólo si abre Admin |
| CatalogoCliente | 15 kB | sólo el cliente, por su link |
| Stock | 14 kB | sólo si abre Stock |

**236 kB en el chunk de la app — bajo el objetivo de 250 kB del roadmap.**

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

- **CSS: 101 kB.** Conviven `index.css`, `v90-fixes`, `ds-2026`, `system` y
  `v99-ux`. Falta consolidar en un sistema único.
- **IndexedDB** en vez de localStorage (Fase 3.2). localStorage escribe de
  forma síncrona y bloquea el hilo al guardar snapshots grandes.
- **Medición real**: LCP e INP en un teléfono de gama media, no en desktop.
