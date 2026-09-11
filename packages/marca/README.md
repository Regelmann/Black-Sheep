# packages/marca

La capa **Core** del sistema de diseño. Una sola fuente de verdad para
las cuatro superficies.

```
packages/marca/tokens.css   colores, tipografía, ritmo · NO se copia
packages/marca/base.css     reset y primitivas comunes
apps/<x>/src/estilos/app.css   capa Extendida: lo propio de esa superficie
```

**Regla:** ningún color ni tamaño se escribe a mano en una app. Si hace
falta uno nuevo, se agrega acá y queda disponible para todas.

Antes de esto, `tokens.css` estaba copiado en tres apps. La tercera vez
que hubo que cambiar un color, una quedó distinta y nadie se dio cuenta
hasta ver las capturas.

## Por qué Core + Extendida y no todo compartido

Las cuatro superficies no son la misma pantalla:

| Superficie | Fondo | Por qué |
|---|---|---|
| Control Center | oscuro | Uso prolongado en escritorio |
| Gerencia | oscuro | Igual |
| Terreno | **claro** | Se usa con sol de frente, en la calle |
| Catálogo | **claro** | Lo ve un cliente que no conoce la marca; tiene que parecer un catálogo, no un sistema |

Comparten marca, tipografía, ritmo y semántica de color. No comparten
superficie. Forzar una sola haría peor a dos de las cuatro.
