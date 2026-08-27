# v-BS-PLATFORM-V10.3.1 — Pantalla en blanco

**137/137 · ESLint 0 · typecheck ✅ · guard ✅ · build ✓**

## Qué encontré

**El build compila y los 137 tests pasan.** El fallo es de arranque en el
navegador, no de compilación — por eso ninguna de las cinco capas de
verificación lo vio.

`main.jsx` importa `@tanstack/react-query`:

```js
import { QueryClientProvider } from '@tanstack/react-query'
const queryClient = crearQueryClient()      // ← nivel de módulo
```

Ese import **no venía del ZIP V9.8** (lo verifiqué). Entró con los archivos de
Fase 2. Está en `package.json` y en `package-lock.json`, así que `npm ci`
debería instalarlo.

Pero `crearQueryClient()` corre **a nivel de módulo, antes de que React monte**.
Si lanza —versión incompatible, dependencia no instalada en el servidor de
build, cualquier cosa— la app entera muere antes de renderizar un solo píxel.
Y como `ErrorBoundary` vive *dentro* de React, no puede atraparlo.

Ese es el mecanismo de la pantalla en blanco.

## Lo que hice: que la causa no pueda ser invisible

No puedo reproducir tu entorno exacto desde acá. Lo que sí puedo es garantizar
que **un fallo de arranque nunca deje la pantalla vacía**.

### 1 · Guardia en `index.html`

JS clásico, no módulo: corre aunque el bundle no cargue. Si a los 8 segundos
`#root` sigue vacío, muestra:

- Qué pasó, en lenguaje de vendedor: *"No es tu teléfono"*
- **Cuántas acciones tiene guardadas** — lee la cola directo de localStorage:
  *"Tenés 3 acciones guardadas. No se perdieron."*
- **Recargar** y **Limpiar caché y recargar** (el segundo borra el Service
  Worker, que es la causa más común de que una PWA quede pegada a un build viejo)
- El error real, para que me lo puedas pasar

### 2 · `crearQueryClient()` con red

Si falla, cae a un `QueryClient` por defecto. Un cliente de caché roto no puede
impedir que un vendedor trabaje.

### 3 · Montaje en `try/catch`

Si React no monta, escribe el error en `#root` en vez de dejarlo vacío.

## Lo que necesito de vos

Con este deploy la pantalla blanca se vuelve una pantalla **con el error
escrito**. Pasame ese texto y cierro la causa raíz.

Si querés adelantarlo: `app.black-sheep.cl` en Chrome de escritorio, F12 →
Console, y el primer error en rojo.

## Sospecha principal

Que Vercel haya construido con un `package-lock.json` desincronizado. Si el
lock del repo no tenía `@tanstack/react-query` cuando se disparó ese build,
`npm ci` falla o instala sin él, y el bundle sale con un import que no resuelve.

**Verificalo así:** Vercel → Deployments → el último → *Building* → buscar
`npm ci`. Si hay un error ahí, esa es la causa y no hay nada más que arreglar
en el código.
