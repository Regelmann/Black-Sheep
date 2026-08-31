# Revisión de Black Sheep Field

**Fecha:** 30 de agosto de 2026
**Repo auditado:** `Regelmann/Black-Sheep` · stamp `v-BS-PLATFORM-V12.9`
**Alcance:** PWA (`apps/field`), landing (`apps/web`), SQL, ETL, CI y documentación.

---

## Veredicto

El motor de negocio y la disciplina de **no mentirle al vendedor** están por encima de lo habitual. El equipo aprendió de bugs reales y lo dejó escrito en código, no en Slack.

Lo que hoy frena **no es falta de features**. Es que el código va más adelante que lo que está corrido en producción, y hay huecos que el propio roadmap ya nombra pero no están cerrados.

**Regla de esta etapa:** primero que lo desplegado sea lo que el repo cree. Después, que no mienta ni se filtre. Recién entonces, más producto.

---

## Lo que está muy bien (no tocarlo a la ligera)

- **`safeSelect` + `DataState`:** vacío ≠ roto. Más maduro que la mayoría de las apps de campo.
- **Outbox** con idempotencia, backoff, jitter y bandeja de agotados. `outboxDb.js` es de lo más sólido del repo.
- **Guard + CI que bloquea:** imports rotos, `var()` circular, stamp, presupuesto de bundle, chunks circulares. Cada regla nació de un incidente.
- **Lógica de negocio pura y testeada** (`planDia`, `decisionEngine`, `geo`, precios). Se puede razonar sin abrir React.
- Comentarios que explican *por qué*, no *qué*. Memoria institucional.

Eso no se tira. El riesgo ahora es seguir parcheando encima en vez de cerrar el producto.

---

## 0 · Esta semana, antes de una línea de feature

### 0.1 Correr el SQL que ya está en el repo

`V129.md` lo dice claro: el catálogo no muestra los 97 productos porque **`26`, `40` y `41` no están aplicados**. El código no puede arreglar una función que en la base sigue siendo la vieja.

```
1. Backup en Supabase
2. sql/00_VERIFICAR_ESTADO.sql
3. 41_VENTAS_LINEAS.sql
4. 40_STOCK_COLUMNAS_CICLO.sql
5. 26_CATALOGO_ORDEN.sql
6. Verificar 21_PEDIDO_PUBLICO_CANONICO.sql → exactamente UNA fila
7. Smoke del catálogo (link en incógnito → armar pedido → enviar)
```

Mientras eso no esté, rediseñar el catálogo o tocar `get_public_catalogo` es trabajo en el vacío.

### 0.2 Probar el outbox en un teléfono real, sin señal

Sigue siendo el único test que decide si el vendedor confía o vuelve al cuaderno. DevTools no alcanza.

```
Modo avión
  → check-in + nota + pedido
  → matar la app
  → volver red
  → las 3 filas tienen que estar en Supabase
```

### 0.3 El Service Worker está roto a nivel de sintaxis

Archivo: `apps/field/public/sw.js`

- Usa `SHELL` y **nunca lo define**.
- El listener de `install` no cierra.
- El de `activate` no cierra ni usa `waitUntil`.
- `notificationclick` se corta a mitad de archivo.

Los tests de SW **no parsean el archivo**: buscan strings (`req.mode === 'navigate'`, un solo `'fetch'`). Pasan en verde con un SW que el navegador rechaza al registrarse.

Es el patrón de *cobertura falsa* que el propio proyecto ya documentó. En producción el SW o no instala, o queda uno viejo cacheando HTML → pantalla en blanco (V10.3 / V10.4).

**Arreglo mínimo de CI:** `node --check public/sw.js` (o un test que haga `new Function(src)`). Una línea. Habría pescado esto.

---

## 1 · Seguridad — bloqueante si va a haber un segundo tenant

`SEGURIDAD.md` está bien pensado. El problema es **operativo**: `13` y `14` siguen creando `USING (true)` y todo depende de que alguien recuerde correr `28_RLS_ESTRICTO.sql` después. Un deploy fresco o un “corrí del 01 al 20” deja la base abierta.

| Hueco | Por qué duele |
|---|---|
| `20_CATALOGO_CANONICO.sql` pone `oc_auth` / `oci_auth` con `USING (true)` | Cualquier autenticado lee/escribe ofertas de todos |
| `handleNota` y `handlePedido` **no mandan `client_op_id`** | El índice único de `27` no protege notas ni pedidos. Check-in sí; pedido duplicado es el caso caro |
| `NotaRapidaMap` en `Ruta.jsx` inserta directo, **sin outbox y sin mirar `error`**, y muestra “Guardada” igual | Offline + terreno: la nota se pierde y la UI miente |
| Tokens de catálogo **sin expiración** | Un link reenviado vive para siempre |
| Funciones `SECURITY DEFINER` (`mi_rol`, `soy_admin`) | Bien con `search_path`; no volver a abrirlas |
| Modelo de tenant contradictorio | `tenants.js` dice “un Supabase por empresa”; `28` usa `tenant_id` en una sola base. Hay que elegir uno |

