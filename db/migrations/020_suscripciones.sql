-- ═══════════════════════════════════════════════════════════════════
-- 020 · SUSCRIPCIONES · el corte de servicio por falta de pago
--
-- LA IDEA CENTRAL: el corte NO se implementa en la app. Se implementa
-- en `platform.tiene_acceso()`, que es la función que YA usan todas las
-- políticas RLS de core, ingest y compliance.
--
-- Consecuencia: suspender una empresa apaga de golpe la app, el
-- dashboard, el catálogo público y cualquier consulta directa a la
-- base. No hay una pantalla que se pueda olvidar de chequear el pago,
-- porque el chequeo no vive en ninguna pantalla.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform.suscripcion (
  tenant_id     UUID PRIMARY KEY REFERENCES platform.tenants(id) ON DELETE CASCADE,
  plan          TEXT NOT NULL DEFAULT 'base',
  estado        TEXT NOT NULL DEFAULT 'trial'
                CHECK (estado IN ('trial','activa','morosa','suspendida','cancelada')),
  vigente_hasta DATE NOT NULL,
  -- Cortar el mismo día del vencimiento por un pago atrasado dos días
  -- deja a los vendedores en la calle sin herramienta. La gracia es una
  -- decisión comercial, no un descuido técnico.
  dias_gracia   INTEGER NOT NULL DEFAULT 5 CHECK (dias_gracia >= 0),
  monto_mensual NUMERIC CHECK (monto_mensual IS NULL OR monto_mensual >= 0),
  moneda        TEXT NOT NULL DEFAULT 'CLP',
  max_usuarios  INTEGER,
  notas         TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN platform.suscripcion.estado IS
  'trial y activa dan acceso. morosa da acceso hasta que vence la
   gracia. suspendida y cancelada cortan de inmediato.
   `morosa` existe para no cortarle el día a un vendedor en la calle
   por una transferencia que entra con dos días de atraso.';

CREATE TABLE IF NOT EXISTS platform.pago (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  periodo    DATE NOT NULL,
  monto      NUMERIC NOT NULL CHECK (monto >= 0),
  moneda     TEXT NOT NULL DEFAULT 'CLP',
  pagado_en  DATE,
  referencia TEXT,
  registrado_por UUID REFERENCES platform.usuarios(id),
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, periodo)
);

-- ─── El interruptor ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.tenant_habilitado(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT EXISTS (
    SELECT 1
      FROM platform.tenants t
      LEFT JOIN platform.suscripcion s ON s.tenant_id = t.id
     WHERE t.id = p_tenant
       AND t.activo
       -- Sin fila de suscripción NO hay acceso: fail-closed. Un tenant
       -- creado a mano sin plan no queda abierto por descuido.
       AND s.tenant_id IS NOT NULL
       AND (
            s.estado IN ('trial','activa')
         OR (s.estado = 'morosa'
             AND current_date <= s.vigente_hasta + s.dias_gracia)
       )
  );
$$;

-- ─── Se enchufa en la función que ya usan TODAS las políticas ──────
CREATE OR REPLACE FUNCTION platform.tiene_acceso(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT p_tenant IS NOT NULL
     AND p_tenant = platform.tenant_actual()
     AND platform.rol_en_tenant(p_tenant) IS NOT NULL
     -- El superadmin entra igual: si no, no podría reactivar a nadie
     -- ni diagnosticar una empresa cortada.
     AND (platform.es_superadmin() OR platform.tenant_habilitado(p_tenant));
$$;

REVOKE ALL ON FUNCTION platform.tenant_habilitado(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.tenant_habilitado(UUID) TO authenticated;

-- RLS: la empresa ve su propia suscripción (para saber que debe pagar),
-- pero NO puede modificarla. Sólo el superadmin escribe acá.
ALTER TABLE platform.suscripcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.suscripcion FORCE  ROW LEVEL SECURITY;
ALTER TABLE platform.pago        ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.pago        FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suscripcion_lectura ON platform.suscripcion;
CREATE POLICY suscripcion_lectura ON platform.suscripcion FOR SELECT
  USING (platform.es_superadmin() OR tenant_id = platform.tenant_actual());

DROP POLICY IF EXISTS pago_lectura ON platform.pago;
CREATE POLICY pago_lectura ON platform.pago FOR SELECT
  USING (platform.es_superadmin() OR tenant_id = platform.tenant_actual());

GRANT SELECT ON platform.suscripcion, platform.pago TO authenticated;

DROP TRIGGER IF EXISTS tg_auditar ON platform.suscripcion;
CREATE TRIGGER tg_auditar AFTER INSERT OR UPDATE OR DELETE ON platform.suscripcion
  FOR EACH ROW EXECUTE FUNCTION platform.fn_auditar();
