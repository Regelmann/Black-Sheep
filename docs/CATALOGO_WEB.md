# Catálogo web del cliente — al 100%

## Precio (orden fijo)

1. **Negociado** — `oferta_cliente_items.precio_cliente` (lo que armó el ejecutivo)
2. **Histórico** — última venta del cliente en `ventas_lineas` (precio unitario = neto/cantidad)
3. **Lista** — `stock.precio_unidad` / caja / kilo (viene del Excel lista de precios vía ciclo)
4. **Consultar** — precio 0 → el cliente ve “Consultar” y el ejecutivo cierra en la visita

Badge en la web: Negociado | Tu precio | Lista | Consultar.

## Fotos, reseña, ficha técnica

El ciclo lee `PRODUCTOS_MEDIA.xlsx` (o columnas en lista de precios) y publica en `stock`:

| Columna | Uso |
|---------|-----|
| imagen_url | Foto 1:1 en card y modal |
| resena | Texto corto bajo el nombre |
| ficha_url | Botón “Ficha técnica PDF” |

Plantilla: `docs/PRODUCTOS_MEDIA_TEMPLATE.csv`

### Links Drive que se ven en la web

Foto compartida pública →  
`https://drive.google.com/uc?export=view&id=FILE_ID`

PDF ficha →  
`https://drive.google.com/file/d/FILE_ID/view`

También podés pegar URLs de keyfoods.cl (clic derecho → copiar imagen).

## SQL a correr (una vez)

```
sql/10b_STOCK_MEDIA_COLS.sql
sql/10_CATALOGO_WEB_V24.sql
```

## Ciclo

1. Completar PRODUCTOS_MEDIA para SKUs prioritarios  
2. Correr `scripts/KEYFOODS_CICLO_UNICO.py` (publica precios lista + media en stock)  
3. Verificar:

```sql
select count(*) filtro, count(precio_unidad) filter (where precio_unidad > 0) con_precio,
       count(imagen_url) filter (where imagen_url is not null) con_foto
from stock;

-- catálogo de un token
select jsonb_array_length(items) n
from get_public_catalogo('TOKEN_AQUI') c,
lateral (select c->'items' as items) x;
```

## App

`CatalogoCliente.jsx` muestra:
- Foto (placeholder de marca si falta)
- Reseña corta
- Precio + lista tachada si hay ahorro
- Badge origen
- Modal con ficha técnica PDF + agregar al pedido
