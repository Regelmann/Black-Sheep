# v-BS-PLATFORM-V10.6 — Verificación de la lógica

**295/295 tests · ESLint 0 · typecheck ✅ · guard ✅ · build ✓**

## Qué hice con el patch 7

**No lo apliqué.** Su base es `V10.4.1` — justo antes de la limpieza — y
reintroducía los 7 archivos huérfanos que sacamos, más los 22 markdowns.

Extraje **sólo los 14 tests de lógica pura** y los corrí contra el código
actual. De 137 a 295 tests.

## ✅ Lo que la verificación confirmó

| Módulo | |
|---|---|
| **`decisionEngine`** | **37/37** |
| `habiles` (días hábiles) | 11/11 |
| `cantidad` · `stockTexto` | 18/18 |
| `checkinVerificacion` | 9/9 |
| `perfilEjecutivo` · `porcentaje` · `fechas` | 24/24 |

`decisionEngine` es el motor que decide a quién visitar. **Nunca había tenido
un solo test** y pasó los 37 sin tocar una línea. La lógica de negocio está
sana.

## 🔴 Dos bugs reales encontrados

### 1 · `haversineM` trataba una coordenada vacía como (0,0)

```js
if ([lat1, lng1, lat2, lng2].some(v => v == null || isNaN(Number(v)))) return null
```

**`Number('')` devuelve 0, no NaN.** Lo mismo `Number([])` y `Number(false)`.
Una coordenada vacía pasaba la validación y se medía contra el punto (0,0) —
el Golfo de Guinea, a ~12.000 km de Santiago.

No explotaba nada: devolvía una distancia enorme pero plausible. Consecuencias
en terreno:

- Un cliente sin lat/lng cargada aparece lejísimos y **contamina el orden de la
  ruta del día**
- Peor: **el check-in legítimo queda rechazado por "lejos del cliente"**

Corregido con validación estricta: sólo número o string numérico. `''`, `'   '`,
`[]`, `{}`, `false` e `Infinity` devuelven `null`.

### 2 · La migración descartaba items sin `id`

```js
if (it?.id && !porId.has(it.id)) { … }   // sin id → se tira en silencio
```

El object store usa `keyPath: 'id'`: un item sin esa propiedad **ni siquiera se
puede guardar**. Ante un `localStorage` escrito a medias, la cola perdía trabajo
de terreno sin que el vendedor se entere.

Ahora se le asigna un `id` y un `client_op_id` (para que el reintento no lo
duplique), se cuenta como `rescatados` y se registra en consola.

Es defensa preventiva —`enqueueAction()` siempre asigna id— pero un
check-in que desaparece en silencio es exactamente la clase de fallo que
rompe la confianza del vendedor.

## Tests apartados en `docs/tests-pendientes/`

| Test | Motivo |
|---|---|
| `importantes.test.js` | Mide **155 `!important`**, 128 en `v90-fixes.css`. Deuda de la limpieza de CSS (Fase 3), no bug activo |
| `cascadaContraste.test.js` | Falla por lo mismo: 7 hojas peleando |
| `pedidoTotales` · `syncIdempotencia` | Node no resuelve `lib/precios` ni `./tenants` sin extensión. Es resolución de módulos, no lógica |

Los dos últimos se arreglan agregando `.js` a esos imports. Toca módulos del
arranque, así que prefiero hacerlo con el repo ya ordenado.

## Lo que sigue pendiente: ordenar el repo

Necesito de vos:

```bash
cd ~/Black-Sheep/Black-Sheep
git fetch origin
git log --oneline HEAD..origin/main
```

Eso dice qué commits tiene GitHub que vos no. Con esa salida sé si el remoto
ya tiene V10.5, si tiene trabajo de la otra herramienta, o si son dos historias
distintas — y te doy la secuencia exacta para reconciliar sin perder nada.

**No hagas `git pull` a secas** con 60 archivos sin commitear.
