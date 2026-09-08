# Seguridad canónica V15+

Orden:

1. `../50_FUNDACION_MULTITENANT.sql` — compatibilidad y primer cimiento.
2. `51_MULTITENANT_RBAC.sql` — membresías, roles y claims.
3. `52_RLS_POLICIES.sql` — aislamiento y ownership.
4. `53_STORAGE_RLS.sql` — Storage privado por tenant.
5. `54_CERRAR_POLITICAS_ABIERTAS.sql` — borra las políticas `using(true)`
   que quedaron con otro nombre en 08/13/14/15/17/19/20 y que 52 no
   sustituye (Postgres combina políticas del mismo comando con OR: la
   vieja abierta anula a la nueva aunque exista). También agrega
   `tenant_id` a `decision_feedback`, que no estaba en ningún array.
6. `99_SECURITY_DIAGNOSTICS.sql` — diagnóstico antes/después. El bloque
   2 (políticas `using(true)`) debe volver vacío después de correr 54.

## Importante

Estos archivos definen la **arquitectura objetivo**. Antes de aplicarlos sobre producción hay que ejecutar el diagnóstico y revisar las tablas existentes, claves primarias y políticas históricas. No se deben borrar datos ni convertir IDs en producción automáticamente.
