# Seguridad canónica V15+

Orden:

1. `../50_FUNDACION_MULTITENANT.sql` — compatibilidad y primer cimiento.
2. `51_MULTITENANT_RBAC.sql` — membresías, roles y claims.
3. `52_RLS_POLICIES.sql` — aislamiento y ownership.
4. `53_STORAGE_RLS.sql` — Storage privado por tenant.
5. `99_SECURITY_DIAGNOSTICS.sql` — diagnóstico antes/después.

## Importante

Estos archivos definen la **arquitectura objetivo**. Antes de aplicarlos sobre producción hay que ejecutar el diagnóstico y revisar las tablas existentes, claves primarias y políticas históricas. No se deben borrar datos ni convertir IDs en producción automáticamente.