**Antes del segundo cliente:**

1. Aplicar `28` con el pre-vuelo (usuarios auth sin fila en `ejecutivos` quedan bloqueados).
2. Rotar service keys si alguna vez estuvieron en un ZIP.
3. Test real: JWT del tenant A no lee cartera del B.
4. Subir `R11` del guard a **bloqueante** para archivos SQL *nuevos*.

---

## 2 · Confiabilidad del dato

El producto *es* el dato. El README lo dice: primero que no mienta. Todavía hay caminos que mienten.

1. **Idempotencia incompleta.** Check-in está bien. Nota y pedido del outbox insertan el payload crudo. Si `27` está corrido, igual se duplican porque la columna va `NULL` (el índice es parcial: varios NULL no colisionan).
2. **Escrituras que no pasan por la cola.** `NotaRapidaMap`; varios `update` de visitas en `Ruta.jsx` (`optimizarOrdenRuta` hace N updates en serie sin rollback). En 4G a medias la ruta queda a medias.
3. **PostgREST techo 1.000.** Ya lo saben (`traerTodo`). Gerencia todavía hace `.limit(2000)` / `.limit(3000)` creyendo que sube el techo. No lo sube.
4. **`App.jsx` carga el ejecutivo sin `error`.** Si la query falla, fabrica un ejecutivo fantasma con el `uid` y rol `ejecutivo`. El vendedor entra “logueado” sin cartera. Mismo bug de “0 clientes”, en el arranque.
5. **ETL de ~4.300 líneas a mano en Colab.** Una sola fuente de verdad, bien; un ciclo que no corre es un dashboard que miente con datos de hace días. Automatizar el cron (Fase 4.2 del roadmap) rinde más que otra pantalla de gerencia.
6. **`catalogControlCenter.js` no está cableado a ninguna UI.** Lo marcan desde V11.4. Sin eso, el segundo tenant sigue siendo trabajo manual.

---

## 3 · Mantenibilidad

### 3.1 Archivos dios

| Archivo | Líneas | Nota |
|---|---:|---|
| `Gerencia.jsx` | 2.355 | 192 `style={{` inline |
| `Ruta.jsx` | 1.926 | mapa + GPS + prospectos + itinerario + popup + nota |
| `Visita.jsx` | 1.507 | |
| `Cartera.jsx` | 1.266 | |
| `Admin.jsx` | 957 | 25 queries directas a Supabase |

`Ruta.jsx` además **redefine `ZONAS_COMUNAS` a mano** (con y sin tildes). La fuente de verdad debería ser la tabla `zonas_comunas` + `lib/zonas.js`. Dos listas = prospectos que nadie ve (el bug de Maipú en Nor-Oriente, otra vez).

No hace falta un rewrite. Sí hace falta **no agrandar estos archivos**. Extraer: carga de territorio, mapa, itinerario, popup. Un PR por pieza.

### 3.2 CSS: 8 capas + 700+ estilos inline

Cascada actual:

```
index.css → tokens → identidad → v90-fixes → ds-2026
         → system → v99-ux → shell → arreglos-ux
```

Y Gerencia/Ruta ganan con inline. `V128` revirtió una limpieza: entendido. El camino no es “borrar todo un viernes”. Es **prohibir inline nuevo** y mover a clases del shell cuando se toque una pantalla. Si no, cada hotfix de contraste suma otra capa.

### 3.3 Docs que se contradicen

Hay **30 markdown en la raíz** + 22 en `docs/historial`. Stamps distintos:

| Documento | Dice |
|---|---|
| Código (`buildStamp.js`) | `v-BS-PLATFORM-V12.9` |
| `ROADMAP.md` | V9.2 |
| `ARQUITECTURA.md` | V9.9.4 |
| `README.md` | 24/24 tests |
| `V129.md` | 543/543 tests |
| `package.json` raíz | 2.9.0 |
| `apps/field/package.json` | 1.61.1 |
| `sql/README.md` | se corta en el archivo 21 |
| `DEPLOY.md` | lista hasta 41 |

El guard R9 cubre README/DEPLOY. No cubre ROADMAP/ARQUITECTURA. En tres meses no se sabe qué documento creer.

**Propuesta:** mover `V107`–`V129`, `ESTADO_LUNES`, `LIMPIEZA_*` a `docs/historial/`. Dejar en raíz: `README`, `DEPLOY`, `ROADMAP`, `SEGURIDAD`, `ARQUITECTURA`. Un changelog, no veinte.

### 3.4 Migraciones SQL a mano

Copiar 35 archivos al SQL Editor no escala y ya costó funciones duplicadas. El siguiente paso no es más `NN_HOTFIX.sql`: es **Supabase CLI / carpeta `supabase/migrations`** con una sola corrida. Los `00_VERIFICAR_*` pueden quedarse como diagnósticos.

---

## 4 · CI y tests

