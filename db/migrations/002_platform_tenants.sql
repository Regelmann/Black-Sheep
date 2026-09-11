-- ═══════════════════════════════════════════════════════════════════
-- 002 · TENANTS Y CONTEXTO DE SESIÓN
--
-- D-02 · id UUID + slug legible.
--   El UUID es la llave (no se enumera: un id correlativo filtra
--   cuántos clientes tienes). El slug es para URLs y para leer.
--
-- Acá viven también las funciones de contexto. TODA política RLS
-- las usa. No leen parámetros del cliente: leen el JWT.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform.tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE
                CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  nombre        TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#a3e635'
                CHECK (color ~ '^#[0-9a-fA-F]{6}$'),   -- hex literal, nunca var() (regla 4)
  logo_url      TEXT,
  zona_horaria  TEXT NOT NULL DEFAULT 'America/Santiago',
  moneda        TEXT NOT NULL DEFAULT 'CLP',
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN platform.tenants.config IS
  'Config por empresa. Claves reconocidas:
     fuente_costo      : ventas | lista | ninguno   (D-04)
     dias_ciclo_default: entero
     iva               : numérico
   Nada de esto vive en el código: onboarding sin tocar el build (R5).';

-- ─── Contexto de sesión ────────────────────────────────────────────
-- Lee el JWT. Nunca un parámetro que mande el cliente.

CREATE OR REPLACE FUNCTION platform.jwt()
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION platform.usuario_actual()
RETURNS UUID LANGUAGE sql STABLE SET search_path = pg_catalog, platform AS $$
  SELECT NULLIF(platform.jwt() ->> 'sub', '')::uuid;
$$;

-- El tenant sale de app_metadata (lo escribe el servidor al emitir el
-- token). Si viniera en el cuerpo del token editable por el cliente,
-- todo el aislamiento sería decorativo.
CREATE OR REPLACE FUNCTION platform.tenant_actual()
RETURNS UUID LANGUAGE sql STABLE SET search_path = pg_catalog, platform AS $$
  SELECT NULLIF(
    COALESCE(
      platform.jwt() -> 'app_metadata' ->> 'tenant_id',
      platform.jwt() ->> 'tenant_id'
    ), ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION platform.es_superadmin()
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = pg_catalog, platform AS $$
  SELECT COALESCE(
    platform.jwt() -> 'app_metadata' ->> 'rol_plataforma', ''
  ) = 'superadmin';
$$;

-- La suscripción y el corte por impago viven en 020_suscripciones.sql.
-- Un objeto, un archivo (regla 5): dos definiciones de la misma tabla
-- es exactamente el bug `activo` vs `activa` de la 15.3.
