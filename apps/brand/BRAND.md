# Identidad Black Sheep

## El logo

**`logo-master-1024.png`** es la fuente. Todo lo demás se deriva de ahí.

La oveja con circuitos en lima fluorescente sobre negro. Nada de otro
archivo es el logo.

### Historial de dos errores, para que no se repitan

1. `Logo.tsx` dibujaba un cuadradito con las letras **"BΣ"** y un degradado
   naranja. Inventado.
2. `logo-mark-transparent.svg` y sus hermanos eran un **dibujo genérico de
   oveja** en verde `#16a34a`. Tampoco eran el logo. **Eliminados.**

Si hace falta una versión vectorial, se vectoriza el master — no se dibuja
una aproximación.

### Archivos derivados

| Archivo | Uso |
|---|---|
| `logo-master-1024.png` | fuente, no se usa directo |
| `logo-mark-512.png` | web, ícono PWA grande |
| `logo-mark-192.png` | ícono PWA, favicon grande |
| `logo-mark-180.png` | apple-touch-icon |
| `logo-mark-64.png` · `logo-mark-32.png` | favicon |
| `logo-mark-transparente.png` | sobre fondos que no son negros |

Todos regenerados desde el master. Para rehacerlos, redimensionar con
LANCZOS desde `logo-master-1024.png`.

## Los colores

| | | |
|---|---|---|
| Negro | `#0c0a09` | fondo de la marca |
| Lima | `#a3e635` | acento de la plataforma |

**Regla de oro:** el lima da **13.1:1 sobre negro** y **1.51:1 sobre blanco**.
Nunca lima sobre claro. Los botones lima llevan texto **negro**.

### El naranja NO es de Black Sheep

`#c2410c` es el color de **KeyFoods**, que es un tenant. Sólo aparece
DENTRO de la app después del login, aplicado por `applyTenantBrand()`.

En `black-sheep.cl` no va nunca.
