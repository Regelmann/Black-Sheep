-- ═══════════════════════════════════════════════════════════════════
-- 003 · USUARIOS, MEMBRESÍAS Y PERMISOS
--
-- Reemplaza la mezcla de `ejecutivos` + `tenant_members` de la 15.3.
-- Un usuario puede pertenecer a varios tenants con roles distintos.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform.usuarios (
  id         UUID PRIMARY KEY,          -- = auth.users.id de Supabase
  email      TEXT NOT NULL UNIQUE,
  nombre     TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.membresias (
  usuario_id UUID NOT NULL REFERENCES platform.usuarios(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES platform.tenants(id)  ON DELETE CASCADE,
  rol        TEXT NOT NULL CHECK (rol IN
             ('tenant_admin','gerencia','ejecutivo','solo_lectura')),
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS ix_membresias_tenant
  ON platform.membresias (tenant_id) WHERE activo;

CREATE TABLE IF NOT EXISTS platform.rol_permiso (
  rol     TEXT NOT NULL,
  permiso TEXT NOT NULL,
  PRIMARY KEY (rol, permiso)
);

INSERT INTO platform.rol_permiso (rol, permiso) VALUES
  ('tenant_admin','cargar_datos'), ('tenant_admin','publicar_lote'),
  ('tenant_admin','gestionar_usuarios'), ('tenant_admin','gestionar_zonas'),
  ('tenant_admin','ver_gerencia'), ('tenant_admin','ver_contacto'),
  ('tenant_admin','ver_costo'), ('tenant_admin','emitir_catalogo'),
  ('gerencia','cargar_datos'), ('gerencia','ver_gerencia'), ('gerencia','ver_costo'),
  -- Gerencia también toma pedidos: contesta el teléfono cuando el
  -- cliente llama a la oficina en vez de esperar al vendedor.
  ('gerencia','crear_pedido'), ('gerencia','registrar_visita'),
  ('gerencia','gestionar_zonas'), ('gerencia','ver_contacto'),
  ('gerencia','publicar_lote'),
  ('ejecutivo','ver_cartera_propia'), ('ejecutivo','registrar_visita'),
  ('ejecutivo','crear_pedido'), ('ejecutivo','ver_contacto'),
  ('ejecutivo','emitir_catalogo'),
  ('solo_lectura','ver_cartera_propia')
ON CONFLICT DO NOTHING;

-- ─── Acceso · SECURITY DEFINER a propósito ─────────────────────────
-- Si las políticas RLS de core consultaran `membresias` directamente y
-- `membresias` tiene RLS, se produce recursión infinita. Esta función
-- rompe el ciclo. Por eso lleva search_path fijo y REVOKE de PUBLIC.

CREATE OR REPLACE FUNCTION platform.rol_en_tenant(p_tenant UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT CASE WHEN platform.es_superadmin() THEN 'tenant_admin' ELSE (
    SELECT m.rol FROM platform.membresias m
     WHERE m.usuario_id = platform.usuario_actual()
       AND m.tenant_id  = p_tenant
       AND m.activo
     LIMIT 1
  ) END;
$$;

CREATE OR REPLACE FUNCTION platform.tiene_acceso(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT p_tenant IS NOT NULL
     AND p_tenant = platform.tenant_actual()
     AND platform.rol_en_tenant(p_tenant) IS NOT NULL;
     -- 020 EXTIENDE esta función con el corte por impago. Se define en
     -- dos pasos porque la suscripción todavía no existe acá; la
     -- definición final, la que manda, es la de 020.
$$;

COMMENT ON FUNCTION platform.tiene_acceso(UUID) IS
  'Puerta única de todas las políticas RLS: tenant correcto + membresía
   activa (+ suscripción vigente, que agrega 020). Si alguna condición
   falla, la fila no existe para ese usuario.';

CREATE OR REPLACE FUNCTION platform.puede(p_permiso TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform.rol_permiso rp
     WHERE rp.permiso = p_permiso
       AND rp.rol = platform.rol_en_tenant(platform.tenant_actual())
  );
$$;

REVOKE ALL ON FUNCTION platform.rol_en_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.tiene_acceso(UUID)  FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.puede(TEXT)         FROM PUBLIC;
