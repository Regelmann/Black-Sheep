# v-BS-PLATFORM-V9.2 — Merge de V92 sobre base sana

**build verde · 24/24 tests · 0 imports rotos**

## Qué se integró de V92.4

| Archivo | Líneas | Qué aporta |
|---|---|---|
| `lib/planDia.js` + test | 548 | Ranking único: stock + foco + GPS |
| `lib/dataIntegrity.js` + test | 197 | Validación de la bajada, con tests |
| `lib/dataHealth.js` | 129 | Semáforo de confiabilidad |
| `lib/syncHandlers.js` | 125 | Handlers del outbox, fuente única |
| `hooks/useVendorGps.js` | 161 | GPS reutilizable |
| `lib/planStore.js` | 46 | Compartir el plan entre Hoy y Mapa |

## Lo que NO se integró (regresiones de V92)

V92.4 salió de V9.0, no de V9.1. Traía de vuelta:

- `tenants.js` con `accent: 'var(--brand)'` → **referencia circular**, mata la marca al login
- `esNombreProducto()` borrada → códigos SKU visibles al vendedor
- `pctAvanceFoco()` borrada → la fracción 0.7619 sin normalizar
- `require()` dentro de ESM en `pedido.js`
- **`CatalogoCliente.jsx` eliminado** con el import y la ruta aún activos → no compilaba

Todo eso se descartó. Se conservó la versión de V9.1.

---

## 🔴 Bug de pérdida de datos encontrado y corregido

Dos capas con contratos incompatibles:

```js
// offline.js esperaba boolean:
const success = await fn(item)
if (success) ok++          // borra el item de la cola
else remaining.push(item)

// syncHandlers.js devolvía objeto:
return { ok: false, error: '...' }
```

**`{ok:false}` es un objeto truthy.** Cada fallo de sincronización **borraba
el check-in/pedido de la cola como si se hubiera subido.**

Un vendedor cerraba una visita sin señal, la app decía "sincronizado",
y la fila no existía en Supabase.

**Fix:** contrato explícito (`res === true || res?.ok === true`), conteo de
intentos y `lastError` por item. Cubierto por `lib/offline.test.js` — 10 tests
nuevos, incluyendo valores ambiguos (`{}`, `{ok:1}`, `null`, arrays).

Ninguno de los 14 tests previos lo detectaba.

### Otros fallos silenciosos en `syncHandlers`

- `handleCompletar` y `handleNoVenta` hacían `await update()` sin revisar `error`
  y devolvían `{ok:true}` igual → mismo efecto de pérdida
- `handleCheckin` degradaba la fila (perdía `cliente_key` y `ejecutivo_id`) ante
  **cualquier** error. Ahora sólo lo hace si el error es de esquema, y lo marca
- `handlePedido` importaba `guardarPedido` sin usarlo (chunk dinámico inútil)

---

## Handlers unificados

Había **tres** definiciones compitiendo:

- `App.jsx` — `async (p) => { await insert(p) }` → devuelve `undefined` → **la cola nunca drenaba**, y usaba `notas_visita` en vez de `notas_cliente`
- `Hoy.jsx` — handlers inline, con `pedido: async () => true` (descartaba pedidos)
- `Hoy.jsx:307` — `flushActionQueue({})` → **reintento vacío**, el botón no hacía nada

Ahora las tres usan `lib/syncHandlers.js`.

---

## Verificación

```
STAMP        v-BS-PLATFORM-V9.2
TESTS        24/24
  useGoalCalculation   5/5
  offline (nuevo)     10/10
  planDia              4/4
  dataIntegrity        5/5
IMPORTS      0 rotos
var() circular   0
flushActionQueue({})  0
```