- CI **solo corre `apps/field`**. `apps/web` (Next 16, API de leads, sin tests) se puede romper sin que nadie se entere.
- Tests: ~47 archivos, lógica pura. Casi **cero de UI**. Las pantallas de 2.000 líneas son donde explotan los `undefined.map`.
- El typecheck con lista blanca es honesto. Hay que **meter archivos**, no dejarlo en dos módulos.
- No hay Sentry (el gancho `__bsReportError` está vacío). Un crash en terreno hoy es invisible.
- Los tests del SW dan cobertura falsa (ver 0.3).

---

## 5 · Producto / arquitectura (cuando 0–2 estén verdes)

1. **Un solo ranking del día.** Siguen `planDia`, `decisionEngine`, `dondeIr`, `recomendaciones`, `predictor`. El vendedor no sabe a cuál obedecer. `planDia` manda; el resto son señales.
2. **Hoy y Mapa con la misma lista.** El roadmap lo pide (`planStore`). Todavía no existe.
3. **Repositorios.** Las páginas conocen tablas. Un rename de columna tumba Visita. No es urgente; es lo que evita el año 2 de parches.
4. **Code-splitting ya está bien pensado** (calle vs oficina). No lazy-loadees Ruta.
5. **Google Maps en el cliente** (`VITE_GOOGLE_MAPS_API_KEY`). Restringir por HTTP referrer ya; a mediano plazo, rutas vía backend o Maps ID. El marcador “yo” usa `fillColor: 'var(--info)'` — **mismo bug de los pines negros**: las SymbolPath de Maps no resuelven CSS.
6. Landing (`apps/web`): 30 componentes de marketing; leads a `console.info` si no hay `DATABASE_URL`. Bien para demo. No mezclar con el PWA (React 18 vs 19, bien separados).

---

## Plan de 3 sprints — sin features nuevas

### Sprint A — que lo desplegado sea lo que el repo cree

- [ ] Parse-check del SW + arreglar `apps/field/public/sw.js`
- [ ] Correr SQL `41` → `40` → `26` + `00_VERIFICAR_ESTADO.sql`
- [ ] `client_op_id` en nota y pedido del outbox
- [ ] `NotaRapidaMap` pasa por el outbox (nunca insert directo)
- [ ] Prueba modo avión en teléfono real
- [ ] Confirmar stamp `v-BS-PLATFORM-V12.9` en `app.black-sheep.cl`

### Sprint B — que no mienta ni se filtre

- [ ] Aplicar `28_RLS_ESTRICTO.sql` con pre-vuelo
- [x] `App.jsx`: si falla `ejecutivos`, error visible — no ejecutivo fantasma
- [ ] Cablear Data Health en Gerencia (el código ya existe)
- [ ] Sentry (o un webhook) en el `ErrorBoundary`
- [ ] CI de `apps/web` + `node --check` del SW
- [ ] Test: JWT tenant A no lee cartera tenant B

### Sprint C — poder mantenerlo

- [ ] Partir `Ruta.jsx` / dejar de crecer `Gerencia.jsx`
- [ ] Archivar markdown de versiones en `docs/historial/`
- [ ] Actualizar `ROADMAP.md` al stamp real; una sola lista de “siguiente”
- [ ] Migraciones por CLI (`supabase/migrations`)
- [ ] Cron del ETL (secrets en GitHub Actions)

---

## Lo que no haría ahora

- Multi-tenant comercial (onboarding, segundo logo, segundo Supabase).
- Rediseño grande del catálogo hasta que el SQL muestre los 97 SKUs.
- Más CSS tipo `v13-fixes.css`.
- CRDTs, IndexedDB asíncrono en toda la API, o reescribir en TypeScript de golpe.
- Otra pantalla de gerencia. Ya hay `/gerencia` y `/dashboard`.

---

## Lectura rápida de archivos clave

| Pieza | Dónde | Estado |
|---|---|---|
| Sello de build | `apps/field/src/lib/buildStamp.js` | `v-BS-PLATFORM-V12.9` |
| Outbox | `apps/field/src/lib/offline.js` + `outboxDb.js` | Sólido; snapshot de cartera aún en localStorage |
| Handlers sync | `apps/field/src/lib/syncHandlers.js` | Check-in idempotente; nota/pedido no |
| Guard | `apps/field/scripts/guard.js` | 18 reglas; R4/R6/R7/R11 avisan |
| CI | `.github/workflows/ci.yml` | Solo `apps/field` |
| RLS estricto | `sql/28_RLS_ESTRICTO.sql` | Escrito; hay que correrlo |
| Idempotencia SQL | `sql/27_IDEMPOTENCIA.sql` | Índices parciales; inútil si el cliente no manda el id |
| ETL | `scripts/KEYFOODS_CICLO_UNICO.py` | ~4.300 líneas, manual en Colab |
| SW | `apps/field/public/sw.js` | Sintaxis rota |

---

El repo se siente como un producto de terreno que **ya sobrevivió a producción**, no un prototipo. La trampa típica de esta etapa es seguir sacando `V13.0`, `V13.1`… mientras el SQL, el SW y la prueba offline quedan “para el lunes”.
