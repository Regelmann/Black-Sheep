# v-BS-PLATFORM-V9.9.7 — Correcciones de lo visto en pantalla

## 1 · 🔴 "No se pudo abrir la visita" — el más grave

`buscarCarteraPorKey()` usaba una lista rígida de columnas y **descartaba el
error**:

```js
let { data, error } = await supabase.from('cartera').select(CARTERA_SEL)...
if (!error && data?.[0]) return data[0]
return null      // ← "falló" y "no existe" devuelven lo mismo
```

Si una columna de `CARTERA_SEL` no existe, PostgREST rechaza la consulta
entera y la función devuelve `null` — indistinguible de "el cliente no está".

Es el mismo patrón que arreglé en Stock y Gerencia. **Esta función se me pasó.**

**Fix:** intenta con la lista específica, reintenta con `*` si el fallo es de
esquema, y devuelve `{ cliente, error }`. Ahora el mensaje distingue tres
casos:

- *No se encontró el cliente* → realmente no está
- *No tenés acceso a este cliente* → RLS, está en otra zona
- *No se pudo consultar* → falló la consulta, reintentar

## 2 · Header duplicado — culpa mía

Se veía:

```
Hola, Se…          ← título cortado
NOR-ORIENTE
Hola, Sebastian    ← el saludo OTRA VEZ
```

`App.jsx` pasaba `titulo="Hola, Sebastian"` **y** `nombre="Sebastian"`, y
`AppHeader` renderizaba los dos. Un descuido al introducir el componente
en V9.9.

**Fix:** un solo saludo. El componente ya no renderiza `nombre` por su cuenta:
quien llama decide el título.

Y el título bajó de 28px a 17px. Competía con el segmented por el ancho y por
eso salía cortado. El nombre del vendedor no necesita ser el elemento más
grande de la pantalla — lo que importa es la zona.

## 3 · Segmented: "Sur" fuera del fondo

El contenedor no reservaba ancho y el último botón desbordaba la pastilla.

**Fix:** `grid-auto-columns: 1fr` — las tres del mismo ancho, con `max-width`
para no invadir el título.

## 4 · Barra inferior cortada

Se veía `nteStock Más`: los ítems desbordaban hacia la izquierda.

**Fix:** grid de 5 columnas iguales, centrada con `translateX(-50%)` y ancho
calculado, en vez de ancho fijo mayor que la pantalla.

## 5 · Gerencia

- **"Zonas / canales" ilegible**: texto oscuro sobre fondo oscuro en el botón
  activo. Ahora fondo oscuro + texto blanco.
- **Gráfico de tendencia**: sólo se veía la barra de May porque el contenedor
  colapsó a altura 0. `min-height: 140px`.

## Lo que SÍ funcionó

Vale registrarlo, porque confirma que los arreglos anteriores sirvieron:

- **Stock cruza compradores**: *"Black Sheep encuentra · 12 clientes ·
  $1.690.442 potencial"*. Antes decía "no pude leer tu cartera".
- **Clientes bloqueados: 12** en Gerencia, con nombres.
- **Las 4 acciones de contacto** (Llamar · WhatsApp · Navegar · Nota) se ven
  completas y con iconos.
- **Venta del mes en rojo "Crítico"** — el color por ritmo funcionando: 56% a
  4 días del cierre es crítico, y lo dice.

## Pendiente

- Editor de catálogo: sigue con estética de formulario viejo
- "ver causa" en Gerencia no navega
- Control Center
