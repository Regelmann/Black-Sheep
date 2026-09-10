-- ═══════════════════════════════════════════════════════════════════
-- 013 · GRANTS EXPLÍCITOS
--
-- Fail-closed: nadie puede nada hasta que se otorgue acá.
-- `anon` (sin sesión) NO toca ninguna tabla: sólo las funciones del
-- catálogo público, que validan token.
-- ═══════════════════════════════════════════════════════════════════

-- En Supabase estos roles ya existen. En local los crea db/test/00_shim.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

REVOKE ALL ON ALL TABLES    IN SCHEMA core, platform, ingest, compliance, api FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA core, platform, ingest, compliance, api FROM PUBLIC;

-- Sólo `api` es navegable. core/platform/ingest/compliance quedan sin USAGE:
-- una tabla nueva ahí NO es alcanzable aunque alguien olvide la política.
GRANT USAGE ON SCHEMA api TO authenticated, anon;

-- Las vistas de api son security_invoker: la RLS de las tablas de
-- abajo sigue aplicando. Por eso hace falta USAGE en core para el
-- usuario autenticado, y por eso NO se le da a anon.
GRANT USAGE ON SCHEMA core, platform TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA api TO authenticated;

GRANT SELECT ON core.cliente, core.producto, core.precio, core.stock,
                core.venta_linea, core.zona, core.zona_comuna, core.ejecutivo,
                core.meta, core.foco, core.oferta_cliente, core.visita,
                core.checkin, core.nota_cliente, core.pedido,
                core.tipo_documento, core.estado_excluido
  TO authenticated;

-- Vista intermedia de core que alimenta a varias vistas de api.
-- Es security_invoker: la RLS de las tablas de abajo sigue aplicando.
GRANT SELECT ON core.v_cliente_metricas TO authenticated;

GRANT SELECT ON core.cliente_contacto TO authenticated;   -- filtrado por RLS + permiso
GRANT SELECT ON core.costo            TO authenticated;   -- filtrado por RLS

GRANT INSERT ON core.visita, core.checkin, core.nota_cliente,
                core.pedido, core.encuesta_visita TO authenticated;
GRANT UPDATE ON core.visita, core.pedido TO authenticated;

GRANT SELECT ON platform.tenants, platform.usuarios,
                platform.membresias, platform.rol_permiso TO authenticated;

GRANT EXECUTE ON FUNCTION platform.jwt(), platform.usuario_actual(),
                          platform.tenant_actual(), platform.es_superadmin(),
                          platform.tiene_acceso(UUID), platform.puede(TEXT),
                          platform.rol_en_tenant(UUID)
  TO authenticated;

GRANT EXECUTE ON FUNCTION core.precio_para_cliente(UUID, TEXT, TEXT),
                          core.precio_historico(UUID, TEXT, TEXT, INTEGER)
  TO authenticated;
GRANT SELECT ON core.precio_cliente TO authenticated;

GRANT EXECUTE ON FUNCTION core.venta_elegible(UUID, TEXT, TEXT),
                          core.signo_documento(UUID, TEXT),
                          core.estado_cliente(INTEGER, BOOLEAN)
  TO authenticated;

-- Lo que se cree de acá en adelante también nace cerrado.
ALTER DEFAULT PRIVILEGES IN SCHEMA core, platform, ingest, compliance
  REVOKE ALL ON TABLES FROM PUBLIC;
