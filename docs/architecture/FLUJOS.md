# Flujos canónicos Black Sheep

## Login y tenant

```text
auth.signIn
  ↓
JWT
  ↓
tenant_id + rol
  ↓
loadTenantContext()
  ↓
RLS
```

## Vendedor

```text
Hoy
 ├── cartera
 ├── riesgo
 ├── meta
 └── acción recomendada
      ↓
Cliente
      ↓
Visita / check-in
      ↓
Pedido / nota
      ↓
outbox
      ↓
sync
```

## Gerencia

```text
Dashboard
 ├── ventas
 ├── metas
 ├── zonas
 ├── vendedores
 ├── riesgos
 └── data health
```

## Carga de datos

```text
Storage
 ↓
registro de carga
 ↓
staging
 ↓
validación
 ↓
preview
 ↓
publicar
 ↓
reporting
```

## Regla de ventas

```text
Estado_Pedido != Cerrado → no cuenta como venta
FACTURA Cerrada → suma
NC Cerrada → resta
venta_neta_real = factura - NC
```
