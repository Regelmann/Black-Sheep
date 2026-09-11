# Sistema de diseño

Cuatro superficies, una marca. Cómo se mantienen coherentes sin ser
todas la misma pantalla.

---

## Core y Extendida

```
packages/marca/tokens.css      color, tipografía, ritmo · fuente única
packages/marca/base.css        reset y primitivas comunes
apps/<x>/src/estilos/app.css   lo propio de esa superficie
```

La capa **Core** es central y no se toca desde una app. La capa
**Extendida** la mantiene cada superficie, y puede crear lo que
necesite **siempre que herede los tokens**. Es el modelo que usa GitLab
en su sistema Pajamas, y funciona porque no obliga a pedir permiso para
cada componente nuevo mientras la marca no se rompa.

**Regla:** ningún color ni tamaño se escribe a mano en una app. Si hace
falta uno nuevo, se agrega a `tokens.css` y queda para todas.

### Por qué faltaba

`tokens.css` estaba copiado en tres apps y `supabase.js` también. La
tercera vez que hubo que cambiar un color, una quedó distinta y nadie lo
notó hasta ver las capturas. Y cuando `contextoDeSesion` leía los claims
del lugar equivocado, el error estaba en las tres copias a la vez.

## Lo que comparten y lo que no

| Superficie | Fondo | Por qué |
|---|---|---|
| Control Center | oscuro | Sesiones largas en escritorio |
| Gerencia | oscuro | Igual |
| Terreno | **claro** | Se usa con sol de frente, en la calle |
| Catálogo | **claro** | Lo abre un cliente que no conoce la marca |

Comparten marca, tipografía, ritmo y semántica de color. **No comparten
superficie.** Forzar una sola haría peor a dos de las cuatro: el negro
no se lee al sol, y un catálogo oscuro parece un sistema interno en vez
de un catálogo.

## La regla de oro del color

El lima da **13.1:1 sobre negro y 1.51:1 sobre blanco**.

- Sobre oscuro: acento, estado activo, foco, contadores.
- Sobre claro: **nunca** como texto. Existe `--lima-tinta`, el mismo
  tono llevado a un verde legible.
- Botones lima: texto negro, siempre.

## El color del tenant

Cada empresa tiene el suyo, pero **no reemplaza la marca**: entra
después del login y sólo en acentos secundarios. El Control Center
nunca lo usa, porque ahí no estás dentro de ninguna empresa.

La paleta de alta ofrece ocho colores y no el selector completo. Dejar
elegir cualquiera garantiza que alguien elija uno ilegible sobre el
fondo, y después es un problema de soporte.

## Tipografía y cifras

Una familia. La jerarquía la hacen peso y tamaño, no cinco tipografías.

Las cifras van siempre con figuras tabulares. Sin eso, un 1 y un 8
ocupan distinto y una columna de montos deja de alinearse — que es
justo cuando alguien tiene que comparar.

## Lo que el guard impide

`npm run verify` revisa la capa Core además de la app, porque un
`select('*')` o un secreto en `packages/` afectaría a las cuatro
superficies a la vez.

## Monorepo

```
npm install        en la RAÍZ · workspaces
npm run verify     en la raíz corre las tres apps
```

`apps/web`, la landing, queda **fuera** del workspace a propósito: es
Next.js, tiene su propio lockfile y su propio despliegue.

**Vercel:** cada app tiene Root Directory en `apps/<x>` y necesita
*Include files outside the root directory in the Build Step* activado
(viene así por defecto). El Install Command debe correr en la raíz:
`npm install --prefix ../..` si Vercel no lo detecta solo.
