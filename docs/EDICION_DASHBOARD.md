# Editar desde el dashboard

Después de la carga inicial, el cliente corrige sus datos sin volver a
subir archivos. Es una ventaja comercial concreta: sube una vez y
administra desde la pantalla.

---

## El problema que había que resolver primero

"La maestra manda" es correcto para lo que viene del archivo. Pero si
gerencia mueve un cliente de zona el lunes y el martes vuelve a subir la
maestra, el archivo lo pisa y el trabajo se pierde. Sin resolver eso,
"corrige desde el dashboard" es una promesa que se rompe sola en la
siguiente carga.

**Solución: procedencia por campo.**

Cada fila recuerda **qué campos** se editaron a mano (`campos_manuales`)
y **de dónde salió** (`origen`). La carga siguiente:

1. **Respeta** los campos marcados como manuales.
2. **Registra el desacuerdo** en `ingest.conflicto`.
3. **Muestra** el conflicto en el dashboard para que alguien decida.

No se pierde el cambio y no se esconde que el archivo dice otra cosa.
Resolver en silencio a favor de cualquiera de los dos es como se pierde
la confianza en el sistema.

Probado en D2: el cliente movido a ZONA SUR sigue en ZONA SUR después de
que la maestra volviera a decir NOR-ORIENTE, y el conflicto aparece
listado con los dos valores.

## Cerrar un conflicto

`api.resolver_conflicto(id, 'mantener_manual' | 'aceptar_archivo')`

- **mantener_manual**: el campo sigue protegido. El conflicto se archiva.
- **aceptar_archivo**: se libera la marca manual y se aplica el valor
  del archivo. De ahí en adelante ese campo vuelve a salir del ERP.

También existe `api.liberar_campo(objeto, llave, campo)` para soltar un
campo sin esperar a que aparezca un conflicto.

---

## Qué se edita y qué no

| Objeto | Se edita | Protegido del archivo | Por qué |
|---|---|---|---|
| Cliente | sí | **sí** | Zona, ejecutivo y bloqueo son decisiones comerciales, no dato del ERP |
| Prospecto | sí | **sí** (no vive en el archivo) | Lo levanta el vendedor en terreno |
| Producto | sí | **sí** | Nombre, categoría, marca, foto se curan a mano |
| Precio | sí | historizado | El precio de hoy se agrega; el de ayer queda |
| Costo | sí | historizado | Igual que precio |
| Stock | sí | **no** | La existencia real la sabe la bodega, no el dashboard |
| **Ventas** | **NO** | — | Ver abajo |

### Por qué el stock no se protege

Editarlo a mano sirve para corregir hoy; mañana el archivo manda de
nuevo. Es a propósito: si el stock manual quedara protegido, un ajuste
puntual congelaría ese SKU para siempre y nadie se acordaría de por qué
marca 40 unidades cuando la bodega tiene 400.

### Por qué la venta no se edita nunca

Un ajuste manual de venta es un descuadre contable que después nadie
puede explicar. Las ventas entran sólo por archivo, con reconciliación
contra el total oficial. Además es lo correcto en lo práctico: nadie va
a cargar trescientas líneas de factura a mano, y por eso el archivo es
el camino cómodo y el único.

Si una venta está mal, se corrige en el origen y se vuelve a cargar. El
ciclo es idempotente, así que recargar es seguro.

---

## Las funciones

### Clientes y prospectos

```
api.guardar_cliente(cliente_key, nombre, zona, ejecutivo, comuna,
                    direccion, lat, lng, rubro, bloqueado, persona_natural)
api.guardar_prospecto(cliente_key, nombre, ejecutivo, zona, comuna,
                      direccion, rubro, lat, lng)
api.convertir_prospecto(cliente_key)
api.reasignar_cliente(cliente_key, zona, ejecutivo)
```

Un campo en `NULL` significa "no lo toques", no "bórralo". Sólo se marca
como manual lo que efectivamente se mandó.

**El prospecto vive en `core.cliente`**, con `es_prospecto = true`. El
día que compra y aparece en el archivo de ventas, deja de ser prospecto
sin migrar de tabla. Y como su `origen` no es `archivo`, la maestra no
lo desactiva por ausencia: probado en D5.

### Productos, precios, costos y stock

```
api.guardar_producto(sku, nombre, categoria, marca, unidad_venta,
                     unidades_caja, kg_unidad, imagen_url, activo)
api.guardar_precio(sku, precio_unidad, precio_caja, precio_kilo,
                   vigente_desde, lista)
api.guardar_costo(sku, costo, vigente_desde)
api.guardar_stock(sku, stock_total, almacen, stock_cajas, fecha_venc)
```

`guardar_precio` exige que el producto exista y rechaza con
`producto_inexistente`. Un precio suelto sin producto es un SKU
fantasma que después aparece en el catálogo sin nombre.

**Precio y fecha:** mismo día corrige el precio de hoy; otra fecha deja
el histórico. Cambiar el precio hoy no puede alterar lo que se cobró el
mes pasado.

### Permisos

| Rol | Editar clientes, productos, precios | Crear prospectos | Ver y editar costos |
|---|---|---|---|
| `tenant_admin` | sí | sí | sí |
| `gerencia` | sí | sí | sí |
| `ejecutivo` | **no** | **sí** | no |
| `solo_lectura` | no | no | no |

El ejecutivo puede levantar un prospecto en la calle, que es su trabajo,
y no puede tocar un precio, que no lo es. Verificado en D9.

---

## Lo que el dashboard tiene que mostrar

- **Un indicador de campo manual** en cada dato editado, con quién y
  cuándo. Un valor que no coincide con el ERP y no avisa por qué es un
  misterio para el próximo que lo mire.
- **La bandeja de conflictos** (`api.conflictos`), con los dos valores
  lado a lado y los dos botones.
- **La advertencia al editar**: "este campo dejará de actualizarse desde
  el archivo hasta que lo liberes".
