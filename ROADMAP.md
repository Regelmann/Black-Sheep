# Black Sheep Field — Roadmap

**Estado actual:** `v-BS-PLATFORM-V13.2` · build verde · 571 tests · 0 imports rotos

---

## Cerrado en V13.2

- **RLS multi-tenant:** `sql/47_RLS_CIERRE_FINAL.sql` cierra cualquier `USING(true)` residual.
- **`updated_at`:** `sql/48_AUDITORIA_TIMESTAMPS.sql` agrega trigger a tablas editables.
- **Idempotencia total del outbox:** `nota`, `pedido` y `no_venta` mandan `client_op_id` y tratan `23505` como éxito (tests `syncIdempotencia` reactivados).
- **Totales de pedido consistentes:** `lineasValidas`/`totalLineas` y los 4 caminos (guardar, WhatsApp cliente, WhatsApp bodega, PDF) usan la misma regla (test `pedidoTotales` reactivado).
- **IndexedDB también para snapshot de cartera** (`snapshotDb`), no sólo para la cola.
- **Data Health visible** en Gerencia y Dashboard.
- **Web lint/typecheck/build** sin errores.

---

## Dónde estamos

La app hace tres cosas bien: muestra la cartera, calcula qué ofrecer, y registra visitas.
Lo que **todavía no** hace bien es garantizar que lo registrado llegue al servidor,
y que los números que muestra sean confiables sin que alguien los audite a mano.

Las últimas tres versiones se fueron en reparar, no en construir. Eso tiene una causa
concreta y está en la sección final.

---

## Principio rector

> Un vendedor de terreno confía en la app **o no la usa.**
> Una sola vez que un pedido se pierde, vuelve al cuaderno y no vuelve más.

Todo lo que sigue está ordenado por esa regla: **primero que no mienta, después que sea rápida, después que sea inteligente.**

---

## FASE 1 — Que no mienta (0–3 semanas) 🔴

*Sin esto, lo demás no importa.*

### 1.1 Validar el outbox en terreno real
Ya está corregido el bug donde `{ok:false}` borraba items de la cola.
Falta **probarlo con un teléfono real en un sótano**, no en devtools.

- [ ] Modo avión → check-in → pedido → nota → volver a red → verificar las 3 filas en Supabase
- [ ] Matar la app con cola pendiente → reabrir → debe drenar
- [ ] Cola con 50 items → medir tiempo de drenaje
- [ ] **Métrica de salida:** 0 pérdidas en 20 ciclos

### 1.2 Migrar las ~20 queries restantes a `safeSelect`
Quedan en `Visita`, `Metas`, `Ruta`, `Admin`, `components.jsx`.
Cada una puede mostrar "0" cuando en realidad falló.

- [x] Una página por PR, verificando en pantalla
- [x] **Métrica:** 0 ocurrencias de `const { data }` sin `error`

### 1.3 RLS estricto antes de multi-tenant
Los SQL `13`/`14` tienen políticas abiertas, pero ya **no son el estado final**:
`28_RLS_ESTRICTO.sql` + `35_RLS_CATALOGO.sql` + `47_RLS_CIERRE_FINAL.sql`
cierran el modelo. Falta validar en base real con JWT de otro tenant.

- [x] Auditar toda política `USING (true)`
- [x] Aislar por `ejecutivo_id` / `tenant_id`
- [ ] Test: con el JWT del tenant A, intentar leer datos del tenant B → debe fallar

### 1.4 Data Health visible
`dataHealth.js` y `dataIntegrity.js` ya existían; ahora se muestran.

- [x] Semáforo en Gerencia: verde / ámbar / rojo por bloque
- [x] Si la bajada es vieja o inconsistente, **decirlo antes** de mostrar números
- [x] Regla: ningún panel muestra un número sin saber de cuándo es

---

## FASE 2 — Un solo cerebro (3–6 semanas) 🟠

*Hoy hay tres rankings compitiendo. El vendedor no sabe cuál obedecer.*

### 2.1 `planDia` como única lista del día
Coexisten `decisionEngine`, `planDia`, `recomendaciones` y `predictor`.

- [ ] `planDia` es la lista. `decisionEngine` sólo aporta señales, no una lista paralela
- [ ] Retirar `recomendaciones` / `predictor` de la UI (quedan como librerías)
- [ ] **Métrica:** un solo orden visible en toda la app

### 2.2 El mismo orden en Hoy y en Mapa
Hoy el orden GPS existe en Hoy pero el mapa no lo respeta. Son dos verdades.

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

## FASE 3 — Que sea rápida (6–10 semanas) 🟡

