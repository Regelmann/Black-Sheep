# v-BS-PLATFORM-V9.1 — Reparación de V9.0 + correcciones de terreno

**Estado:** build verde · 0 imports rotos · 5/5 tests pasando

---

## 0. Por qué existe esta versión

**V9.0 nunca se pudo desplegar.** `Visita.jsx` tenía JSX inválido y el build fallaba.
Lo que corría en el teléfono era V8.2.

V9.0 hizo un reemplazo masivo hex→CSS-vars sobre 25 archivos. En el camino
rompió cosas que nadie revisó.

---

## 1. Bugs críticos de V9.0 reparados

### 1.1 `tenants.js` — referencia circular que mataba la marca

```js
accent: 'var(--brand)'                    // valor del tenant
r.style.setProperty('--brand', b.accent)  // → --brand: var(--brand)
```

CSS descarta la referencia circular. Caían `--brand`, `--brand-dk`, `--brand-lt`,
`--kf-brand`, `--bs-accent` — **todo el sistema de marca, al hacer login.**

**Fix:** hex reales + guarda `isLiteralColor()` que rechaza cualquier `var()`
y loguea en dev. No puede volver a pasar.

### 1.2 `Visita.jsx` — tres regresiones en un archivo

| Regresión | Detalle |
|---|---|
| JSX roto | Se perdió el `)}` del bloque RESULTADO → build fallaba |
| Doble Check-in | Se reintrodujo un botón en el header además del sticky. V8.2 tenía un comentario explícito prohibiéndolo |
| SKUs al vendedor | Se eliminó el filtro `esNombreProducto` → códigos numéricos aparecían en "Qué ofrecer" |

**Fix:** revertido a V8.2 y migrado a tokens de forma verificada.

### 1.3 Funciones borradas que seguían siendo necesarias

- `productDisplay.esNombreProducto()` — filtra códigos SKU de la UI
- `utils.pctAvanceFoco()` — normaliza `pct_avance` que llega como fracción (0.7619)

### 1.4 `pedido.js` — `require()` dentro de ESM

```js
try { const {...} = require('./pedidoEstados') } catch (_) {}
```

`require` no existe en ESM del navegador. El try/catch lo tragaba en silencio.
Eliminado.

### 1.5 `stockIntel.js` — matching debilitado

V9.0 simplificó el algoritmo y **eliminó el fallback por `productos_top`**,
reduciendo los matches de compradores. Revertido a V8.2.

---

## 2. El hallazgo sistémico: 27 errores tragados

```js
const { data } = await supabase.from('cartera').select('a,b,c')
setCartera(data || [])
```

Si **una** columna no existe, PostgREST rechaza **toda** la query con 400.
`data` queda `undefined`, cae al `|| []`, y la UI muestra "0 clientes"
como si fuera un resultado vacío legítimo.

**El vendedor no podía distinguir "no hay compradores" de "la consulta nunca corrió".**

### Nuevo: `lib/query.js`

- `safeSelect` / `safeSingle` / `safeAll` / `safeSelectRetry`
- Traduce errores PostgREST a mensaje de usuario + mensaje de dev
  (`42703` columna inexistente, `42501`/`PGRST301` RLS, red)
- No reintenta errores de esquema ni de permisos — no se arreglan solos

### Nuevo: `components/DataState.jsx`

`DataError` / `DataSkeleton` / `DataEmpty` — vacío ≠ roto, con reintento por bloque.

**Migrado:** Stock (cartera + stock por separado), Gerencia, CatalogoCliente.

---

## 3. Catálogo público — "Link inválido"

**Cuatro archivos SQL redefinían `get_public_catalogo`:** `05`, `10`, `16`, `19`.
La viva era la del último ejecutado. Nadie sabía cuál.

**Bug raíz:**

| Archivo | Columna |
|---|---|
| `19` crea la tabla con | `activo` |
| `16` consulta | `coalesce(o.activa, true)` |

→ `column o.activa does not exist` → la función aborta → "Link inválido".
**El catálogo existía y el link era correcto.**

**Fix:** `sql/20_CATALOGO_CANONICO.sql`
- Migra `activa` → `activo` si existe, y la elimina
- `activo IS NULL` → `TRUE` (NULL nunca cumple `= true`)
- RLS coherente en `ofertas_cliente` y `oferta_cliente_items`
- Función única `SECURITY DEFINER`, con bloque de verificación al final

