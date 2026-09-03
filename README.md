# Black Sheep Field

PWA de ventas en terreno para distribución de alimentos.
Multi-tenant. Cliente principal: **KeyFoods** (Santiago, Chile).

> **`v-BS-PLATFORM-V13.6`** · guard ✅ · 24/24 tests · build ✓

---

## Qué hace

Un ejecutivo abre la app en la calle y ve, en este orden:

1. **Hoy** — su plan del día: a quién visitar y qué ofrecerle
2. **Mapa** — la ruta ordenada por GPS
3. **Clientes** — su cartera, con el estado de cada uno
4. **Stock** — qué hay disponible y quién lo compra
5. **Más** — metas, gerencia, catálogo del cliente

Todo funciona **sin señal**: check-ins, notas y pedidos entran a una cola local
y suben solos al recuperar red.

---

## Arranque

```bash
cd apps/field
npm ci
cp .env.example .env      # completar SUPABASE_URL y SUPABASE_ANON_KEY
npm run dev
```

## Antes de subir cualquier cambio

```bash
npm run verify
```

Un solo comando: **guard + tests + build**. Si falla, no se sube.

No es opcional. Tres entregas seguidas llegaron sin compilar porque nadie corrió
el build. El CI ahora lo bloquea, pero conviene verificar antes de pushear.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run guard` | Reglas de regresión |
| `npm test` | Tests unitarios |
| `npm run verify` | Los tres, en orden |

---

## Estructura

```
apps/field/            PWA del vendedor (React + Vite → Vercel)
  src/
    pages/             Hoy · Ruta · Cartera · Stock · Gerencia · Visita · Catálogo
    components/
      domain/          Componentes de negocio (ZonePicker, ClientActionBar…)
      FilterBar.jsx    Filtros, buscador y grilla de stats — UNIFICADOS
      DataState.jsx    Estados de carga / error / vacío
    lib/
      query.js         safeSelect — ninguna consulta falla en silencio
      offline.js       Cola offline (outbox)
      syncHandlers.js  Handlers del outbox — fuente ÚNICA
      planDia.js       Ranking del día: stock + foco + GPS
      dataHealth.js    Semáforo de confiabilidad de la bajada
      tenants.js       Branding por cliente
  scripts/guard.js     Reglas de regresión

apps/web/              Landing y Control Center (HTML estático)
sql/                   Migraciones Supabase — orden numérico
scripts/               ETL en Python (Colab / GitHub Actions)
docs/                  Documentación operativa
ROADMAP.md             Hacia dónde va
```

---

## Reglas del proyecto

Cinco reglas que salieron de bugs reales. No son estilo.

**1 · Una sola rama.**
Todo sale de la última versión. Las ramas paralelas devolvieron a producción
bugs ya reparados, tres veces seguidas.

**2 · Nada se sube sin `npm run verify` verde.**

**3 · Ninguna consulta falla en silencio.**

```js
// ❌ si falla, la UI muestra "0 clientes" como si fuera un resultado real
const { data } = await supabase.from('cartera').select('a,b,c')

// ✅ vacío y roto son cosas distintas
const r = await safeSelect(supabase.from('cartera').select('a,b,c'))
if (!r.ok) mostrarError(r.error)
```

**4 · Los colores de marca son hex literales, nunca `var()`.**
`accent: 'var(--brand)'` + `setProperty('--brand', accent)` produce
`--brand: var(--brand)` → referencia circular → muere todo el branding.

**5 · Una función SQL, un solo archivo.**
`create or replace` sólo pisa la función de **firma idéntica**. Redefinirla en
varios archivos deja las versiones viejas vivas en la base.

---

## El guard

`npm run guard` chequea 8 reglas. Cada una existe porque el bug llegó a una entrega:

| Regla | Qué detecta | De dónde salió |
|---|---|---|
| R1 | Imports a archivos inexistentes | Se importaba una página borrada |
| R2 | `var()` como valor de color en JS | Referencia circular que mató la marca |
| R3 | `require()` dentro de ESM | Inyectado en un try/catch mudo |
| R4 | Consultas que descartan el error | 27 casos mostrando fallo como "0" |
| R5 | `flushActionQueue({})` | Botón "Reintentar" que no hacía nada |
| R6 | Handler del outbox sin `return` | Devolvía `undefined` → cola eterna |
| R7 | Clave de storage duplicada | `kf_action_queue_v1` en dos lugares |
| R8 | Función SQL en varios archivos | 4 definiciones de `get_public_catalogo` |
| R9 | `README`/`DEPLOY` sin el stamp actual | `DEPLOY.md` decía "V68", el README "v2.4" |
| R10 | Archivo `.sql` no listado en `DEPLOY.md` | SQL nuevo que nadie corría |

R1, R2, R3, R5, R8, R9 y R10 **bloquean**. R4, R6 y R7 avisan (deuda conocida).

---

## Base de datos

Supabase (PostgreSQL + RLS). Migraciones en `sql/`, **en orden numérico**.

Archivos canónicos — no redefinir estas funciones en otro lado:

| Archivo | Función |
|---|---|
| `20_CATALOGO_CANONICO.sql` | `get_public_catalogo()` |
| `21_PEDIDO_PUBLICO_CANONICO.sql` | `crear_pedido_publico()` |

**Antes de tocar nada**, correr `sql/00_VERIFICAR_ESTADO.sql` en el SQL Editor:
no modifica nada y dice qué tablas, columnas, funciones y permisos faltan.

Los pasos completos de despliegue están en [`DEPLOY.md`](DEPLOY.md).

Ambos traen bloque de verificación al final. El de `21` debe devolver
**exactamente una fila**; si devuelve más, volvió la ambigüedad de sobrecarga.

---

## ETL

`scripts/KEYFOODS_CICLO_UNICO.py` — el ciclo completo. Alimenta `cartera`,
`ejecutivos`, `ventas_lineas`, `gerencia` y `snapshot_meta`.

Hoy corre a mano en Google Colab. Automatizarlo requiere estos secrets en
GitHub Actions:

```
SUPABASE_URL · SUPABASE_SERVICE_KEY · GOOGLE_MAPS_API_KEY
GDRIVE_SA_JSON · GDRIVE_FOLDER_ID
```

**Compuerta VALIDAR/PUBLICAR:** ninguna bajada llega a producción sin pasar los
chequeos de integridad. No saltearla.

**Regla de datos:** la maestra de clientes es la única fuente de verdad para
asignar zonas. Nunca `vendedor_origen` ni `ejecutivo_asignacion` del ERP.

---

## Deploy

Vercel, dos proyectos:

| App | Dominio |
|---|---|
| `apps/field` | `app.black-sheep.cl` |
| `apps/web` | `black-sheep.cl` |

Tras desplegar, **verificar el `BUILD_STAMP` en pantalla**. Si no cambió, revisar
la pestaña Deployments de Vercel: puede haber un rollback activo. Usar
"Promote to Production" sobre el deploy correcto.

---

## Estado y próximos pasos

Ver [`ROADMAP.md`](ROADMAP.md), [`ARQUITECTURA.md`](ARQUITECTURA.md) y [`SEGURIDAD.md`](SEGURIDAD.md) y [`RENDIMIENTO.md`](RENDIMIENTO.md).

Lo más urgente: **probar la cola offline con un teléfono real en un lugar sin
señal.** Ningún test lo reemplaza, y es lo que decide si un vendedor confía en
la app o vuelve al cuaderno.
