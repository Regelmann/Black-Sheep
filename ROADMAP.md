# Black Sheep Field — Roadmap

**Estado actual:** `v-BS-PLATFORM-V15.3` · verify ✅ (lint · typecheck · guard · tests · smoke · build) · 559/559 tests

> Reconciliado contra el código el **2026-09-08**. Cada marca ✅/⬜ de este documento
> se verificó en el repo, no se copió de la entrega anterior. La única versión válida
> es el `BUILD_STAMP` de `lib/buildStamp.js`: si un documento discrepa con él,
> el documento está mal.

---

## Dónde estamos

La app muestra la cartera, calcula qué ofrecer y registra visitas. Y desde hace
unas versiones, además **no miente en silencio** (safeSelect en todas las consultas,
`traerTodo` contra el techo de 1.000 filas de PostgREST), **compila siempre**
(CI con guard + tests + build en cada push) y **la cola offline es durable**
(IndexedDB + espejo en memoria + respaldo).

Lo que todavía no hace bien: garantizar **en terreno** que lo registrado llegue
al servidor (falta la prueba con teléfono real), mostrar **un solo ranking**
(hoy conviven tres) y que los números **sepan decir de cuándo son**.

---

## Principio rector

> Un vendedor de terreno confía en la app **o no la usa.**
> Una sola vez que un pedido se pierde, vuelve al cuaderno y no vuelve más.

Todo lo que sigue está ordenado por esa regla: **primero que no mienta, después que sea rápida, después que sea inteligente.**

---

## FASE 1 — Que no mienta 🔴 · 3 de 4 cerradas

### 1.1 Validar el outbox en terreno real — ⬜ PENDIENTE
El bug donde `{ok:false}` borraba items de la cola está corregido, y la cola es
durable (`outboxDb.js`: IndexedDB + espejo síncrono + respaldo en localStorage).
Los tests de integración e idempotencia pasan.

Falta **probarlo con un teléfono real en un sótano**, no en devtools. Es lo único
que queda de esta fase y nadie más que el equipo en terreno puede hacerlo.

- [ ] Modo avión → check-in → pedido → nota → volver a red → verificar las 3 filas en Supabase
- [ ] Matar la app con cola pendiente → reabrir → debe drenar
- [ ] Cola con 50 items → medir tiempo de drenaje
- [ ] **Métrica de salida:** 0 pérdidas en 20 ciclos

### 1.2 Migrar las queries a `safeSelect` — ✅ CERRADA
Métrica verificada el 2026-09-08: **0** ocurrencias de `const { data }` sin manejo
de error en `src/`. Las únicas 4 coincidencias restantes son la suscripción de
auth, un `getPublicUrl` (no es consulta) y dos ejemplos en comentarios.

### 1.3 RLS estricto antes de multi-tenant — ✅ en el repo · ⬜ falta aplicar en producción
`sql/security/50–54` cierran las 13 políticas `using(true)` originales, incluida
la trampa del OR (la política vieja con otro nombre sobrevivía junto a la nueva
y la anulaba — ver `SEGURIDAD.md`). El guard (regla R11) detecta cualquier
política abierta nueva.

Falta del lado de producción:

- [ ] Aplicar `50 → 54` en orden, con `00_VERIFICAR_ESTADO.sql` antes
- [ ] `99_SECURITY_DIAGNOSTICS.sql` → el bloque 2 debe volver **vacío**
- [ ] Test real: JWT del tenant A leyendo datos del tenant B → debe fallar
- [ ] Verificar que el ETL siga escribiendo (service key / `FORCE ROW LEVEL SECURITY`)

### 1.4 Data Health visible — ⬜ PENDIENTE
`dataHealth.js` y `dataIntegrity.js` existen, tienen tests, y **ninguna pantalla
los usa**. Lo único cableado hoy es `DataAsOfBanner` ("Datos al …") en Hoy.

- [ ] Semáforo en Gerencia: verde / ámbar / rojo por bloque
- [ ] Si la bajada es vieja o inconsistente, **decirlo antes** de mostrar números
- [ ] Regla: ningún panel muestra un número sin saber de cuándo es

---

## FASE 2 — Un solo cerebro 🟠 · sin empezar (verificado)

Hoy.jsx arma el día con `decisionEngine`, `recomendaciones` **y** `predictor` a la
vez. `planDia.js` existe, tiene tests, y **ninguna página lo importa** — otra vez
el patrón "construido sin cablear".

### 2.1 `planDia` como única lista del día

- [ ] `planDia` es la lista. `decisionEngine` sólo aporta señales, no una lista paralela
- [ ] Retirar `recomendaciones` / `predictor` de la UI (quedan como librerías)
- [ ] **Métrica:** un solo orden visible en toda la app

### 2.2 El mismo orden en Hoy y en Mapa
Ruta hoy calcula su propio orden (`rutaStats`) — son dos verdades.

- [ ] `planStore` comparte `planDia.stops` entre ambas
- [ ] Mapa numerado 1→N desde la posición real
- [ ] Tocar parada en el mapa → misma Visita con el mismo contexto

### 2.3 Cerrar el lazo del pedido
```
Data Health → planDia → Visita → Pedido → outbox → Supabase
```
- [ ] El pedido offline muestra su estado real (`pendiente` / `subido` / `falló`)
- [ ] Nunca decir "guardado" si sigue en cola: decir "guardado en el teléfono, falta subir"

---

## FASE 3 — Que sea rápida 🟡 · 2 de 3 cerradas

