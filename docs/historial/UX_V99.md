# v-BS-PLATFORM-V9.9-UX

**guard ✅ · 24/24 tests · build ✓**

## Lo que la investigación dijo — y me contradijo

Busqué qué se está haciendo hoy en apps móviles de primer nivel. El hallazgo
más directo fue sobre tu queja del selector de zona:

> Mapa de selección de componentes:
> 2 opciones → toggle · **3–5 → segmented control** · 6+ → dropdown

**Hay tres zonas.** El desplegable de V9.3 fue un error mío: escondía opciones
que caben en pantalla y costaba dos toques en vez de uno. Tu instinto
("me gustaba más cuando los veía") es la regla documentada.

Un segmented control es un componente *visibility-first*: su valor entero es
que se vean todas las opciones a la vez. Va en la barra superior, pegado al
contenido que controla.

## Reglas aplicadas

| Regla | Cómo se aplicó |
|---|---|
| Tercio inferior = pulgar | CTA primaria abajo; el header sólo informa |
| Objetivos ≥ 44px | `::after` extiende el área sin engordar el control |
| Transiciones 150–300ms | `--dur: 200ms` global |
| Sólo transform/opacity | Pastilla con `translateX`, no `left`/`width` |
| Háptica selectiva | Sólo en cambio de zona y error, no en cada toque |
| reduce-motion desactiva | `--dur: 0.01ms`, no una versión lenta |
| 16px reales en inputs | Evita el zoom automático de iOS |

## Cambios

**Header único.** Antes había franja blanca + hero de página apilados: ~180px
sin una sola acción, con el saludo repetido dos veces. Ahora un header que
colapsa al hacer scroll (histéresis 24/56px para que no parpadee), con el
scroll manejado en `requestAnimationFrame`.

**`ZoneSegmented`.** Pastilla deslizante, teclado con flechas, roving tabindex,
`ResizeObserver` para remedir en rotación. Con una sola zona no se renderiza.

**StatGrid sin huérfana.** Siete tarjetas en 3 columnas daban 3+3+1. Ahora
`4+3` en dos filas parejas.

**Escala única.** Un solo sistema de espaciado, tipografía, radios y elevación.
Antes cada pantalla inventaba el suyo — de ahí la sensación de "parchado".

## 🔴 Por qué el catálogo seguía roto

`get_public_catalogo()` estaba definida en **cinco archivos**: `19`, `20`, `22`,
`23`, y **dos archivos con el mismo número 24**.

Con el mismo número no hay ni orden que los desempate. `create or replace` sólo
pisa la función de firma idéntica, así que la viva era la del último script
ejecutado — y nadie sabía cuál.

Es el mismo bug de V9.3, repetido. **El guard lo detectó** (regla R8), junto con
4 SQL sin documentar (R10). Los 6 bloqueantes estaban ahí: V9.8 se subió con el
CI en rojo.

**Fix:** `sql/25_CATALOGO_FINAL.sql` — elimina todas las sobrecargas recorriendo
`pg_proc` y deja una sola definición. Las otras cinco quedaron limpias.

## Pendiente

Stock "encontrar compradores" y Gerencia "no cargó stock · notas" son errores de
**esquema**, no de UI: hay columnas en el `select` que no existen en las vistas.
Necesito el bloque 2 de `00_VERIFICAR_ESTADO.sql` para saber cuáles.

---

# V9.9.1 — Venta arriba con color por ritmo

## Lo que rescaté de tu screenshot

**1 · La pastilla activa toma el color de la zona.**
NOR-PONIENTE en teal, NOR-ORIENTE en naranja, ZONA SUR en naranja fuerte.
El ejecutivo reconoce dónde está por color, no sólo por posición. Los colores
ya estaban definidos en `lib/theme/zones.js` y no se estaban usando.

**2 · La venta manda arriba, en bloque oscuro con halo de color.**
Nuevo `components/VentaHero.jsx`.

## El color NO sale del porcentaje

Esto es lo que cambia de fondo respecto a lo que había:

```js
// antes, en Hoy.jsx
m.pct >= 70 ? 'ok' : m.pct >= 40 ? 'mid' : 'low'
```

