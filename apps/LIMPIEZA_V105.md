# v-BS-PLATFORM-V10.5 — Sólo lo necesario

**206/206 tests · ESLint 0 · typecheck ✅ · guard ✅ · build ✓**

## Qué se sacó

### Raíz: 28 markdowns → 6

Quedan sólo los vigentes:

```
README.md · DEPLOY.md · ROADMAP.md
ARQUITECTURA.md · SEGURIDAD.md · RENDIMIENTO.md
```

Los otros 22 eran notas de versiones ya superadas (`HOTFIX_V931`, `UX_V94`,
`SHELL_V998`, `PANTALLA_BLANCA`…). **No los borré: van a `docs/historial/`.**

Son la memoria de por qué el código es como es. El día que alguien pregunte
"¿por qué el `manualChunks` agrupa TanStack con React?", la respuesta está ahí.
Pero no tienen por qué ser lo primero que ve alguien al abrir el repo.

### Código huérfano eliminado (14 archivos)

Verificado uno por uno **por import real**, no por coincidencia de nombre:

```
components/ui/Estados.jsx · components/ui/index.jsx
ui/Aviso.jsx · ui/Confirmar.jsx
hooks/useTerminoDebounced.js · hooks/useGuardar.js (+ test)
lib/demoData.js (+ test) · lib/planStore.js · lib/telemetry.js
domain/pedidoAcciones.js (+ test) · domain/ventaTono.js
```

Casi todos vinieron en los patches y nunca se cablearon. Es el patrón que ya
costó caro: `GoalCard` estuvo dos meses en el repo con un import roto adentro
porque nadie lo usaba.

**Cuidado con los falsos positivos:** `Estados` y `Confirmar` aparecían como
"usados" en un `grep` por nombre, pero eran coincidencias con
`lib/pedidoEstados` y con la palabra "confirmar" en español. Verificado por
`import` antes de borrar.

### Carpetas vacías

`src/app/`, `src/components/domain/`, `src/components/layout/` — quedaron
vacías tras la migración a la estructura V10.

### `src/_pendientes/` → `docs/tests-pendientes/`

Los 10 tests que esperan componentes no integrados **no son código fuente**.
Estaban dentro de `src/`, donde confunden. Siguen con su README explicando qué
verifica cada uno y cómo reactivarlos.

### `.gitignore`

No existía. Ahora ignora `node_modules/`, `dist/`, `.env*` y `*.patch`.

Lo de `.env` importa: **una service key versionada es un incidente**, no un
descuido.

## Qué NO se tocó, y por qué

Verifiqué antes de borrar. Ya me equivoqué una vez borrando `apps/web/brand`
sin comprobar que el landing lo usaba.

| Parece duplicado | Pero |
|---|---|
| `brand/` · `apps/web/brand/` · `apps/field/public/brand/` | Los tres se referencian. Vercel despliega `apps/web` y `apps/field` por separado: cada uno necesita sus assets |
| `apps/web/shots/` (2,6 MB) | Capturas del landing, referenciadas en `index.html` |
| `styles/tokens.css` | No lo importa `main.jsx`, pero sí `index.css` con `@import` |

## Resultado

```
274 → 259 archivos
raíz: 28 markdowns → 6
src/: sin carpetas vacías, sin huérfanos
```

El ZIP sigue pesando parecido porque el peso está en los assets de marca y las
capturas del landing — que sí se usan. Lo que bajó es el **ruido**: lo que
alguien tiene que leer y descartar para entender el proyecto.