### 3.1 Code-splitting — ✅ CERRADA
`React.lazy` por ruta, vendors separados por frecuencia de cambio, xlsx sólo se
descarga al cargar datos. El CI mide el chunk `index-*` y **falla** sobre 350 kB.
**Hoy: 269 kB (82 kB gzip) — dentro del techo, pero sobre el objetivo de 250**:
el CI emite aviso. Bajarlo de vuelta es deuda abierta, no trabajo terminado.

### 3.2 IndexedDB — 🟡 A MEDIAS

- ✅ **Cola (outbox)** → `outboxDb.js`: IndexedDB durable + espejo síncrono en
  memoria + respaldo en localStorage, con `navigator.storage.persist()`
- ⬜ **Snapshot de cartera** → sigue en localStorage (escritura síncrona, ~5 MB)

### 3.3 Presupuesto de rendimiento — ⬜ PENDIENTE

- [ ] Primera pintura útil < 1,5 s en 4G
- [ ] Interacción < 100 ms
- [ ] Medir en un teléfono real de gama media, no en desktop

---

## FASE 4 — Que sea confiable sola 🟢 · 1 de 3 cerradas, 1 a medias

### 4.1 CI que corra los tests — ✅ CERRADA
`ci.yml`: lint + guard + tests + build + smoke + techo de bundle en **cada push**,
y los avisos de "circular chunk" se tratan como error. Es la regla que habría
evitado V9.0, V92 y el catálogo eliminado — ya está vigente.

### 4.2 ETL automatizado — 🟡 A MEDIAS
`etl.yml` existe, con la compuerta VALIDAR/PUBLICAR como jobs separados.
Falta: cargar los 5 secrets y verificar una semana de corridas verdes sin
intervención humana.

### 4.3 Errores observables — ⬜ PENDIENTE
Sólo existe el gancho en `ErrorBoundary` ("para el tracker de errores, cuando
exista"). Hoy no hay forma de saber que un vendedor tuvo un problema sin que
él avise.

---

## FASE 5 — Que sea inteligente 🔵 · igual, y en orden

*Sólo cuando 1–4 estén sólidas.*

- **Predicción de reorden**: fecha probable del próximo pedido por cliente y SKU
- **Ruta óptima real**: hoy es orden por distancia; falta tráfico y ventanas horarias
- **Alertas de fuga tempranas**: avisar antes de que el cliente se enfríe, no después
- **Catálogo como canal**: que el cliente pida solo desde el link
- **Multi-tenant de verdad**: onboarding de un cliente nuevo sin tocar código

---

## Deuda técnica (revisada contra el código el 2026-09-08)

| # | Ítem | Severidad | Estado |
|---|---|---|---|
| 1 | Match SKU stock↔mix por nombre, no por código | Media | ⬜ sin verificar — auditar en la próxima bajada |
| 2 | `mix%` inflado (`promClp` per-línea en vez de per-mes) | Media | ⬜ sin verificar |
| 3 | SKUs sin precio de lista | Media | ⬜ sin verificar |
| 4 | Sur Capital sin filas en `ventas_lineas` | Media | ⬜ sin verificar |
| 5 | RLS abierto en SQL 13/14 | **Alta** | ✅ cerrado en el repo (50–54) · ⬜ falta aplicar en producción |
| 6 | Tope de filas fijo en cartera | Media | ✅ resuelto — `traerTodo.js` pagina con `.range()` contra el techo real de PostgREST |
| 7 | Bundle 728 kB | Media | ✅ resuelto — app 269 kB; xlsx (435 kB) sólo al cargar datos · ⚠️ 269 > objetivo 250 |
| 8 | localStorage como cola | Media | ✅ cola en IndexedDB · ⬜ snapshot sigue en localStorage |

### Deuda nueva (encontrada al reconciliar este documento)

| Ítem | Dónde |
|---|---|
| `push.js` completo y testeado, sin cablear | `lib/PENDIENTE_PUSH.md` — cablear o borrar, hay que decidir |
| `apps/web` y `apps/control-center` sin un solo test | el control-center incluye un checkout de Stripe |
| `xlsx@0.18.5` con CVEs conocidos | se carga a demanda (no pesa en el vendedor), pero SheetJS ya no publica en npm — definir política de actualización |
| Versiones desperdigadas en los docs | resuelto el 2026-09-08: la única versión es el `BUILD_STAMP` |

---

## Lo más importante de todo este documento

Ninguna de las fases se sostiene si vuelve el hábito de las **ramas paralelas**.

En las últimas tres entregas de aquella época:
- **V9.0** llegó sin compilar (`Visita.jsx` con JSX inválido)
- **V92.4** llegó sin compilar (importaba un `CatalogoCliente.jsx` que había sido borrado)
- Ambas arrastraban el mismo `var(--brand)` circular que ya estaba reparado

No es un problema de calidad — `planDia.js` está bien escrito. Es que **cada rama
sale de una base vieja**, así que los bugs reparados reaparecen y el merge cuesta
más que el trabajo nuevo.

**Dos reglas que valen más que cualquier feature de este roadmap:**

1. **Una sola rama.** Todo sale de la última versión de `main`.
2. **Nada se sube sin `npm run verify` verde.** El CI ya lo exige en cada push;
   correrlo antes de pushear ahorra la vuelta.

---

## Los próximos 3 pasos concretos

1. **Prueba offline con teléfono real** (1.1) — sigue siendo la que decide si la app se usa o no
2. **Aplicar `sql/security/50–54` en producción** + diagnóstico 99 + test cross-tenant (1.3)
3. **Cargar los 5 secrets del ETL** y ver una semana de corridas automáticas verdes (4.2)