Ese umbral fijo pinta igual un 70% el día 3 que el día 28. **Miente.**

Ahora el color sale de `calcGoal()`, que compara el avance contra la proporción
de **días hábiles** ya consumidos del mes:

| Estado | Color | Cuándo |
|---|---|---|
| SUPERADO | verde | 100%+ |
| EN_RITMO | verde | vas al día |
| ATRASADO | ámbar | bajo el ritmo |
| CRÍTICO | rojo | ≤4 días hábiles y bajo el 85% del ritmo |

Por eso el 72% de tu screenshot sale **verde**: el día 21, ir al 72% es ir en
ritmo. Con el umbral viejo salía igual que un 72% el último día del mes.

`calcGoal` ya existía con 5 tests. No la usaba nadie.

## Detalles

- **Marca del ritmo esperado** en la barra: una línea vertical en el % que
  deberías llevar hoy. Se ve si vas adelante o atrás sin hacer la cuenta.
- **Números tabulares**: el monto no "salta" al actualizarse.
- **Halo radial** del color de estado: se percibe antes de leer el número.
- **Pie contextual**: "Faltan $X · $Y/día en Z días" — el ritmo que necesitás
  de acá al cierre, no una cifra abstracta.
- El bloque va **arriba** porque es información, no acción. El tercio superior
  del teléfono es zona de estiramiento: la CTA vive abajo.

---

# V9.9.2 — La app deja de romperse cuando cambia la vista

**48/48 tests** (24 nuevos) · guard ✅ · build ✓

## El problema de fondo

PostgREST rechaza la consulta **entera** si UNA columna del select no existe.
No devuelve las que sí están: devuelve 400 y cero filas.

```js
.select('a,b,c,columna_renombrada')   →  400, nada
```

Como el ETL evoluciona, **cada renombre podía tumbar una pantalla completa**.
Eso es exactamente lo que se veía:

- Stock → *"Esta vista está desactualizada"*
- Gerencia → *"No cargó: stock · notas"*

No eran bugs de UI. Eran una consulta rígida contra una vista que cambió.

## Por qué el arreglo anterior no alcanzó

V9.8 ya intentaba resolverlo con cuatro listas de respaldo. Pero **las cuatro
incluían `sku_detalle`, `cliente_key` y `nombre_cliente`**: si una sola de esas
faltaba, fallaban las cuatro. No había respaldo final.

Y había un segundo camino de falla que ninguna lista cubría:

```js
q.eq('ejecutivo_id', eid)
```

Ese filtro rompe la consulta **aunque el select esté perfecto**, si la columna
cambió de nombre.

## La solución

El mismo patrón que ya usa `KEYFOODS_CICLO_UNICO.py` con `pick_col()`:
no asumir el nombre exacto, resolverlo contra lo que la fila trae.

**`lib/columns.js`**
- `pick` / `pickNum` / `pickStr` / `pickBool` — leen un campo probando alias
- Mapas `CARTERA`, `STOCK`, `GERENCIA` — fuente única de nombres. Si el ETL
  renombra algo, se agrega el alias acá y toda la app lo toma
- `auditar()` — reporta qué falta, **una sola vez** por campo (sin esto, 2000
  filas generan 2000 líneas idénticas y tapan el error real)
- `columnasReales()` — diagnóstico sin abrir Supabase

**`selectTolerante()` en `query.js`**
1. Intenta con la lista específica (rápido)
2. Si falla **por esquema**, reintenta con `*`
3. Los campos se leen con `pick()`

Sólo reintenta ante errores de esquema. Un fallo de RLS o de red no se arregla
pidiendo más columnas.

**Stock:** agregado `'*'` como último recurso. En ese modo el filtro por
ejecutivo se aplica **en JS**, para que una columna renombrada no tumbe también
el filtro.

**Gerencia:** `stock` y `notas_cliente` pasan a `'*'`. El `.or()` sobre `tipo`
se movió a JS por la misma razón.

## Detalles que los tests fijan

- **El 0 es un valor válido.** Un cliente con venta 0 no es lo mismo que un
  cliente sin dato. `pick` distingue `0` de `null`.
