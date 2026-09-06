# Decisiones arquitectónicas

## ADR-001 — Base compartida + tenant_id

**Decisión:** todos los clientes conviven en la misma base con `tenant_id` y RLS.

**Motivo:** una migración se ejecuta una sola vez; evita mantener N schemas o N versiones del producto.

## ADR-002 — JWT para contexto de tenant

**Decisión:** el JWT lleva el tenant activo y el rol; la membresía real permanece en `tenant_members`.

**Motivo:** las políticas pueden comparar contra un valor constante y evitar joins/subconsultas por fila.

**Regla de seguridad:** ausencia de claim/membresía válida = acceso denegado. No hay fallback a `keyfoods` en la arquitectura final.

## ADR-003 — RLS fail-closed

Toda tabla sensible debe tener RLS habilitado. Las políticas deben cubrir `SELECT`, `INSERT`, `UPDATE` y `DELETE` según corresponda.

## ADR-004 — Service role sólo para procesos confiables

ETL y jobs de backend pueden usar service role. La clave nunca entra al frontend ni al repositorio público.

## ADR-005 — Zonas son datos

Las zonas no se codifican en React. Son configuración por tenant y pueden ser norte/sur/este/oeste u otra estructura.

## ADR-006 — Reporting canónico

El dashboard consume vistas/RPC. La UI no replica reglas de negocio de ventas, metas o riesgo.

## ADR-007 — Idempotencia

Las escrituras offline llevan `client_op_id` y una restricción única. Un reintento que llega después de una respuesta perdida no duplica datos.

## ADR-008 — Ingesta con staging

Los archivos no escriben directamente en tablas productivas. Se validan, normalizan y deduplican antes de publicar.
