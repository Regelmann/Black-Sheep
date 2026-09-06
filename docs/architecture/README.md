# Arquitectura Black Sheep

Este directorio es la referencia arquitectónica de V15+.

1. `ARQUITECTURA_V15.md` — modelo completo.
2. `DECISIONES.md` — decisiones que no deben revertirse sin ADR nuevo.
3. `FLUJOS.md` — flujos canónicos.
4. `ESTRUCTURA_REPO.md` — organización del código.
5. `../CONTRATO_DATOS.md` — contrato real de las fuentes de datos.

## Seguridad

La secuencia de migraciones nuevas es:

```text
50_FUNDACION_MULTITENANT.sql
        ↓
51_MULTITENANT_RBAC.sql
        ↓
52_RLS_POLICIES.sql
        ↓
99_SECURITY_DIAGNOSTICS.sql
```

`99` debe ejecutarse antes y después del cambio para documentar el estado.
