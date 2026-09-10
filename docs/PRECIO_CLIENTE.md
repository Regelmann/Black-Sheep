# Qué paga cada cliente

La lista de precios dice cuánto vale un producto. El histórico dice
cuánto le cobras **tú** a **ese** cliente. En foodservice casi ningún
cliente grande paga lista.

Si el SKU1 está en $1.000 y a este cliente se lo vendes a $800, su
catálogo tiene que decir $800. Mandarle $1.000 es una llamada de reclamo
o, peor, una venta perdida.

## Orden de precedencia

```
1 · ACORDADO   core.precio_cliente · lo fijó gerencia, con motivo y vigencia
2 · HISTÓRICO  el ÚLTIMO precio realmente cobrado a ese cliente
3 · LISTA      core.precio · lo que vale para todos
```

Todo pasa por **una sola función**: `core.precio_para_cliente()`. La usan
el catálogo público, el pedido del vendedor y el pedido del cliente. Si
el cálculo estuviera duplicado, el catálogo diría $800 y el pedido
cobraría $1.000.

## El último precio, no el promedio

Un promedio de seis meses arrastra el precio viejo y esconde una subida
reciente. Se toma la última venta con monto positivo y cantidad mayor a
cero. Las notas de crédito se excluyen: tienen monto negativo y dividir
por la cantidad daría un precio negativo.

## La banda de cordura

Un precio histórico fuera del **40%–160%** de la lista casi siempre es un
dato malo, no una negociación:

- una unidad de medida distinta (se vendió por caja, la lista es por kilo)
- un combo cargado como una sola línea
- una liquidación puntual

Aplicarlo al catálogo sería propagar el error al cliente. En ese caso se
cae a lista, y el caso aparece en `api.integridad` como
`PRECIO_HISTORICO_FUERA_DE_BANDA` con los dos números, para corregirlo
en el origen.

Verificado: una línea de $50 la unidad contra una lista de $2.500 no
llega al catálogo y sí llega al panel de integridad.

## Fijar y quitar un acuerdo

```sql
api.guardar_precio_cliente(cliente, sku, precio, motivo, vigente_hasta)
api.quitar_precio_cliente(cliente, sku)
```

`guardar` devuelve cuánto queda bajo lista, y avisa si el precio queda
**bajo el costo**. No lo bloquea: a veces es una decisión comercial y a
veces es un cero de más; lo que no puede es pasar desapercibido.

`quitar` **cierra la vigencia, no borra**. Hay que poder explicar qué
precio estuvo vigente cuando se emitió una factura de marzo.

## Lo que ve cada uno

| Quién | Qué ve |
|---|---|
| Cliente en su catálogo | Su precio, sin más |
| Vendedor al tomar pedido | Su precio, el de lista y el descuento |
| Gerencia | Los tres, más el origen y el margen |

`api.precios_cliente(cliente_key)` devuelve las tres cifras juntas.
Mostrar sólo el precio final hace que un valor distinto al de la lista
parezca un error del sistema.
