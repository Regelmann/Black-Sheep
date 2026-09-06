# Cómo sigue la estructura de la app

El paquete de arquitectura dejó las carpetas dibujadas: `repos/` tiene un
README y `security/` un archivo de 19 líneas. La estructura está definida,
falta construirla.

Esto es lo que falta, **medido sobre el código real**, no sobre un diagrama.

---

## El número que define el trabajo

```
20 archivos llaman a supabase.from() directo
66 llamadas en total
 8 archivos SIN paginar ni manejar el error
```

Los ocho crudos: `memory.js`, `nota.js`, `pedido.js`, `syncHandlers.js`,
`Hoy.jsx`, `Admin.jsx`, `Cartera.jsx`, `Ventas.jsx`.

**Eso no es deuda teórica.** Es exactamente el patrón de tres bugs que ya
nos costaron versiones:

| Bug | Causa |
|---|---|
| Prospectos: 917 de 2.389 | `.limit()` no sube el techo de 1.000 de PostgREST |
| Catálogo con 19 productos | la consulta armaba la lista desde la tabla equivocada |
| Cartera vacía sin señal | `data \|\| []` — el error se tragaba y devolvía lista vacía |

Con la consulta repartida en 20 archivos, cada uno vuelve a cometer el mismo
error por su cuenta. Con una capa de repositorios, se arregla **una vez**.

---

## Por qué esto es urgente AHORA y no antes

Hasta acá era higiene. Con multi-tenant es **seguridad**.

RLS filtra por `tenant_id`, pero una consulta que se traga el error no
distingue entre *"esta empresa no tiene datos"* y *"la política me denegó"*.
Las dos devuelven vacío. Un vendedor vería su cartera en blanco sin saber por
qué, y nosotros tampoco.

`safeSelect` ya distingue esos casos. El problema es que **sólo 12 de 20
archivos lo usan**.

---

## El orden, de lo que más destraba a lo que menos

### 1 · Preflight de las claves — **bloqueante**

`sql/49`, Parte 1. Sin esto no se puede activar el aislamiento: `zonas.id` y
`zonas_comunas.comuna` son PK sin `tenant_id` y el segundo cliente no entra.

Es una consulta de lectura. Correla y mirá la salida.

### 2 · Repositorios para las 4 tablas calientes

`stock`, `cartera`, `ventas_lineas`, `pedidos` — 42 de las 66 llamadas.

Cada repositorio hace tres cosas que hoy cada archivo hace a su manera, o no
hace:

- **paginar** con `traerTodo`, para no comerse el techo de 1.000
- **no tragarse el error**, con `safeSelect`
- **filtrar por tenant** en el cliente, además de RLS — defensa en
  profundidad: el filtro ayuda al planificador, la política es la barrera

Las páginas dejan de saber que existe Supabase.

### 3 · Migrar los 8 archivos crudos

Uno por uno, verificando después de cada uno. **No los 20 de golpe** — eso
fue lo que pasó con la limpieza de CSS de V12.7, donde borré 242 bloques con
un criterio equivocado y rompí la UI sin que ningún test lo detectara.

### 4 · Las políticas fail-closed

`security/51` y `52`, recién después de que los repositorios centralicen el
acceso. Si se activa antes, cada uno de los 20 archivos falla distinto y
depurarlo es imposible.

### 5 · Guard R21 · nadie llama a Supabase fuera de un repositorio

Una regla que bloquea `supabase.from()` en `pages/` y `domain/`. Sin eso, la
capa se erosiona en tres versiones — es lo que ya pasó con `catalogControlCenter`,
que quedó escrito y sin cablear durante seis versiones.

---

## Lo que NO haría todavía

**Reorganizar las carpetas** (`config/`, `reporting/`). Mover archivos genera
un diff enorme donde los cambios reales se pierden, y no arregla ningún bug.

Vale la pena cuando la capa de repositorios exista y haya algo que ordenar.

---

## Un aviso sobre el alcance

Los pasos 2 y 3 son **una versión cada uno**, no una entrega. Cuatro
repositorios más migrar ocho archivos con verificación entre medio es trabajo
de varios días.

Prefiero decirlo antes que entregar veinte archivos migrados a medias — que
es justo lo que venimos corrigiendo.
