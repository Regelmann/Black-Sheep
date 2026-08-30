# v-BS-PLATFORM-V10.3 — Fase 2

**137/137 tests · ESLint 0 errores · typecheck ✅ · guard ✅ · build ✓**

## Tercer patch sobre base vieja

`git apply --check` vuelve a fallar. El patch está hecho sobre `V10.0-SHELL`;
la base actual es V10.2. Aplicarlo habría revertido los 42 tokens, la navbar,
el header, el catálogo, IndexedDB, el backoff y la bandeja de agotados.

Extraje los 14 archivos de Fase 2 y los integré verificando cada uno.

## Lo que se integró

| Módulo | Tests |
|---|---|
| `styles/identidad.css` + `contraste.test.js` | 6 |
| `styles/tipografia.test.js` | 4 |
| `lib/queryClient.js` | 16 |
| `hooks/useDatos.js` | 8 |
| `hooks/useGuardar.js` | 6 |
| `components/ui/Estados.jsx` · `hooks/useTerminoDebounced.js` | — |
| `types/dominio.d.ts` + `tsconfig.json` + `scripts/typecheck.js` | — |

**40 tests nuevos.**

### El test de contraste es lo más valioso del paquete

> "La app se usa en la calle, con sol directo. Un texto que en el monitor se ve
> bien a 3.5:1, en la vereda no se lee."

Mide WCAG sobre los tokens **reales** de `identidad.css`. Cierra el hueco de
accesibilidad que la auditoría marcaba (`Hoy.jsx` con 2 atributos ARIA en 526
líneas) y lo vuelve verificable por máquina, no opinable.

`identidad.css` deriva todo de `var(--brand)` en vez de fijar un hex propio,
para que `applyTenantBrand()` siga pintando cada tenant. Bien pensado.

## Corregí la lista blanca del typecheck

El propio `typecheck.js` dice:

> "un archivo se agrega a `files` cuando queda en cero errores"

Pero la lista llegaba con 7 archivos y **87 errores**: `outboxDb` 33,
`syncHandlers` 19, `tenants` 12, `supabase` 12. Un typecheck que siempre falla
es ruido permanente — exactamente lo que el plan advierte sobre los avisos.

La dejé en los 3 que hoy están limpios. Los otros entran de a uno.

## 🔴 Dos bugs que las herramientas nuevas encontraron

**1 · R14 en `Estados.jsx`** (archivo del propio patch):

```
--glifo-xl  no resuelve → el glifo queda invisible
--text-base no resuelve
```

La regla que escribí para el gráfico de Gerencia atrapó el mismo bug en código
que llegó después.

**2 · `safeParse(null)` — lo encontró el typecheck**

```js
function safeParse(s) { return JSON.parse(s) }   // s puede ser null
```

`localStorage.getItem()` devuelve `null` cuando la clave no existe.
`JSON.parse(null)` **no lanza**: devuelve `null`. El caso "no hay dato" quedaba
enmascarado como "dato vacío". Ahora hay guarda explícita.

Estaba ahí desde antes de que yo entrara al proyecto.

## `verify` ahora son cinco pasos

```
lint → typecheck → guard → test → build
```

---

## Sobre el proceso — lo digo una sola vez

Tres patches seguidos llegaron sobre `V10.0-SHELL`. Cada uno me obliga a:
extraer archivos a mano, detectar qué revertiría, reintegrar, y re-corregir
lo que la base vieja no tenía.

Es tiempo que no va a producto. Y es más riesgoso: si algo se me pasa en la
extracción, entra silencioso.

**La causa es que la otra herramienta no ve el repo actualizado.** Se resuelve
de una de dos formas: o le pasás el ZIP de la última versión antes de que
genere el patch, o el trabajo entra por una sola vía.

No es un problema de calidad del código que llega — `outboxDb.js` y el test de
contraste son muy buenos. Es de sincronización.