### 3.1 Code-splitting
Bundle actual: **728 kB** (207 kB gzip). En 4G de terreno eso son varios segundos.

- [x] `React.lazy` por ruta: Gerencia y Admin no los carga un vendedor
- [ ] Objetivo: **< 250 kB** en la carga inicial (chunk actual ~266 kB)

### 3.2 IndexedDB en vez de localStorage
La cola y el snapshot ya viven en IndexedDB con respaldo en localStorage.

- [x] Migrar outbox y snapshot a IndexedDB
- [x] Migración transparente: si hay cola vieja en localStorage, importarla

### 3.3 Presupuesto de rendimiento
- [ ] Primera pintura útil < 1,5 s en 4G
- [ ] Interacción < 100 ms
- [ ] Medir en un teléfono real de gama media, no en desktop

---

## FASE 4 — Que sea confiable sola (10–16 semanas) 🟢

### 4.1 CI que corra los tests
Hoy los tests existen pero **nadie los corre antes de subir**. Por eso llegaron
tres ZIPs consecutivos que no compilaban.

- [x] GitHub Actions: `build` + `test` en cada push
- [x] Bloquear merge si el build falla
- [x] **Esto solo habría evitado V9.0, V92 y el catálogo eliminado**

### 4.2 ETL automatizado
- [ ] Configurar los secrets pendientes (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GOOGLE_MAPS_API_KEY`, `GDRIVE_SA_JSON`, `GDRIVE_FOLDER_ID`)
- [ ] Ciclo por cron, no manual en Colab
- [ ] La compuerta VALIDAR/PUBLICAR se mantiene

### 4.3 Errores observables
- [ ] Captura de errores en producción (Sentry o equivalente)
- [ ] Saber que un vendedor tuvo un problema **sin que él avise**

---

## FASE 5 — Que sea inteligente (4–6 meses) 🔵

*Sólo cuando 1–4 estén sólidas.*

- **Predicción de reorden**: fecha probable del próximo pedido por cliente y SKU
- **Ruta óptima real**: hoy es orden por distancia; falta tráfico y ventanas horarias
- **Alertas de fuga tempranas**: avisar antes de que el cliente se enfríe, no después
- **Catálogo como canal**: que el cliente pida solo desde el link
- **Multi-tenant de verdad**: onboarding de un cliente nuevo sin tocar código

---

## Deuda técnica pendiente (de tu lista y de mis hallazgos)

| # | Ítem | Severidad | Fase |
|---|---|---|---|
| 1 | Match SKU stock↔mix por nombre, no por código | Media | 1.4 |
| 2 | `mix%` inflado (`promClp` per-línea en vez de per-mes) | Media | 1.4 |
| 3 | 57 SKUs sin precio de lista | Media | 1.4 |
| 4 | Sur Capital sin filas en `ventas_lineas` | Media | 1.4 |
| 5 | RLS abierto en SQL `13`/`14` | ~~Alta~~ **Cerrado con 47** | 1.3 |
| 6 | `limit(2000)` fijo en cartera — se rompe al crecer | Media | 3.1 |
| 7 | Bundle 728 kB → ~266 kB (code-splitting hecho) | Media | 3.1 |
| 8 | localStorage como cola/snapshot | ~~Media~~ **Cerrado con IndexedDB** | 3.2 |

---

## Lo más importante de todo este documento

Ninguna de las fases se sostiene si sigue habiendo **ramas paralelas**.

En las últimas tres entregas:
- **V9.0** llegó sin compilar (`Visita.jsx` con JSX inválido)
- **V92.4** llegó sin compilar (importaba un `CatalogoCliente.jsx` que había sido borrado)
- Ambas arrastraban el mismo `var(--brand)` circular que ya estaba reparado

No es un problema de calidad — `planDia.js` está bien escrito. Es que **cada rama sale de una base vieja**, así que los bugs reparados reaparecen y el merge cuesta más que el trabajo nuevo.

**Dos reglas que valen más que cualquier feature de este roadmap:**

1. **Una sola rama.** V9.2 es la base. Todo sale de ahí.
2. **Nada se sube sin `npm run build` verde y tests en verde.** La Fase 4.1 lo automatiza, pero puede empezar hoy a mano.

---

## Los próximos 3 pasos concretos

1. Desplegar V9.2 y verificar el stamp en pantalla
2. Ejecutar `sql/20_CATALOGO_CANONICO.sql` y probar un link de catálogo real
3. Probar el outbox con modo avión — **el punto 1.1 es el que decide si la app se usa o no**
