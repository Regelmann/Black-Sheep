-- ═══════════════════════════════════════════════════════════════════
-- 019 · DIAGNÓSTICO · se corre después de cada despliegue
--
-- No modifica nada. Devuelve una fila por chequeo. Si alguno sale
-- FALLA y es bloqueante, el despliegue no se promueve.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION compliance.diagnostico()
RETURNS TABLE (control TEXT, estado TEXT, detalle TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, compliance, platform AS $$
DECLARE n INTEGER; txt TEXT;
BEGIN
  -- 1 · Tablas sin RLS
  SELECT count(*), string_agg(n.nspname || '.' || c.relname, ', ')
    INTO n, txt
    FROM pg_class c JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname IN ('core','platform','ingest','compliance')
     AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  control := 'RLS_FAIL_CLOSED';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE(txt, 'todas las tablas con ENABLE + FORCE');
  RETURN NEXT;

  -- 2 · Tablas con RLS y sin ninguna política = inaccesibles en silencio
  SELECT count(*), string_agg(n.nspname || '.' || c.relname, ', ')
    INTO n, txt
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname IN ('core','platform','ingest','compliance')
     AND c.relrowsecurity
     -- Sólo importa si el rol de la app puede alcanzarla. Una tabla sin
     -- grants (p. ej. core.rate_limit, que sólo se toca desde funciones
     -- SECURITY DEFINER) ya está cerrada: no tener política ES el cierre.
     AND has_table_privilege('authenticated', c.oid, 'SELECT')
     AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);
  control := 'RLS_CON_POLITICA';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'AVISO' END;
  detalle := COALESCE(txt, 'todas las tablas con política');
  RETURN NEXT;

  -- 3 · SECURITY DEFINER sin search_path fijo
  SELECT count(*), string_agg(n.nspname || '.' || p.proname, ', ')
    INTO n, txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef
     AND n.nspname IN ('core','platform','ingest','compliance','api')
     AND (p.proconfig IS NULL
          OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg
                          WHERE cfg LIKE 'search_path=%'));
  control := 'DEFINER_SEARCH_PATH';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE(txt, 'todas las funciones definer con search_path fijo');
  RETURN NEXT;

  -- 4 · Funciones ejecutables por PUBLIC
  SELECT count(*), string_agg(n.nspname || '.' || p.proname, ', ')
    INTO n, txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.prosecdef
     AND n.nspname IN ('core','platform','ingest','compliance')
     AND has_function_privilege('public', p.oid, 'EXECUTE');
  control := 'DEFINER_REVOKE_PUBLIC';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE(txt, 'ninguna función privilegiada abierta a PUBLIC');
  RETURN NEXT;

  -- 5 · Vistas de api sin security_invoker (túnel bajo la RLS)
  SELECT count(*), string_agg(c.relname, ', ')
    INTO n, txt
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'v' AND n.nspname = 'api'
     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(c.reloptions, '{}')) o
                      WHERE o = 'security_invoker=true');
  control := 'VISTAS_SECURITY_INVOKER';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE(txt, 'todas las vistas de api con security_invoker');
  RETURN NEXT;

  -- 6 · Tenants sin tipos de documento configurados (D-05 sin cerrar)
  SELECT count(*), string_agg(t.slug, ', ')
    INTO n, txt
    FROM platform.tenants t
   WHERE t.activo
     AND NOT EXISTS (SELECT 1 FROM core.tipo_documento td WHERE td.tenant_id = t.id);
  control := 'TIPOS_DOCUMENTO_CONFIGURADOS';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE(txt, 'todos los tenants con tipos de documento');
  RETURN NEXT;

  -- 7 · Tenants sin suscripción: la app les queda apagada (fail-closed).
  --     Es el error seguro, pero hay que verlo, no descubrirlo por un
  --     reclamo del cliente.
  SELECT count(*), string_agg(t.slug, ', ')
    INTO n, txt
    FROM platform.tenants t
   WHERE t.activo
     AND NOT EXISTS (SELECT 1 FROM platform.suscripcion s WHERE s.tenant_id = t.id);
  control := 'SUSCRIPCION_DEFINIDA';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE('sin suscripción: ' || txt, 'todos los tenants con suscripción');
  RETURN NEXT;

  -- 8 · Funciones de api que aceptan tenant_id por parámetro.
  --     Una función así se puede apuntar a otra empresa. El tenant
  --     tiene que salir del JWT. Se exceptúan las de superadmin, que
  --     lo reciben a propósito y validan es_superadmin() adentro.
  SELECT count(*), string_agg(p.proname, ', ')
    INTO n, txt
    FROM pg_proc p JOIN pg_namespace nn ON nn.oid = p.pronamespace
   WHERE nn.nspname = 'api'
     AND pg_get_function_arguments(p.oid) ILIKE '%tenant%'
     -- Convención: TODA función de superadmin se llama admin_*. La
     -- excepción es explícita y verificable de un vistazo, en vez de
     -- una lista de nombres que se desactualiza sola.
     AND p.proname NOT LIKE 'admin\_%';
  control := 'API_SIN_TENANT_POR_PARAMETRO';
  estado  := CASE WHEN n = 0 THEN 'OK' ELSE 'FALLA' END;
  detalle := COALESCE(txt, 'ninguna función de api recibe tenant_id del cliente');
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION compliance.diagnostico() FROM PUBLIC;
