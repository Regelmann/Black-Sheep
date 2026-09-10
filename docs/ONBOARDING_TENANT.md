# Alta de una empresa nueva

Sin tocar código. Ese es el punto: es lo que hace vendible el producto.

## 1 · Crear el tenant

```sql
INSERT INTO platform.tenants (slug, nombre, color, config)
VALUES ('mi-empresa', 'Mi Empresa', '#c2410c',
        '{"fuente_costo":"ventas","dias_ciclo_default":30}'::jsonb)
RETURNING id;
```

## 2 · Declarar qué cuenta como venta

Este paso **no se salta**. Sin él la empresa no tiene ventas y el
diagnóstico lo marca como FALLA.

```sql
INSERT INTO core.tipo_documento (tenant_id, codigo, descripcion, cuenta_como_venta, signo) VALUES
 ('<tenant>','FA','Factura',       true,  1),
 ('<tenant>','BE','Boleta',        true,  1),
 ('<tenant>','NC','Nota crédito',  true, -1),
 ('<tenant>','GD','Guía despacho', false, 1);

INSERT INTO core.estado_excluido (tenant_id, estado) VALUES
 ('<tenant>','ANULADO'), ('<tenant>','NULO');
```

Cómo se saca la lista: abrir el archivo de ventas y mirar los valores
distintos de la columna de tipo de documento. Uno por uno se decide si
suma, resta o no cuenta. Es media hora y evita el error que en la 15.3
costó el 97,4% de la venta.

## 3 · Zonas y comunas

```sql
INSERT INTO core.zona (tenant_id, id, nombre) VALUES ('<tenant>','NORTE','Zona Norte');
INSERT INTO core.zona_comuna (tenant_id, comuna, zona_id) VALUES ('<tenant>','VITACURA','NORTE');
```

## 4 · Usuarios

Supabase → Authentication → Add user. Después:

```sql
INSERT INTO platform.usuarios (id, email, nombre) VALUES ('<auth uid>','x@empresa.cl','Nombre');
INSERT INTO platform.membresias (usuario_id, tenant_id, rol) VALUES ('<auth uid>','<tenant>','ejecutivo');
```

El `tenant_id` debe quedar además en `app_metadata` del usuario en
Supabase Auth: es de ahí de donde lo lee la RLS.

## 5 · Los 4 archivos

| Archivo | Define | Mínimo |
|---|---|---|
| precios | qué se vende | sku, nombre, precio |
| stock | si hay | sku, stock_total |
| maestra | de quién es | cliente_key, ejecutivo, zona |
| ventas | qué compró | cliente_key, fecha, sku, monto, cantidad, tipo_doc |

**14 columnas.** Todo lo demás mejora la experiencia y no bloquea.
Detalle completo en `contracts/archivos.v3.json`.

La primera carga tiene que traer el **histórico completo**. Si se sube
sólo el día, todos los clientes salen como nuevos y sin promedio. De ahí
en adelante subir sólo el día funciona: se suma, no reemplaza.

## 6 · Verificar

```sql
select * from compliance.diagnostico();
select * from api.integridad;
```

El segundo lista lo que hay que corregir en los archivos: clientes sin
ubicación, SKU con stock y sin precio, zonas contradictorias, ventas de
clientes que no están en la maestra.