**Front:** normaliza array vs objeto, y distingue "link vencido" de
"problema de configuración".

---

## 4. Gerencia — `Promise.all` → `allSettled`

6 consultas en un `Promise.all`. Si **una** fallaba, reventaba el bloque entero
y **todos** los contadores quedaban en `—`.

Ahora cada bloque falla solo, se registra cuál falló, y el banner lo dice:

> No cargó: stock · cartera. Los contadores en "—" no son cero, son sin dato.

---

## 5. UI de terreno

### 5.1 Títulos invisibles
El `<h1>` de `.bs-page-hero` **no tenía `color`** y heredaba `--ink` (#1c1917)
sobre un gradiente negro. **Texto negro sobre fondo negro.**
Afectaba "Mi cartera" y "Resultado del mes". No era una sombra.

### 5.2 Sistema de filtros unificado — `components/FilterBar.jsx`
- `FilterBar` — chips compactos (34px), scroll horizontal, el activo se
  auto-revela, área de toque de 44px sin agrandar el chip
- `SearchField` — margen propio, ya no se pega a los filtros
- `StatGrid` — alertas en grid de 2 filas; 62px vs ~96px por tarjeta

Mismo componente en Cartera y Stock. Un solo lugar para cambiar el criterio.

### 5.3 Acciones de contacto
```css
.cli-acciones { display: flex; flex-wrap: wrap; }  /* se envolvía irregular */
```
→ `ClientActionBar` con `grid-template-columns: repeat(4, minmax(0,1fr))`.
`minmax(0,...)` es lo que impide que se corte "Nota".
SVG inline en vez de emojis (consistente Android/iOS).

### 5.4 Selector de zona en el saludo — `ZonePicker.jsx`
Reemplaza `ZoneTabs` (barra de 3 pills que comía ~60px verticales en **todas**
las pantallas). Ahora vive en el header junto a "Hola, Sebastián", y **sólo
cambia el color al seleccionar**.
Con una sola zona no se renderiza control alguno.

### 5.5 Densidad
Tarjetas de cliente: padding 12px (antes 18–20), separación 8px (antes 14).

### 5.6 Bordes
Todas las alertas y chips con padding lateral consistente. Ya no tocan el borde.

### 5.7 Stock — ordenamiento
Nuevo: foco / nombre / categoría / cobertura / volumen.
Antes sólo venía ordenado por `es_foco_mes` desde la query.

---

## 6. `useSyncQueue` reescrito

| Defecto V9.0 | Fix |
|---|---|
| Cada montaje instalaba su `online` listener + `setInterval(8000)`. Dos `SyncBanner` = **dos flush simultáneos sobre la misma outbox** → check-ins duplicados | Store singleton a nivel de módulo, `useSyncExternalStore`, un flush a la vez con guarda `_inFlight` |
| Polling permanente cada 8s | Eventos reales: `online`, `offline`, `storage`, `visibilitychange` |
| `'kf_action_queue_v1'` duplicado | Importa `QUEUE_KEY` desde `offline.js` (ahora exportado) |
| Props no desactivaban los efectos | `enabled: false` en modo controlado |
| `handlersRef.current = handlers` en render | Asignación en efecto (seguro en modo concurrente) |

---

## 7. Pendiente

- [ ] Migrar las 27→~20 queries restantes a `safeSelect` (Visita, Metas, Ruta, Admin)
- [ ] Control Center: definir si replica el dashboard o es vista propia
- [ ] `mix%` inflado (`promClp` per-línea en vez de per-mes)
- [ ] 57 SKUs sin precio de lista
- [ ] Sur Capital sin filas en `ventas_lineas`
- [ ] Code-splitting: el bundle es de 727 kB

---

## 8. Verificación post-deploy

1. `BUILD_STAMP` debe decir `v-BS-PLATFORM-V9.1`
2. Login → los botones naranjas deben verse naranjas (si están grises, volvió el circular)
3. Clientes → "Mi cartera" debe leerse en blanco
4. Stock → "Encontrar compradores": si falla, debe decirlo, no mostrar "0 clientes"
5. Ejecutar `sql/20_CATALOGO_CANONICO.sql` y abrir un link de catálogo
6. Gerencia → si falta un bloque, el banner debe nombrarlo
