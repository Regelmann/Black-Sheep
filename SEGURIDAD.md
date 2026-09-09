# Seguridad · RLS

**Versión:** `v-BS-PLATFORM-V15.4` · revisado 2026-09-08

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

**Canónico desde V15: el directorio `sql/security/`** (ver su `README.md`):

| Archivo | Qué resuelve |
|---|---|
| `50_FUNDACION_MULTITENANT.sql` | `tenant_id` en cada tabla, con default `'keyfoods'` |
| `51_MULTITENANT_RBAC.sql` | Membresías, roles y claims de token |
| `52_RLS_POLICIES.sql` | Aislamiento por tenant + ownership |
| `53_STORAGE_RLS.sql` | Storage privado por tenant |
| `54_CERRAR_POLITICAS_ABIERTAS.sql` | Borra las `using(true)` históricas que 52 no sustituye |
| `99_SECURITY_DIAGNOSTICS.sql` | Diagnóstico antes/después |

**Funciones de identidad `STABLE`** — `current_tenant_id()`, `current_user_role()`,
`is_role()`, `is_tenant_admin()` (todas en `51`), y el `custom_access_token_hook()`
que inyecta tenant y rol en el JWT.

`STABLE` importa: se evalúan **una vez por consulta**, no por fila. Sin eso,
una política con subconsulta se ejecuta 3.000 veces en una cartera de 3.000
filas y la app se arrastra.

**`tenant_id` con valor por defecto `'keyfoods'`** — todo lo existente queda
asignado. Nada se rompe hoy, y multi-tenant ya está preparado.

**La trampa del OR (por qué existe el `54`).** En Postgres, las políticas RLS
del mismo comando (SELECT/UPDATE/…) se combinan con **OR**. Las políticas
nuevas de `52` se llamaban distinto que las viejas `using(true)` de 08/13/14/15/17/19/20,
así que `CREATE POLICY` no las reemplazaba: convivían. Y como
`true OR (cualquier cosa)` es `true`, **la política nueva no protegía nada**.
Cerrar sin borrar las viejas es no cerrar. El `54` hace `DROP POLICY IF EXISTS`
de cada una antes de crear la política estricta.

## 🔴 Antes de aplicarlo en producción

1. Correr `sql/00_VERIFICAR_ESTADO.sql` — no modifica nada, dice qué falta.
2. Correr el bloque 1 de `99_SECURITY_DIAGNOSTICS.sql` para fotografiar el estado actual.
3. El chequeo crítico que `28_RLS_ESTRICTO.sql` formalizó sigue vigente:

> Si un usuario autenticado NO tiene fila en `ejecutivos`, al aplicar el RLS
> queda **bloqueado**: no ve nada y no puede trabajar.

**Si ese chequeo devuelve filas, crear las filas de `ejecutivos` faltantes
antes de seguir.**

Los archivos se aplican en orden numérico (`50 → 54`); todos usan
`IF EXISTS` / `IF NOT EXISTS`, así que son seguros de re-correr.

## Doble chequeo

Cinco verificaciones, no una:

1. ¿Queda alguna política abierta? → bloque 2 de `99` debe dar **cero filas**
2. ¿Alguna tabla sensible con RLS apagado? → bloque 3 de `99`
3. **Aislamiento real** — simula un ejecutivo no-admin y compara qué ve; luego
   lo mismo cruzando tenants: JWT del tenant A leyendo el tenant B → debe fallar
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

Los avisos sobre los SQL históricos (08/13/14/15/17/19/20/42) son **esperados**:
esos archivos ya no son la fuente — el canónico es `sql/security/`, y el `54`
es el que borra esas políticas de la base. Lo que cuenta es el diagnóstico `99`
corrido contra la base real, no contra el repo.

## Pendiente

- **Aplicar `50–54` en producción** y verificar con `99` (bloque 2 vacío)
- **Test cross-tenant real** con JWT de dos tenants
- **Rotar la service key** si alguna vez estuvo en un archivo versionado
- **Auditoría de accesos**: hoy no hay registro de quién leyó qué
- **Expiración de tokens de catálogo**: no caducan nunca
