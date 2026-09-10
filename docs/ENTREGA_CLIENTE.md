# Qué le pedimos a una empresa nueva

Documento para el cliente. Se entrega junto con las cinco plantillas de
`plantillas/`.

---

## En una frase

Con **cuatro archivos Excel** levantamos su empresa en Black Sheep. No
hace falta conectar su ERP, ni desarrollo, ni que nadie de su equipo
programe nada.

## Los cuatro archivos

| # | Archivo | Define | Sin él |
|---|---|---|---|
| 1 | **Lista de precios** | Qué se vende | No hay catálogo. Un producto sin precio no se vende aunque haya stock |
| 2 | **Stock** | Si hay | El catálogo funciona, pero no se puede avisar qué falta ni qué empujar |
| 3 | **Maestra de clientes** | De quién es cada cliente | No se puede repartir la cartera. Es el más importante de los cuatro |
| 4 | **Ventas** | Qué compró cada uno | No hay ciclos de reposición, ni mix, ni alertas de fuga |

Y uno opcional:

| 5 | **Costos** | Cuánto deja cada producto | Sin esto no mostramos margen. No mostramos cero: decimos "no disponible" |

## Lo mínimo: 14 columnas

```
Lista de precios   código · descripción · precio (unidad o caja)
Stock              código · stock
Maestra            RUT o código de cliente · ejecutivo · zona o canal
Ventas             cliente · fecha · código de producto · monto neto ·
                   cantidad · tipo de documento
```

Todo lo demás mejora la app y no bloquea nada. Cada plantilla trae una
hoja de instrucciones con columna por columna: verde obligatoria,
amarillo opcional.

## Tres cosas que conviene saber antes

**1 · La maestra manda.**
El ejecutivo y la zona de cada cliente salen de la maestra, no del código
de vendedor de la factura. Ese campo suele traer valores como
`VENDEDOR_07` que no significan nada comercial. Si un cliente está mal
asignado, se corrige en la maestra.

**2 · El tipo de documento no es un detalle.**
Necesitamos distinguir una factura de una nota de crédito. Si no, las
devoluciones suman como venta y el reporte queda inflado. En una base
real esto sobreestimaba los ingresos en un 19%. Al momento de la puesta
en marcha revisamos juntos qué códigos usa su ERP y cuáles cuentan.

**3 · La primera carga tiene que traer el histórico completo.**
Ideal, doce meses; mínimo, tres. La app calcula ciclos de reposición y
promedios comparando con meses anteriores: si sólo sube el día de hoy,
todos sus clientes aparecen como nuevos y sin promedio. Después de esa
primera carga, subir sólo el día funciona perfecto.

## Cómo enviarlos

Excel (`.xlsx`) o CSV. Una fila por registro, sin filas en blanco
intercaladas ni totales al final. Los nombres de las columnas no se
cambian; puede agregar columnas propias al final y las ignoramos.

Los archivos se suben desde el **dashboard de gerencia**, por su propio
equipo, cuando quieran. No hay que mandárselos a nadie por correo.

## Qué NO le pedimos

- Dos archivos de venta, uno de cabecera y otro de líneas: con uno basta
- Un ERP conectado ni una API
- Coordenadas: las obtenemos desde la dirección
- Fotos ni fichas técnicas: se cargan después desde el dashboard
- Metas: se ponen desde el dashboard, no vienen en archivo

## Qué pasa después

1. Cargamos los archivos y **cuadramos la venta contra su total oficial
   del mes**. Si no cuadra, no publicamos: revisamos primero.
2. Le mostramos un informe de calidad: clientes sin comuna, productos con
   stock y sin precio, clientes con venta que no están en la maestra.
   Son cosas que ya existen en sus datos; la app las hace visibles.
3. Damos de alta a sus ejecutivos y quedan operativos ese mismo día.

## Sobre sus datos

- Sus datos son suyos. Están aislados de los de cualquier otra empresa
  por una barrera en la base de datos, no por un filtro en la pantalla.
- Los datos de contacto de personas (nombre, teléfono, correo) se guardan
  aparte y sólo los ve quien tiene permiso.
- Conservamos el archivo original de cada carga como evidencia, para que
  cualquier cifra se pueda rastrear hasta la fila que la produjo.
- Todo esto está diseñado contra la Ley 21.719, que rige plenamente
  desde el 1 de diciembre de 2026.
