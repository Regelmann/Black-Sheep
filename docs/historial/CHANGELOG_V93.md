# v-BS-PLATFORM-V9.3

**guard ✅ (10 avisos) · 24/24 tests · build ✓ · 205 → 166 archivos**

## 1. CI + guard de regresiones

`.github/workflows/ci.yml` y `scripts/guard.js` — 8 reglas, cada una nacida de
un bug que llegó a una entrega. Nuevo comando: **`npm run verify`**
(guard + tests + build).

Tres entregas seguidas llegaron sin compilar porque nadie corrió el build.
Ahora el CI lo bloquea.

## 2. 🔴 Bug encontrado por el guard en su primera corrida

`crear_pedido_publico()` tenía **dos firmas conviviendo** en la base:

```sql
01, 05 → (p_token, p_lineas)
11     → (p_token, p_lineas, p_nota DEFAULT null)
```

En Postgres son funciones **distintas**: `create or replace` sólo pisa la de
firma idéntica. Como la de 3 args tiene DEFAULT, llamar con 2 matchea ambas:

```
ERROR: function reference "crear_pedido_publico" is not unique
```

**El cliente armaba el pedido, apretaba enviar, y fallaba.**

Fix: `sql/21_PEDIDO_PUBLICO_CANONICO.sql`, firma única de 3 args **sin DEFAULT**.

Además: `setPedidoId(data?.id …)` sobre un UUID escalar era siempre `undefined`
→ **el cliente nunca veía su número de pedido.**

## 3. Migración a `safeSelect` (26 → 10 avisos)

Los cuatro que más importaban:

- **`Admin`** — si el SELECT del upsert fallaba, caía al INSERT → **meta
  duplicada en vez de actualizada**
- **`Visita`** — si fallaba leer el check-in previo se asumía "sin check-in"
  → **el vendedor marcaba llegada dos veces**
- **`Ruta`** — la lectura alimenta una escritura; fallaba y "optimizar" no
  hacía nada sin aviso
- **`Metas`** — el fallback por zona enmascaraba el error de la primera consulta

## 4. Limpieza — verificada archivo por archivo

### SQL

**Eliminados (3):** `05_CATALOGO_PUBLICO`, `10_CATALOGO_WEB_V24`,
`16_CATALOGO_LISTA_FIRST` — sólo redefinían funciones ya canónicas.

**Limpiados, no borrados (2):**
- `01_COMMERCE_CANON` → sin las funciones duplicadas; conserva índices y
  `marcar_pedido_externo()`
- `11_ORDER_INBOX_V26` → 200 → 37 líneas. **Conserva los `ALTER TABLE`** que
  crean las columnas que usa la función canónica. Borrarlo habría roto el pedido.

`scripts/KEYFOODS_CICLO_UNICO.py` está **vigente** (4.308 líneas; alimenta
`cartera`, `ejecutivos`, `ventas_lineas`, `gerencia`, `snapshot_meta`).

### Código muerto

`Metas.jsx` (529 líneas) **eliminado**: no lo importaba nadie y la ruta `/metas`
redirigía a `/`. Lo único que aportaba y no existía en otro lado — el avance de
focos con barra — se rescató en `components/FocosMes.jsx` y se cableó en Hoy.

Metas calculaba el porcentaje a mano:

```js
const pct = metaU ? Math.round((vendido / metaU) * 100) : pctNum(f.pct_avance)
```

reproduciendo lo que ya hace `pctAvanceFoco()`, que además normaliza
`pct_avance` cuando llega como fracción (0.7619). Ahora se usa la función.

**`NotaModal` estaba duplicado**: el componente en `components/` (que nadie
importaba) y una copia local en `Cartera.jsx`. Consolidado al componente,
que además tenía "Pidió" con tilde y la constante fuera del render.

**Otros eliminados:** `DataBanner`, `ExecutivePulse`, `useZoneTheme`,
`places.js`, `ui.js`, `index.legacy.css`, `ZoneTabs` (reemplazado por
`ZonePicker`), scripts Python duplicados byte a byte, 6 docs de versiones
viejas, `capacitor.config.json`.

**NO se borró** `tokens.css`: `index.css` lo importa.

## 5. Documentación

- `README.md` reescrito — decía **v2.4**, siete versiones atrás
- `sql/README.md` — tabla de vigencia y explicación de los eliminados
- `ROADMAP.md` — fases 1 a 5

## Huérfanos que quedan a propósito

`GoalCard`, `BuyerSuggestions`, `VisitCheckIn`, `useVendorGps`,
`useGoalCalculation`, `planStore` — piezas escritas y probadas que se cablean
en la Fase 2 del roadmap. No son basura; son trabajo adelantado.

## 6. Guía de despliegue

Faltaba: `DEPLOY.md` esperaba el stamp **V68** y el README decía **v2.4**.

**Nuevo `sql/00_VERIFICAR_ESTADO.sql`** — no modifica nada, sólo diagnostica:
tablas, columnas críticas, la columna fantasma `activa`, funciones con firma
duplicada, permisos de `anon`, RLS, políticas `USING(true)`, frescura de la
bajada y catálogos inalcanzables por `activo NULL`.

**`DEPLOY.md` reescrito** — 6 pasos, SQL antes que código, prueba de humo de
9 puntos donde cada uno verifica algo que ya se rompió alguna vez.

**`17_MEMORY_DECISIONS.sql`** era el único no idempotente (fallaba al
re-ejecutarse con `policy already exists`). Corregido con `DROP POLICY IF EXISTS`.

**Dos reglas nuevas en el guard**, para que esto no se repita:

- **R9** — `README.md` y `DEPLOY.md` deben citar el `BUILD_STAMP` actual
- **R10** — todo `.sql` del repo debe estar listado en `DEPLOY.md`

Ambas bloquean el CI. Probado: agregar un `.sql` sin documentarlo rompe el build.
