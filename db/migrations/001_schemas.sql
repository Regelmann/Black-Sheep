-- ═══════════════════════════════════════════════════════════════════
-- 001 · ESQUEMAS
--
-- D-03 · Superficie pública mínima.
-- PostgREST expone SOLO el esquema `api`. Una tabla nueva en core,
-- platform, ingest o compliance NO queda publicada por accidente.
--
-- En Supabase hay que declararlo además en:
--   Settings → API → Exposed schemas → `api`
-- Quitar `public` de esa lista es parte del despliegue.
-- ═══════════════════════════════════════════════════════════════════
CREATE SCHEMA IF NOT EXISTS platform;    -- control plane
CREATE SCHEMA IF NOT EXISTS core;        -- datos de negocio del tenant
CREATE SCHEMA IF NOT EXISTS ingest;      -- evidencia y linaje
CREATE SCHEMA IF NOT EXISTS compliance;  -- privacidad y seguridad
CREATE SCHEMA IF NOT EXISTS api;         -- ÚNICA superficie expuesta

COMMENT ON SCHEMA platform   IS 'Control plane: tenants, usuarios, roles, auditoría. No expuesto.';
COMMENT ON SCHEMA core       IS 'Datos de negocio por tenant. No expuesto: se lee vía api.';
COMMENT ON SCHEMA ingest     IS 'Archivos, lotes, filas crudas y linaje. No expuesto.';
COMMENT ON SCHEMA compliance IS 'Privacidad, incidentes, retención. No expuesto.';
COMMENT ON SCHEMA api        IS 'Vistas y funciones que consume la app. Único esquema expuesto.';

-- Fail-closed: nadie tiene nada hasta que 013_grants lo otorgue.
REVOKE ALL ON SCHEMA platform, core, ingest, compliance, api FROM PUBLIC;