- **`false` es un valor válido.** Mismo razonamiento para `es_bloqueado`.
- **PostgREST manda numéricos como string**, y a veces con coma decimal.
  `pickNum` lo resuelve y nunca devuelve `NaN`.

Ningún test previo cubría nada de esto.

## Qué cambia en la práctica

Un cambio de esquema pasa de **"pantalla muerta"** a **"un dato menos, avisado
en consola"**. Y si necesitás saber qué columnas existen, la app te las lista
sola: aparecen en la consola la primera vez que entra en modo tolerante.

---

# V9.9.3 — Doble chequeo + orden del catálogo

**76/76 tests** (28 nuevos) · guard ✅ · build ✓

## 1 · Orden del catálogo del cliente

```
1 · LO QUE YA COMPRA      lo más RECIENTE primero — es su lista de reposición
2 · SUGERIDOS             sólo de los rubros donde el cliente ya opera
3 · RESTO DEL CATÁLOGO    disponible, pero abajo

Dentro de cada grupo: por RUBRO, después ALFABÉTICO
```

`sql/26_CATALOGO_ORDEN.sql` cruza `oferta_cliente_items` con el historial de
`ventas_lineas` (6 meses) y con `stock` para el rubro.

**Por qué en SQL y no en el front:** el orden es regla de negocio, no
presentación. Si vive en el front, el catálogo web y la app pueden mostrar
cosas distintas. El front sólo pone los encabezados donde cambia el grupo —
**no reordena nada**.

**Detalles que importan:**
- Dentro de "lo que compra", ordena por última compra: lo de hace 3 días
  pesa más que lo de hace 5 meses.
- Las sugerencias son **sólo de sus rubros**. No se le sugiere carne a una
  heladería.
- El alfabético usa `localeCompare(…, 'es')`: respeta acentos y Ñ.
- Índice nuevo `vl_cliente_sku_fecha_idx` — sin él el catálogo escanea
  `ventas_lineas` entera en cada apertura.
- Si `ventas_lineas` o `stock` no existen, un `EXCEPTION` devuelve el
  catálogo alfabético en vez de caerse. Cliente nuevo sin historial: todo
  cae a grupo 3 y sale alfabético.

## 2 · Doble chequeo

**El principio:** una escritura no está confirmada porque el servidor no
devolvió error. Está confirmada cuando la volvés a leer y está.

Ya nos pasó dos veces, y las dos el servidor "no dio error":
- El outbox borraba items ante `{ok:false}` (un objeto es truthy)
- Admin caía al INSERT cuando el SELECT previo fallaba → meta duplicada

**`lib/validate.js`**

| Función | Qué hace |
|---|---|
| `validar(obj, esquema)` | Chequeo previo declarativo |
| `escribirYConfirmar()` | Escribe **y relee**. Sin fila de vuelta = fallo |
| `upsertSeguro()` | Si no puede verificar si existe, **aborta**. Nunca inserta a ciegas |
| `validarPedido()` | Valida líneas y dice **cuál** falló |

**Aplicado a `syncHandlers`:** los inserts ahora llevan `.select('id')`.
Confirmación en el mismo viaje, sin segunda consulta. Si no vuelve fila,
es fallo — el item se queda en la cola.

**Bug encontrado de paso:** `handlePedido` devolvía `{ok:true}` con payload
vacío → el pedido se borraba de la cola como si se hubiera subido. Ahora se
marca `descartar` y se registra, en vez de fingir éxito.

**Tope de reintentos:** 25 intentos con backoff son días. Más allá es una cola
que nunca drena y esconde el problema real.

## 3 · Doble chequeo también en SQL

`26_CATALOGO_ORDEN.sql` no se limita a verificar que la función exista. Toma
un catálogo real y **recorre el resultado comprobando que los grupos salgan
en orden 1,1,…,2,2,…,3,3,… sin intercalarse**. Si algo está fuera de lugar,
nombra el producto.

Tres chequeos: firma única + permiso de `anon` · orden real verificado ·
ningún catálogo activo sin productos visibles.
