# Ventas V13.1 — instalación y verificación

## Orden

1. `sql/44_VENTAS_INTEGRACION_TOTAL.sql` (una vez si faltan tablas).
2. `sql/46_VENTAS_REPORTES_APP.sql` (vistas de la app).
3. `scripts/CICLO_UNICO.py` V1.38.
4. Subir histórico + `Nuevas ventas.xlsx` + maestra + stock + precios.
5. Primera corrida con `KF_SKIP_SUPABASE=1` y `KF_SKIP_PLACES=1`.
6. Revisar conciliación, facturado, NC, venta neta y Fill Rate.
7. Corrida normal.
8. `Más → Ventas`.

## Reportes

- Resumen mensual
- Pedido → Factura → NC
- Pedidos pendientes
- Clientes
- Productos
- Vendedores
- Fill Rate
- Calidad/conciliación

## Contrato de datos

- Pedido no es venta.
- Factura es venta positiva.
- NC es ajuste negativo.
- Venta neta real = Factura − NC.
- Fill Rate = Kg facturados / Kg pedidos.
- No se inventa margen/costo si el archivo nuevo no lo soporta.
