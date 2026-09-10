-- ═══════════════════════════════════════════════════════════════════
-- 030 · CICLO DE VIDA DEL TENANT
--
-- Una empresa que se va NO se borra. Se archiva.
--
--   trial → activa → morosa → suspendida → cancelada → archivada
--
-- Cada estado tiene un comportamiento distinto y está declarado, no
-- repartido en ifs por la aplicación.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE platform.suscripcion DROP CONSTRAINT IF EXISTS suscripcion_estado_check;
ALTER TABLE platform.suscripcion
  ADD CONSTRAINT suscripcion_estado_check CHECK (estado IN
    ('trial','activa','morosa','suspendida','cancelada','archivada'));

ALTER TABLE platform.suscripcion
  ADD COLUMN IF NOT EXISTS cancelada_en  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archivada_en  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_baja   TEXT;

-- Catálogo del ciclo. Existe para que el comportamiento de cada estado
-- se pueda LEER, en vez de deducirlo del código.
CREATE TABLE IF NOT EXISTS platform.estado_suscripcion (
  estado      TEXT PRIMARY KEY,
  orden       SMALLINT NOT NULL,
  opera       BOOLEAN NOT NULL,
  descripcion TEXT NOT NULL,
  que_pasa    TEXT NOT NULL
);

INSERT INTO platform.estado_suscripcion (estado, orden, opera, descripcion, que_pasa) VALUES
 ('trial',      1, TRUE,  'En prueba',
  'Opera completo. Vence en la fecha acordada.'),
 ('activa',     2, TRUE,  'Al día',
  'Opera completo.'),
 ('morosa',     3, TRUE,  'Con pago atrasado',
  'Sigue operando durante los días de gracia. Después deja de ver datos sola.'),
 ('suspendida', 4, FALSE, 'Cortada por impago',
  'Sus usuarios no ven datos. NADA se borra: vuelve entera al registrar el pago.'),
 ('cancelada',  5, FALSE, 'Se dio de baja',
  'Sin acceso operativo. Se conservan empresa, usuarios, datos, auditoría y pagos.'),
 ('archivada',  6, FALSE, 'Fuera de operación, conservada',
  'Ni siquiera aparece en las listas del día a día. Los datos siguen intactos y se puede reactivar.')
ON CONFLICT (estado) DO UPDATE
  SET orden = EXCLUDED.orden, opera = EXCLUDED.opera,
      descripcion = EXCLUDED.descripcion, que_pasa = EXCLUDED.que_pasa;

ALTER TABLE platform.estado_suscripcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.estado_suscripcion FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS estado_lectura ON platform.estado_suscripcion;
CREATE POLICY estado_lectura ON platform.estado_suscripcion FOR SELECT USING (true);
GRANT SELECT ON platform.estado_suscripcion TO authenticated;

-- ─── El interruptor lee el catálogo ────────────────────────────────
-- Antes la lista de estados que operan estaba escrita dentro de la
-- función. Ahora sale de la tabla: agregar un estado no obliga a tocar
-- el mecanismo de corte, que es el código más delicado del sistema.
CREATE OR REPLACE FUNCTION platform.tenant_habilitado(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT EXISTS (
    SELECT 1
      FROM platform.tenants t
      JOIN platform.suscripcion s ON s.tenant_id = t.id
      JOIN platform.estado_suscripcion es ON es.estado = s.estado
     WHERE t.id = p_tenant
       AND t.activo
       AND es.opera
       -- Morosa opera sólo mientras dure la gracia.
       AND (s.estado <> 'morosa'
            OR current_date <= s.vigente_hasta + s.dias_gracia)
  );
$$;

COMMENT ON FUNCTION platform.tenant_habilitado(UUID) IS
  'Fail-closed: sin fila de suscripción no hay acceso. Un tenant creado
   a mano sin plan queda cerrado, no abierto.';

-- ─── Baja y archivo ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.admin_dar_de_baja(
  p_tenant UUID, p_motivo TEXT
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE platform.suscripcion
     SET estado = 'cancelada', cancelada_en = now(),
         motivo_baja = p_motivo, actualizado_en = now()
   WHERE tenant_id = p_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'empresa_sin_suscripcion' USING ERRCODE = 'P0002';
  END IF;
  RETURN 'dada de baja · sus datos, usuarios y auditoría se conservan';
END $$;

CREATE OR REPLACE FUNCTION api.admin_archivar(p_tenant UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
DECLARE v_estado TEXT;
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  SELECT estado INTO v_estado FROM platform.suscripcion WHERE tenant_id = p_tenant;
  -- Archivar una empresa que todavía opera casi siempre es un clic mal
  -- dado. Hay que darla de baja primero, a propósito.
  IF v_estado NOT IN ('cancelada','suspendida') THEN
    RAISE EXCEPTION 'archivar_requiere_baja' USING ERRCODE = '22023',
      HINT = 'Primero dala de baja o suspéndela.';
  END IF;
  UPDATE platform.suscripcion
     SET estado = 'archivada', archivada_en = now(), actualizado_en = now()
   WHERE tenant_id = p_tenant;
  RETURN 'archivada · los datos quedan intactos y se puede reactivar';
END $$;

COMMENT ON FUNCTION api.admin_archivar(UUID) IS
  'Archivar NO borra nada. Es un estado, no un DELETE. Reactivar es
   registrar un pago o cambiar el estado a activa.';

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.admin_dar_de_baja(UUID,TEXT)',
    'api.admin_archivar(UUID)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
