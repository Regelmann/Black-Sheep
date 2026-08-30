# v-BS-PLATFORM-V10.2-OUTBOX — Fase 1

**97/97 tests · ESLint 0 errores · guard ✅ · build ✓**

## Sobre el patch: NO lo apliqué tal cual

`git apply --check` falla en 11 archivos. El patch está hecho sobre
`V10.0-SHELL`, o sea **antes** de V10.0.1 y V10.1.

Aplicarlo hubiera revertido:

- Los **42 tokens CSS** que no existían (el gráfico de Gerencia invisible)
- La **navbar cortada** en todas las pantallas (`box-sizing`)
- El **header** "Hola, Sebast…"
- Las **secciones del catálogo** (el "15" suelto)

Y duplicaba ESLint y ErrorBoundary, que ya estaban en V10.1.

**Lo que hice:** extraje los 4 archivos que son Fase 1 real y los integré
sobre la base actual, verificando cada paso.

## Lo que sí se integró

| Archivo | Qué aporta |
|---|---|
| `lib/outboxDb.js` (382) | Cola en IndexedDB con espejo en memoria |
| `lib/outbox.integracion.test.js` (328) | **18 tests del ciclo completo** |
| `lib/telemetry.js` (181) | Gancho de observabilidad |
| `lib/buildStamp.js` | Sello como fuente única |

`outboxDb.js` está bien resuelto y vale decir por qué:

- **Sin dependencias externas.** No usa `idb`; IndexedDB directo.
- **Espejo en memoria** → `leerCola()` sigue siendo síncrona. Los 6 módulos
  que la usan no cambian.
- **Antes de hidratar lee localStorage**, para no devolver `[]` y hacerle creer
  a la UI que no hay nada pendiente. Ese era el riesgo real de la migración.
- **Migración deduplicada por id**: reabrir la app no multiplica la cola.
- **`navigator.storage.persist()`**: sin eso, IndexedDB es *best-effort* y el
  navegador lo purga igual bajo presión de disco.
- **Triple respaldo**: espejo + IndexedDB + localStorage. Si IDB no está, la
  app degrada en vez de caerse.

`buildStamp.js` resuelve un ciclo real: `App → ErrorBoundary → App`.

## Lo que escribí yo

El patch modificaba `offline.js`, pero ese diff no aplicaba. Lo reescribí:

**Backoff exponencial con jitter.** Antes: 25 reintentos seguidos. Al volver la
señal, 50 items disparaban 50 requests simultáneos contra Supabase — justo
cuando la red recién se recupera y es más frágil.

El jitter importa tanto como el backoff: sin él **todos los teléfonos de la
flota reintentan en el mismo instante** y se pisan entre sí. ±25%, tope 30 min.

**Bandeja de agotados.** `MAX_INTENTOS = 8` (antes 25, que son días). Un item
agotado **no se borra ni se reintenta solo**: aparece una pastilla roja arriba
con "N acciones no subieron", y desde ahí se reintenta a mano o se descarta.

Un pedido agotado es plata real. Si falló 8 veces con backoff, no se arregla
reintentando más: lo tiene que decidir una persona.

## 🔴 ESLint se ganó el sueldo el primer día

Al reescribir `offline.js` dejé `q` sin declarar en `enqueueAction`. Exactamente
el mismo error que la auditoría reportó en `handleCompletar`.

```
134:3   error  'q' is not defined   no-undef
136:52  error  'q' is not defined   no-undef
218:24  error  'hoyBucketKey' is not defined
234:17  error  'hoyBucketKey' is not defined
```

Los tests lo mostraron como `ReferenceError: q is not defined` — pero ESLint lo
señaló **en el archivo y la línea**, en dos segundos, y además encontró un
segundo bug que yo no sabía que había cometido: borré `hoyBucketKey` sin querer
al reescribir el bloque.

El argumento del documento queda demostrado con un caso propio, del mismo día.

## Los 18 tests de outbox

```
durabilidad       sobrevive al cierre · sobrevive a la purga de localStorage
                  llave de idempotencia en cada item
ciclo de vida     sin señal → falla → vuelve la red → sube
                  el fallo persiste en disco tras reabrir
                  50 acciones drenan completas
                  un tipo sin handler no se pierde ni bloquea
backoff           crece con los intentos · tope 30 min · tiene jitter
                  un item en backoff se pospone, no gasta red
agotados          tras 8 intentos se marca y deja de reintentar
                  reintento manual lo revive y sube
                  un agotado no impide que el resto drene
```

Esto cubre el punto 1.1 del ROADMAP **con CI** en vez de "probarlo en un
sótano". La prueba en terreno sigue haciendo falta, pero una vez, no en cada
release.

## Telemetría: gancho, no instalación

`telemetry.js` está integrado pero sin backend. Igual que con Sentry: hace falta
decidir qué datos salen del teléfono. Un pedido lleva nombre de cliente y
precios negociados.
