# Seguridad · RLS

**Versión:** `v-BS-PLATFORM-V13.0.2`

## El problema

La auditoría encontró **13 políticas `USING (true)`** en el repo:

```
cartera · stock · metas · focos · ejecutivos · prospectos
gerencia_clientes · zonas_comunas · pedidos · visitas
```

`USING (true)` significa: **cualquier usuario autenticado ve TODO.**

Hoy no duele porque hay un solo cliente. El día que entre el segundo tenant,
el ejecutivo de la empresa A ve la cartera completa de la empresa B —
clientes, precios, márgenes, metas.

Eso no es un bug de calidad. Es un incidente, y en Chile cae bajo la
**Ley 19.628** de protección de datos personales.

Y hay un segundo problema, que existe **hoy** con un solo tenant: un
ejecutivo ve la cartera y las metas de sus pares.

## El modelo

| Rol | Ve |
|---|---|
| ejecutivo | Sólo su cartera, sus metas, sus focos, sus visitas |
| gerente / admin | Todo su tenant |
| superadmin | Todo su tenant |
| anon | Sólo catálogos publicados, por token |

Base: `ejecutivos.id = auth.uid()` (verificado en `App.jsx`).

## Cómo está implementado

**Funciones de identidad `STABLE`** — `mi_ejecutivo_id()`, `mi_rol()`,
`soy_admin()`, `mi_tenant()`.

`STABLE` importa: se evalúan **una vez por consulta**, no por fila. Sin eso,
una política con subconsulta se ejecuta 3.000 veces en una cartera de 3.000
filas y la app se arrastra.

**`tenant_id` con valor por defecto `'keyfoods'`** — todo lo existente queda
asignado. Nada se rompe hoy, y multi-tenant ya está preparado.

**`mi_tenant()` devuelve NULL si la columna no existe** y las políticas se
comportan como mono-tenant. Compatible hacia atrás.

## 🔴 Antes de aplicarlo

`28_RLS_ESTRICTO.sql` empieza con un **pre-vuelo obligatorio**. El riesgo real:

> Si un usuario autenticado NO tiene fila en `ejecutivos`, al aplicar el RLS
> queda **bloqueado**: no ve nada y no puede trabajar.

El pre-vuelo lista esos usuarios y verifica que exista al menos un admin.
**Si devuelve filas, crear las filas faltantes antes de seguir.**

## Doble chequeo

Cinco verificaciones, no una:

1. ¿Queda alguna política abierta? → debe dar **cero filas**
2. ¿Alguna tabla sensible con RLS apagado?
3. **Aislamiento real** — simula un ejecutivo no-admin y compara qué ve
4. ¿El catálogo público sigue funcionando para `anon`?
5. ¿El ETL sigue pudiendo escribir? (busca `FORCE ROW LEVEL SECURITY`)

El punto 5 importa: la service key ignora RLS por diseño, pero
`FORCE ROW LEVEL SECURITY` sí afecta al owner y rompería el ciclo.

## Rollback de emergencia

Si alguien queda sin acceso y hay que restablecer el servicio ya:

```sql
ALTER TABLE public.cartera DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock   DISABLE ROW LEVEL SECURITY;
```

Es un parche: deja los datos expuestos. Arreglar las filas de `ejecutivos` y
reactivar el mismo día.

## Regla R11 en el guard

```
[R11 política abierta]  sql/14_ADMIN_CONTROL.sql:47 — using(true) expone todo el tenant
```

Detecta `using (true)` en cualquier `CREATE POLICY`, exceptuando las de `anon`
(catálogo público) y las tablas de referencia sin datos sensibles.

Encontró las 13 en su primera corrida. Los archivos viejos quedaron anotados
indicando que `28` los reemplaza.

## Estado actual (V13.0.2)

El guard R11 hoy reporta **18 avisos** de políticas `USING(true)` en
`schema`: son las migraciones previas (`08`, `13`, `14`, `15`, `17`, `19`,
`20`) que quedaron anotadas para ser reemplazadas por `28` (y `35` para el
catálogo). No bloquean el guard porque son deuda conocida, pero **son deuda
de seguridad**.

### Orden para cerrarla (en el SQL Editor, sobre la base real)

```sql
-- 0) Diagnóstico (solo lectura)
--     Prestar atención al bloque 11: usuarios auth sin perfil en ejecutivos
--     quedarían bloqueados por el RLS estricto.
sql/00_VERIFICAR_ESTADO.sql

-- 1) Backup (plan free no lo hace automático)
--     Database → Backups → Create backup

-- 2) En este orden (idempotentes; esperar a que cada uno termine)
01 a 27 · si es una base ya trabajada, correr la lista de DEPLOY.md.
28_RLS_ESTRICTO.sql      ← políticas por ejecutivo/tenant + funciones de identidad
35_RLS_CATALOGO.sql      ← cierra ofertas_cliente / oferta_cliente_items
36_CARTERA_INSERT_ADMIN.sql ← permite alta de clientes desde Admin (depende de 28)
37_PUSH_SUSCRIPCIONES.sql ← suscripciones push (si no está)

-- 3) Doble chequeo
sql/00_VERIFICAR_ESTADO.sql  → bloques 6, 7, 10 y 11 en verde.
--    Bloque 7 sólo debe listar zonas_comunas (tabla de referencia).
```

### Callback de emergencia

Si alguien queda sin acceso:

```sql
ALTER TABLE public.cartera DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock   DISABLE ROW LEVEL SECURITY;
```

Es un parche (deja los datos expuestos): arreglar las filas de `ejecutivos`
y reactivar el mismo día.

## Pendiente

- **Aplicar 28 + 35** en la base real: es el pendiente número uno antes de
  vender el segundo tenant (bloqueo del guard R11 con 18 avisos).
- **Rotar la service key** si alguna vez estuvo en un archivo versionado
- **Auditoría de accesos**: hoy no hay registro de quién leyó qué
- **Expiración de tokens de catálogo**: no caducan nunca
