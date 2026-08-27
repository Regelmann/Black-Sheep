# v-BS-PLATFORM-V10.0.1

**76/76 · guard ✅ (R14 nueva) · build ✓**

## ✅ El catálogo funciona

En tus capturas: *"CATÁLOGO PERSONALIZADO · ROUTE SPA · 19 productos"* con
**"Tus habituales — Lo que ya comprás"** primero y "Más productos" después.

El SQL 25/26 quedó aplicado y el orden comercial anda. Y el editor de precios
ya no parece un formulario de sistema operativo viejo.

---

## 🔴 42 tokens CSS que no existían

El hallazgo más grande de esta ronda.

El gráfico de tendencia de Gerencia mostraba **una sola barra** — la de May.
La causa:

```js
let barBg = 'var(--info-lt4)'                 // no existe
if (active) barBg = 'var(--navy-2)'           // no existe
else if (isBest) barBg = 'var(--ok-mid)'      // no existe
else if (isWorst) barBg = 'var(--danger)'     // ← el ÚNICO que existía
```

**Un `var()` que no resuelve no da error.** CSS lo trata como valor inválido y
el fondo queda transparente: la barra existe, ocupa espacio, y es invisible.

Es el mismo patrón que el `var(--brand)` circular de `tenants.js`. Una variable
que no resuelve no rompe el build, rompe la pantalla.

Al buscarlos todos aparecieron **42**: estados de pedido, historial, sombras,
la escala de neutros completa. Todos definidos ahora.

### Guard R14

Detecta cualquier `var(--token)` sin definición, exceptuando los que un
componente declara en línea (`style={{ '--x': ... }}`) o vía `setProperty`.

Los 42 estaban ahí desde antes de que yo entrara al proyecto.

---

## Barra inferior — se cortaba en TODAS las pantallas

Se veía `ntes Stock Más`. La causa:

```css
.navbar { width: 100%; padding: 0 12px; }   /* sin box-sizing */
```

100% **más** 24px de padding = más ancho que la pantalla. Con
`translateX(-50%)` desborda por ambos lados y el primer ítem queda fuera.

En V9.9.7 escribí la corrección sobre `.bs-tabbar` y `.bs-bottomnav` —
**clases que no existen en este proyecto**. La real es `.navbar`. Por eso no
pasó nada.

---

## Header: "Hola, Sebast…"

El título competía por el ancho con el segmented **y** con un subtítulo que
repetía la zona.

Pero el segmented ya muestra la zona activa resaltada: el subtítulo era
redundante. Se quitó, y las etiquetas pasan a `Oriente / Poniente / Sur` —
con tres pastillas visibles el contexto ya está dado, y "Poniente" se lee
mejor que "N-Ponien…".

---

## Catálogo: el "15" suelto

`.bs-shop-section-head` no era flex, así que el contador de la sección caía
debajo del título en vez de ir a la derecha. Ahora es una pastilla, y
"Tus habituales" se destaca en naranja por ser la sección que importa.

Las tarjetas de la lista pasan a grid de 3 columnas: nombre (hasta dos
líneas), precio, botón. Antes se desbordaban.

---

## Estado

| | |
|---|---|
| Catálogo público | ✅ funcionando con orden comercial |
| Editor de precios | ✅ |
| Stock → compradores | ✅ 12 clientes, $1.690.442 |
| Barra inferior | ✅ |
| Header | ✅ |
| Gráfico de tendencia | ✅ |
| "ver causa" | ⏳ pendiente |
| Control Center | ⏳ pendiente |
