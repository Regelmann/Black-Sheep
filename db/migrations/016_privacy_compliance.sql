-- ═══════════════════════════════════════════════════════════════════
-- 016 · PRIVACIDAD Y CUMPLIMIENTO · Ley 21.719
--
-- Adaptado del paquete APP2_LEGAL_SECURITY_BASE_V1 (011) con dos
-- correcciones obligatorias:
--   1. tenant_id UUID contra platform.tenants — el original apuntaba a
--      public.tenants(id), que en la 15.3 es TEXT: fallaba al primer RUN
--   2. movido de `public` al esquema `compliance` (D-03)
--
-- Que estas tablas existan NO significa tener un programa de
-- cumplimiento. Son el plano de control técnico. Falta lo de la
-- sección 12 del documento de arquitectura: DPA, política de
-- privacidad, responsable designado y revisión de abogado.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance.actividad_tratamiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES platform.tenants(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  finalidad TEXT NOT NULL,
  base_legitimidad TEXT NOT NULL CHECK (base_legitimidad IN
    ('consentimiento','contrato','obligacion_legal','interes_legitimo',
     'reclamacion_legal','otra')),
  categorias_datos TEXT[] NOT NULL DEFAULT '{}',
  categorias_titulares TEXT[] NOT NULL DEFAULT '{}',
  destinatarios TEXT[] NOT NULL DEFAULT '{}',
  transferencia_internacional BOOLEAN NOT NULL DEFAULT FALSE,
  politica_retencion TEXT,
  decision_automatizada BOOLEAN NOT NULL DEFAULT FALSE,
  logica_resumen TEXT,
  revision_humana BOOLEAN NOT NULL DEFAULT FALSE,
  politica_privacidad_version TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, codigo)
);

COMMENT ON TABLE compliance.actividad_tratamiento IS
  'Registro de actividades. Cada tratamiento declara SU base de
   legitimidad. No se fuerza consentimiento donde el sustento correcto
   es contrato, obligación legal o interés legítimo.';

CREATE TABLE IF NOT EXISTS compliance.consentimiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  actividad_id UUID NOT NULL REFERENCES compliance.actividad_tratamiento(id),
  titular_ref TEXT NOT NULL,
  version_finalidad TEXT NOT NULL,
  otorgado_en TIMESTAMPTZ NOT NULL,
  retirado_en TIMESTAMPTZ,
  medio TEXT NOT NULL,
  evidencia JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance.solicitud_titular (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN
    ('acceso','rectificacion','supresion','oposicion','portabilidad','bloqueo')),
  titular_ref TEXT NOT NULL,
  canal TEXT,
  recibida_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 30 días corridos, prorrogables por 30 más.
  -- Columna con DEFAULT y no GENERATED: sumar un intervalo a un
  -- timestamptz depende del huso horario y Postgres no lo considera
  -- inmutable, así que no admite columna generada.
  vence_en TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  prorrogada_hasta TIMESTAMPTZ,
  estado TEXT NOT NULL DEFAULT 'recibida' CHECK (estado IN
    ('recibida','en_proceso','resuelta','rechazada')),
  decision TEXT,
  evidencia JSONB NOT NULL DEFAULT '{}'::jsonb,
  responsable_id UUID REFERENCES platform.usuarios(id),
  resuelta_en TIMESTAMPTZ
);

COMMENT ON COLUMN compliance.solicitud_titular.vence_en IS
  'Se calcula al recibir, no se escribe a mano. El panel de cumplimiento alerta antes
   de que venza: un plazo que hay que recordar es un plazo que se pasa.';

CREATE TABLE IF NOT EXISTS compliance.incidente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES platform.tenants(id) ON DELETE SET NULL,
  detectado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  severidad TEXT NOT NULL CHECK (severidad IN ('baja','media','alta','critica')),
  activos_afectados TEXT[] NOT NULL DEFAULT '{}',
  categorias_datos TEXT[] NOT NULL DEFAULT '{}',
  evaluacion_riesgo TEXT,
  requiere_notificacion BOOLEAN,
  -- 72 horas desde el conocimiento del incidente
  notificar_antes_de TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '72 hours'),
  notificado_en TIMESTAMPTZ,
  contencion TEXT,
  comunicaciones JSONB NOT NULL DEFAULT '{}'::jsonb,
  resuelto_en TIMESTAMPTZ,
  post_mortem TEXT
);

COMMENT ON COLUMN compliance.incidente.requiere_notificacion IS
  'Consecuencia de la evaluación de riesgo, no una decisión informal.';

CREATE TABLE IF NOT EXISTS compliance.politica_retencion (
  codigo TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL,
  objeto TEXT NOT NULL,               -- 'core.checkin'
  criterio TEXT NOT NULL,             -- 'creado_en'
  meses INTEGER NOT NULL,
  accion TEXT NOT NULL CHECK (accion IN ('anonimizar','eliminar','restringir')),
  fundamento TEXT
);

CREATE TABLE IF NOT EXISTS compliance.encargado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES platform.tenants(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  finalidad TEXT NOT NULL,
  categorias_datos TEXT[] NOT NULL DEFAULT '{}',
  ubicacion TEXT,
  subencargados TEXT[] NOT NULL DEFAULT '{}',
  contrato_ref TEXT,
  vigente_desde DATE,
  vigente_hasta DATE
);

CREATE TABLE IF NOT EXISTS compliance.decision_automatizada (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,                 -- 'oferta_cliente', 'ranking_ruta'…
  regla_version TEXT NOT NULL,
  variables TEXT[] NOT NULL DEFAULT '{}',
  explicacion TEXT NOT NULL,
  revision_humana BOOLEAN NOT NULL DEFAULT TRUE,
  vigente_desde TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE compliance.decision_automatizada IS
  'D-12 · Toda recomendación (a quién visitar, qué ofrecer) declara
   finalidad, versión de la regla, variables y si hay intervención
   humana. Es exigencia legal y además es lo que permite responder
   "¿por qué me sugirió esto?" sin abrir el código.';

-- ─── RLS de este esquema ───────────────────────────────────────────
-- Va acá y no en 012 porque 012 corre ANTES: una tabla creada después
-- no queda cubierta por un bucle que ya pasó. El diagnóstico (019) lo
-- detecta, y esta es la corrección.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS tabla,
           EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
                      AND a.attnum > 0 AND NOT a.attisdropped) AS tiene_tenant
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = 'compliance'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.tabla);
    EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', r.tabla);
    EXECUTE format('DROP POLICY IF EXISTS compliance_acceso ON %s', r.tabla);
    IF r.tiene_tenant THEN
      EXECUTE format($f$
        CREATE POLICY compliance_acceso ON %s FOR ALL
          USING (tenant_id IS NULL OR platform.tiene_acceso(tenant_id))
          WITH CHECK (tenant_id IS NULL OR platform.tiene_acceso(tenant_id))
      $f$, r.tabla);
    ELSE
      -- Catálogos de la plataforma (controles, políticas de retención):
      -- se leen, no se escriben desde la app.
      EXECUTE format($f$
        CREATE POLICY compliance_acceso ON %s FOR SELECT USING (true)
      $f$, r.tabla);
    END IF;
  END LOOP;
END $$;
