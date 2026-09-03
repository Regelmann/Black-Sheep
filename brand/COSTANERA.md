# Costanera Center — el modelo 3D

`costanera-center.skp` es el modelo de SketchUp que subiste. Se guarda en
el repo como **referencia de forma**, no como fuente del render.

## Por qué no se usa directo

El `.skp` es un formato **binario propietario de Trimble**. Leer su
geometría requiere el SDK oficial de SketchUp, que no corre en el
navegador y no tiene equivalente de código abierto confiable.

Lo que sí sirvió: la miniatura embebida confirmó el perfil de la torre —
planta cuadrada que **se afina hacia arriba** sobre un podio ancho. Eso es
lo que la hace reconocible, y es exactamente lo que modela
`Costanera3D.tsx` con `CylinderGeometry(2.5, 3.6, 46, 4)`.

## Si más adelante se quiere la geometría real

Desde SketchUp: **Archivo → Exportar → Modelo 3D → glTF (.glb)**. Ese
formato sí lo carga three.js con `GLTFLoader`, y reemplazaría la torre
procedural sin tocar el resto de la escena.

**Advertencia de peso:** un `.glb` con la geometría completa puede pesar
varios MB. La torre procedural actual pesa **0 KB** — se genera en el
navegador. Para una landing, eso importa más que el detalle.
