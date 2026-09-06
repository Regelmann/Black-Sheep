# Black Sheep — Arquitectura objetivo V15+

**Base:** `v-BS-PLATFORM-V15.0`  
**Modelo:** SaaS multi-tenant con base compartida, `tenant_id` + RLS  
**Regla:** la seguridad vive en PostgreSQL; el frontend nunca es una frontera de seguridad.

## 1. Capas

```text
┌──────────────────────────────────────────────────────────────┐
│ UX / PWA                                                     │
│ Hoy · Clientes · Catálogo · Ventas · Visita · Gerencia      │
└──────────────────────────────┬───────────────────────────────┘
                               │ repos / services
┌──────────────────────────────▼───────────────────────────────┐
│ APPLICATION                                                   │
│ auth · tenant · permissions · sync · decisions · reporting  │
└──────────────────────────────┬───────────────────────────────┘
                               │ Supabase client / RPC
┌──────────────────────────────▼───────────────────────────────┐
│ DATA / SECURITY                                                │
│ PostgreSQL · RLS · constraints · indexes · views · RPC       │
└──────────────────────────────┬───────────────────────────────┘
                               │ ETL / Storage
┌──────────────────────────────▼───────────────────────────────┐
│ INGESTION                                                     │
│ Excel · BigQuery · API · Storage · staging · validation      │
└──────────────────────────────────────────────────────────────┘
```

## 2. Multi-tenant

Una base compartida. Cada entidad de negocio lleva `tenant_id`.

```text
tenants
  │
  ├── tenant_members ── auth.users
  │
  ├── zonas
  ├── ejecutivos
  ├── clientes / cartera
  ├── productos / stock
  ├── pedidos
  ├── ventas_documentos
  ├── ventas_lineas
  ├── metas
  ├── checkins
  └── cargas
```

No se usa un schema por empresa.

## 3. Identidad

```text
Supabase Auth
    ↓
JWT
    ├── sub = user_id
    ├── tenant_id = tenant activo
    └── rol = rol dentro del tenant
         ↓
current_tenant_id()
current_user_role()
         ↓
RLS
```

El claim es una optimización y un contexto firmado. La pertenencia real se mantiene en `tenant_members`.

## 4. Roles

Roles iniciales:

- `owner`
- `admin`
- `gerente`
- `supervisor`
- `vendedor`
- `data_manager`
- `viewer`

La autorización se evalúa en dos dimensiones:

1. **tenant**: nunca se puede cruzar empresa.
2. **rol / ownership**: dentro de la empresa cada rol tiene permisos distintos.

## 5. Dominios

### Maestros

`clientes`, `productos`, `ejecutivos`, `zonas`, `zonas_comunas`.

### Comercial

`cartera`, `stock`, `metas`, `focos`, `ofertas_cliente`.

### Ventas

`ventas_documentos`, `ventas_lineas`, `pedidos`.

Regla canónica de venta: sólo estados `Cerrado` generan venta válida. La NC resta.

### Terreno

`checkins`, notas, encuestas y actividades.

### Ingesta

`cargas` en Storage + tablas de staging/auditoría.

## 6. Reporting

Las pantallas no deben reconstruir KPIs desde tablas crudas. Consumirán vistas/RPC canónicas:

- `v_dashboard_hoy`
- `v_ventas_resumen_mensual`
- `v_ventas_cliente`
- `v_ventas_producto`
- `v_ventas_vendedor`
- `v_ventas_zona`
- `v_metas`
- `v_riesgos`
- `v_data_health`

## 7. Offline-first

```text
UI
 ↓
local state / IndexedDB
 ↓
outbox(client_op_id)
 ↓
syncHandlers
 ↓
Supabase
 ↓
RLS + constraints + idempotencia
```

Una operación offline conserva el mismo `client_op_id` durante todos los reintentos.

## 8. Ingesta

```text
archivo
 ↓
staging
 ↓
validación contrato
 ↓
normalización
 ↓
dedupe
 ↓
reglas de negocio
 ↓
publicación
 ↓
reporting
```

Nunca se publica un lote sin health check.

## 9. Storage

```text
cargas/{tenant_id}/{YYYY-MM-DD}/...
productos/{tenant_id}/...
```

Los buckets sensibles son privados. Las políticas de `storage.objects` también aíslan por tenant.

## 10. Observabilidad

Toda carga y sincronización debe producir:

- filas recibidas
- filas válidas
- filas rechazadas
- duplicados
- publicados
- errores
- duración
- tenant
- usuario / operación

## 11. Regla de evolución

Una funcionalidad nueva debe atravesar estas capas en orden:

```text
schema → security → repository/service → domain → UI → tests → release gate
```

No se agregan consultas directas a Supabase desde una página nueva.

## 12. Release gate

```text
npm run guard
npm run verify
python3 -m py_compile scripts/CICLO_UNICO.py
SQL diagnostics
RLS isolation tests
build
```

Si falla un gate, no se marca la versión como terminada.
