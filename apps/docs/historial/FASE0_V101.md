# v-BS-PLATFORM-V10.1 — Fase 0

**79/79 tests · ESLint 0 errores · guard ✅ (R15 nueva) · build ✓**

## Sobre el hallazgo bloqueante

**Lo verifiqué antes de actuar, y no está en esta base.**

```js
// syncHandlers.js:51-72 — actual
if (p.visita_id) { ... if (error) return { ok:false, ... } }

// Un cierre sin checkin_id ni visita_id no tiene nada que escribir,
// pero tampoco es un fallo: el item sale de la cola.
return { ok: true }
```

La auditoría se hizo sobre `V10.0-SHELL`. El bug se corrigió en el camino —
probablemente al reescribir los handlers con el doble chequeo de V9.9.3.

**Lo confirmé con la herramienta que el propio documento propone:** ESLint 9
con `no-undef` sobre todo `src` → **0 errores**.

Pero el argumento de fondo es correcto, y el resultado lo demuestra: **ESLint
no estaba instalado.** El bug pudo existir. La corrección fue accidental, no
verificada. Eso es exactamente el problema que el documento señala.

## 0.2 · ESLint instalado y bloqueando

`eslint.config.js` con dos niveles:

**Bloqueantes** — errores que rompen en runtime y que ni el build ni los tests ven:
`no-undef` · `no-const-assign` · `no-dupe-args` · `no-unreachable` ·
`no-self-compare` (ya nos pasó en Cartera.jsx) · `react-hooks/rules-of-hooks`

**Avisos** — deuda conocida (130): `exhaustive-deps`, `no-unused-vars`,
`no-empty`. Pasan a error cuando lleguen a cero, igual que las reglas del guard.

`npm run verify` ahora es **lint → guard → test → build**. El CI corre el lint
primero: falla en 10 segundos en vez de esperar el build.

### Guard R15
Verifica que exista `eslint.config.js` **y** que `verify` lo ejecute. Sin esto,
alguien podría borrar el lint y nadie se enteraría.

## 🔴 Un bug real que el test heredado encontró

Al correr `verify` con el `syncHandlers.test.js` que venía en el ZIP V10, falló:

```
handleNota no devuelve { ok: … }
```

**Era un falso positivo del test, no un bug del handler.** `handleNota` sí
devuelve `{ok}`, pero con ternario:

```js
return error ? { ok: false, error: error.message } : { ok: true }
```

La expresión buscaba `return {` literal. Corregí la regla para aceptar también
el ternario.

Vale registrarlo: **un test frágil que analiza el texto del código en vez del
comportamiento genera ruido**, y el ruido se aprende a ignorar — que es
justamente lo que el documento advierte sobre los avisos permanentes.

## 0.3 · Sourcemaps fuera de producción

`sourcemap: true` → `'hidden'`. Se siguen generando para depurar, pero sin el
comentario `//# sourceMappingURL`, así que el navegador no los pide.

Eran **2,6 MB de código fuente** legibles desde DevTools: lógica de precios,
márgenes y scoring incluida. Fix de una línea.

## 0.4 · ErrorBoundary por ruta

Un `undefined.map()` en Visita a las 10 de la mañana dejaba pantalla blanca sin
salida, en la calle.

Ahora: pantalla con "Reintentar" e "Ir a Hoy", **por ruta** — si Gerencia
explota, Hoy sigue viva.

Y lo primero que muestra es lo único que le importa al vendedor en ese momento:

> Tenés **3 acciones guardadas** en el teléfono. **No se perdieron** — se suben
> solas al volver la señal.

La cola vive en localStorage, no en el estado de React: un crash no la toca.

## 0.5 · Sentry — gancho listo, sin instalar

`ErrorBoundary` llama a `window.__bsReportError(error, { zona, stamp,
componentStack, pendientes })` si existe.

**No instalé Sentry** porque requiere una cuenta, un DSN y una decisión sobre
qué datos salen del teléfono — un pedido que sale de una visita lleva nombre de
cliente y precios negociados. Eso lo decidís vos, no yo.

Cuando tengas el DSN es una línea en `main.jsx`.

## Sobre las tres reglas del plan

**"No agregar features hasta terminar Fase 1"** — de acuerdo.

**"Todo aviso que llegue a cero pasa a bloqueante"** — de acuerdo, ya es como
funciona R4 y R11.

**"Cambiar 'una sola rama' por CI en PR + branch protection"** — de acuerdo con
el razonamiento, **pero no todavía**. La regla nació porque llegaron tres ZIPs
sin compilar desde ramas paralelas. El CI en PR resuelve eso *si los cambios
entran por PR* — hoy entran por ZIP y `rsync`. Primero hay que mover el flujo a
ramas y PRs; recién ahí la protección de rama tiene efecto.
