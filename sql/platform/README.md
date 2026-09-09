# sql/platform — schema `platform` (Control Center, billing)

Este schema vive en Supabase pero **nunca tuvo migraciones en el repo**
hasta este archivo — se creó y se fue editando directo en el dashboard.
Todo lo que hay acá es reconstrucción a partir de lo que existe hoy en
producción, no la fuente original.

## Estado actual (relevado, no diseñado por nosotros)

Conviven dos familias de tablas para lo mismo:

- **En uso real** (la consulta el Control Center y los webhooks de
  Stripe/Mercado Pago): `tenants`, `suscripciones`, `platform_admins`,
  `audit_log`.
- **Sin conectar a ningún código que hayamos encontrado**: `usuarios`,
  `membresias`, `suscripcion`, `auditoria`, `capacidad`, `rol_permiso`,
  `tenant_capacidad`. Es un modelo de roles/permisos más completo
  (`es_superadmin()`, `puede()`, `tenant_actual()`), pero no se
  confirmó que nada lo use — no se tocó ni se borró.

## 01_FIX_TENANTS_INSERT_Y_ADMIN.sql

Corrige dos problemas de la familia "en uso real":
1. `tenants` no tenía política de INSERT → crear tenant fallaba siempre.
2. `audit_log`, `suscripciones` y `platform_admins` dependían de un
   email hardcodeado (`sregelmann@gmail.com`) en vez de la tabla
   `platform_admins` — reemplazado por la función
   `platform.es_platform_admin()`.

## Pendiente (no se hizo, requiere una decisión primero)

- **Decidir qué familia de tablas queda viva.** Si la de roles
  (`usuarios`/`membresias`/...) no la usa nada, lo prolijo es
  documentarla como deprecated o borrarla — pero borrar tablas es
  irreversible, así que eso lo define el equipo, no una migración
  automática.
- **Capturar el schema real como fuente de verdad.** Este archivo NO
  reemplaza eso. Lo correcto es correr, una sola vez, desde una
  máquina con acceso directo a la base:

  ```bash
  pg_dump --schema-only --schema=platform \
    "$DATABASE_URL" > sql/platform/00_ESQUEMA_ACTUAL.sql
  ```

  y commitear ese archivo tal cual sale, sin editarlo a mano. Eso sí
  es la fuente real (tipos exactos, defaults, foreign keys, checks) —
  lo que se puede inferir desde `information_schema.columns` (como
  hicimos en el diagnóstico) es siempre incompleto.
