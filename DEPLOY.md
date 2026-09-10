# Despliegue · App 2.0

**Proyecto Supabase nuevo.** No se toca el de la 15.3 (decisión A).

## 1 · Antes de correr nada

- [ ] Proyecto Supabase creado, región cercana
- [ ] Anotado el `service_role` **fuera** del repositorio
- [ ] Backup del proyecto viejo (aunque no se toque)

## 2 · Migraciones, en orden

SQL Editor → pegar cada archivo → RUN. En orden numérico, sin saltos.
No correr `db/test/00_shim_supabase.sql`: en Supabase los roles ya existen.

| # | Archivo | Qué deja |
|---|---|---|
| 000 | extensions | pgcrypto, pg_trgm |
| 001 | schemas | los 5 esquemas, cerrados |
| 002 | platform_tenants | tenants + contexto de sesión |
| 003 | platform_rbac | usuarios, membresías, permisos |
| 004 | core_reference | zonas, comunas, ejecutivos, tipos de documento |
| 005 | core_clientes | clientes + contactos (dato personal aparte) |
| 006 | core_productos | productos, precios, costos, stock |
| 007 | core_ventas | venta_linea + reglas de elegibilidad y signo |
| 008 | core_field_ops | visitas, check-ins, notas, pedidos |
| 009 | core_catalogo | ofertas y tokens hasheados |
| 010 | ingest_plane | archivos, lotes, filas crudas, exclusiones |
| 011 | read_models | las vistas que consumen las pantallas |
| 012 | rls_foundation | RLS fail-closed en todo |
| 013 | grants | permisos explícitos |
| 014 | api_publica | catálogo y pedido sin sesión |
| 015 | audit | bitácora inmutable |
| 016 | privacy_compliance | privacidad (Ley 21.719) |
| 017 | security_baseline | controles declarados |
| 018 | retencion | políticas y anonimización |
| 019 | diagnostics | los chequeos |
| 020 | suscripciones | el corte por impago, dentro de la RLS |
| 021 | capacidades | qué mide cada empresa |
| 022 | consolas | dashboard de gerencia + consola de plataforma |
| 023 | ingest_mapeo | traducción de nombres de columna |
| 024 | ingest_ciclo | el ciclo por empresa, con candado |
| 025 | ingest_publicacion | compuerta, respaldo y reversión |
| 026 | dashboard_edicion | edición manual, prospectos y conflictos |
| 027 | identidad | hook de token, superadmin, invitar usuarios |
| 028 | api_terreno | visitas, check-in, notas y pedidos del vendedor |
| 029 | control_center | consola de plataforma: resumen, fichas, usuarios, documentos |
| 030 | ciclo_vida | estados del tenant, baja y archivo sin borrar datos |

## 3 · Configuración de Supabase

**Settings → API → Exposed schemas:** dejar **sólo** `api`.
Quitar `public`. Si `public` queda expuesto, el aislamiento se debilita.

**Authentication → Hooks → Custom Access Token:**
`platform.custom_access_token_hook`. Sin esto ningún token trae
`tenant_id`, la RLS niega todo y la app se ve vacía.

**Sembrar el primer superadmin**, una sola vez:

```sql
INSERT INTO platform.superadmin (usuario_id, email)
SELECT id, email FROM auth.users WHERE email = 'tu@correo.cl';
```

Sin esa fila no puedes ni dar de alta una empresa.

## 4 · Verificación · no es opcional

```sql
select * from compliance.diagnostico();
```

Los ocho controles deben decir OK. Si alguno dice FALLA, **no se
promueve**. Cada uno indica exactamente qué objeto lo rompe.

## 5 · Alta de una empresa

Ver `docs/ONBOARDING_TENANT.md`.

## 6 · Rollback

Ninguna migración borra datos. Si algo sale mal:

1. Ninguna corre `DROP TABLE`: los datos siguen ahí
2. Las 20 son idempotentes: se pueden volver a correr
3. Un lote mal publicado se revierte por `lote_id`, no borrando la tabla

**Nunca** se arregla una cifra borrando datos. Se bloquea la publicación,
se diagnostica, se corrige el origen y se vuelve a correr.
