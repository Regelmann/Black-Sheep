-- ═══════════════════════════════════════════════════════════════════
-- 029 · CONTROL CENTER · lo que opera Black Sheep
--
-- Todo acá es SECURITY DEFINER y verifica es_superadmin() adentro.
-- Convención: se llaman admin_*, que es la excepción declarada del
-- diagnóstico para funciones que reciben tenant por parámetro (019).
--
-- Estas funciones cruzan el límite entre empresas a propósito: son las
-- ÚNICAS que pueden. Por eso cada una empieza por la misma línea.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Estado del negocio ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.admin_resumen()
RETURNS TABLE (
  empresas BIGINT, operando BIGINT, en_prueba BIGINT, morosas BIGINT,
  suspendidas BIGINT, por_vencer BIGINT, ingreso_mensual NUMERIC,
  usuarios BIGINT, cargas_30d BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform, ingest AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    count(*),
    count(*) FILTER (WHERE platform.tenant_habilitado(t.id)),
    count(*) FILTER (WHERE s.estado = 'trial'),
    count(*) FILTER (WHERE s.estado = 'morosa'),
    count(*) FILTER (WHERE s.estado IN ('suspendida','cancelada')),
    -- Lo que hay que llamar esta semana: vence en 7 días o menos y
    -- todavía está operando.
    count(*) FILTER (WHERE s.vigente_hasta <= current_date + 7
                       AND s.estado IN ('trial','activa')),
    COALESCE(sum(s.monto_mensual) FILTER (WHERE s.estado = 'activa'), 0),
    (SELECT count(*) FROM platform.membresias WHERE activo),
    (SELECT count(*) FROM ingest.archivo WHERE subido_en > now() - interval '30 days')
  FROM platform.tenants t
  LEFT JOIN platform.suscripcion s ON s.tenant_id = t.id;
END $$;

-- ─── Ficha de una empresa ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.admin_empresa(p_tenant UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform, core, ingest AS $$
DECLARE v JSONB;
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'tenant_id', t.id, 'slug', t.slug, 'nombre', t.nombre,
    'color', t.color, 'logo_url', t.logo_url, 'activo', t.activo,
    'creado_en', t.creado_en,
    'suscripcion', to_jsonb(s) - 'tenant_id',
    'habilitado', platform.tenant_habilitado(t.id),
    'capacidades', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'codigo', c.codigo, 'nombre', c.nombre, 'descripcion', c.descripcion,
        'activa', COALESCE(tc.activa, c.activa_por_defecto)) ORDER BY c.codigo), '[]')
        FROM platform.capacidad c
        LEFT JOIN platform.tenant_capacidad tc
          ON tc.tenant_id = t.id AND tc.capacidad = c.codigo),
    'usuarios', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'usuario_id', u.id, 'email', u.email, 'nombre', u.nombre,
        'rol', m.rol, 'activo', m.activo) ORDER BY m.rol, u.email), '[]')
        FROM platform.membresias m
        JOIN platform.usuarios u ON u.id = m.usuario_id
       WHERE m.tenant_id = t.id),
    'documentos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'codigo', td.codigo, 'descripcion', td.descripcion,
        'cuenta', td.cuenta_como_venta, 'signo', td.signo) ORDER BY td.codigo), '[]')
        FROM core.tipo_documento td WHERE td.tenant_id = t.id),
    'datos', jsonb_build_object(
      'clientes',  (SELECT count(*) FROM core.cliente  WHERE tenant_id = t.id AND activo),
      'productos', (SELECT count(*) FROM core.producto WHERE tenant_id = t.id AND activo),
      'ventas',    (SELECT count(*) FROM core.venta_linea WHERE tenant_id = t.id),
      'venta_mtd', (SELECT COALESCE(sum(monto_neto),0) FROM core.venta_linea
                     WHERE tenant_id = t.id
                       AND fecha >= date_trunc('month', current_date)::date)),
    'cargas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'archivo', a.nombre_original, 'tipo', a.tipo,
        'estado', l.estado, 'cuando', a.subido_en) ORDER BY a.subido_en DESC), '[]')
        FROM ingest.lote l JOIN ingest.archivo a ON a.id = l.archivo_id
       WHERE l.tenant_id = t.id
       LIMIT 8),
    'pagos', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'periodo', p.periodo, 'monto', p.monto, 'referencia', p.referencia,
        'pagado_en', p.pagado_en) ORDER BY p.periodo DESC), '[]')
        FROM platform.pago p WHERE p.tenant_id = t.id LIMIT 12)
  ) INTO v
  FROM platform.tenants t
  LEFT JOIN platform.suscripcion s ON s.tenant_id = t.id
  WHERE t.id = p_tenant;

  IF v IS NULL THEN
    RAISE EXCEPTION 'empresa_no_encontrada' USING ERRCODE = 'P0002';
  END IF;
  RETURN v;
END $$;

COMMENT ON FUNCTION api.admin_empresa(UUID) IS
  'Una llamada, la ficha completa. Diez consultas separadas desde el
   front serían diez viajes y diez oportunidades de mostrar la mitad de
   la pantalla mientras el resto carga.';

-- ─── Usuarios de una empresa ───────────────────────────────────────
CREATE OR REPLACE FUNCTION api.admin_asignar_usuario(
  p_tenant UUID, p_email TEXT, p_rol TEXT, p_ejecutivo_id TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform, core AS $$
DECLARE v_uid UUID;
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF p_rol NOT IN ('tenant_admin','gerencia','ejecutivo','solo_lectura') THEN
    RAISE EXCEPTION 'rol_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_uid FROM platform.usuarios WHERE lower(email) = lower(trim(p_email));
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'usuario_no_registrado' USING ERRCODE = 'P0002',
      HINT = 'Invítalo desde Supabase → Authentication → Invite user. '
             'Cuando acepte la invitación, vuelve a asignarlo acá.';
  END IF;

  INSERT INTO platform.membresias (usuario_id, tenant_id, rol)
       VALUES (v_uid, p_tenant, p_rol)
  ON CONFLICT (usuario_id, tenant_id) DO UPDATE
    SET rol = EXCLUDED.rol, activo = TRUE;

  IF p_ejecutivo_id IS NOT NULL THEN
    UPDATE core.ejecutivo SET usuario_id = v_uid, email = p_email
     WHERE tenant_id = p_tenant AND id = p_ejecutivo_id;
  END IF;

  -- El claim se arma al emitir el token: el acceso cambia cuando la
  -- persona vuelve a entrar, no al instante.
  RETURN 'asignado · se aplica en su próximo inicio de sesión';
END $$;

CREATE OR REPLACE FUNCTION api.admin_quitar_usuario(p_tenant UUID, p_usuario UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  -- Se desactiva, no se borra: la auditoría tiene que poder decir quién
  -- publicó aquel lote de marzo.
  UPDATE platform.membresias SET activo = FALSE
   WHERE tenant_id = p_tenant AND usuario_id = p_usuario;
  RETURN 'sin acceso desde su próximo inicio de sesión';
END $$;

-- ─── Tipos de documento · el paso que bloquea el onboarding ────────
CREATE OR REPLACE FUNCTION api.admin_configurar_documentos(
  p_tenant UUID, p_documentos JSONB
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform, core AS $$
DECLARE v_n INTEGER;
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_documentos) <> 'array' OR jsonb_array_length(p_documentos) = 0 THEN
    RAISE EXCEPTION 'sin_documentos' USING ERRCODE = '22023';
  END IF;

  INSERT INTO core.tipo_documento (tenant_id, codigo, descripcion, cuenta_como_venta, signo)
  SELECT p_tenant, upper(trim(d->>'codigo')), d->>'descripcion',
         COALESCE((d->>'cuenta')::boolean, true),
         COALESCE((d->>'signo')::smallint, 1)
    FROM jsonb_array_elements(p_documentos) d
   WHERE NULLIF(trim(d->>'codigo'),'') IS NOT NULL
  ON CONFLICT (tenant_id, codigo) DO UPDATE
    SET descripcion = EXCLUDED.descripcion,
        cuenta_como_venta = EXCLUDED.cuenta_como_venta,
        signo = EXCLUDED.signo;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN v_n || ' tipos configurados';
END $$;

COMMENT ON FUNCTION api.admin_configurar_documentos(UUID, JSONB) IS
  'SIN ESTO LA VENTA QUEDA EN CERO. Es el paso que hay que hacer antes
   de la primera carga de cualquier empresa: decidir qué código de
   documento suma, cuál resta y cuál no cuenta.';

CREATE OR REPLACE FUNCTION api.admin_estado_excluido(
  p_tenant UUID, p_estados TEXT[]
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform, core AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  DELETE FROM core.estado_excluido WHERE tenant_id = p_tenant;
  INSERT INTO core.estado_excluido (tenant_id, estado)
  SELECT p_tenant, upper(trim(e)) FROM unnest(p_estados) e
   WHERE NULLIF(trim(e),'') IS NOT NULL
  ON CONFLICT DO NOTHING;
  RETURN 'listo';
END $$;

-- ─── Marca de la empresa ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION api.admin_marca(
  p_tenant UUID, p_nombre TEXT DEFAULT NULL,
  p_color TEXT DEFAULT NULL, p_logo_url TEXT DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
BEGIN
  IF NOT platform.es_superadmin() THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  UPDATE platform.tenants
     SET nombre = COALESCE(p_nombre, nombre),
         color = COALESCE(p_color, color),
         logo_url = COALESCE(p_logo_url, logo_url)
   WHERE id = p_tenant;
  RETURN 'listo';
END $$;

-- ─── Marca pública por subdominio ──────────────────────────────────
-- La abre alguien SIN sesión: es la pantalla de acceso de cada empresa.
-- Devuelve sólo lo que se pinta. Nada de datos, nada de conteos.
CREATE OR REPLACE FUNCTION api.marca_por_slug(p_slug TEXT)
RETURNS TABLE (slug TEXT, nombre TEXT, color TEXT, logo_url TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, platform AS $$
  SELECT t.slug, t.nombre, t.color, t.logo_url
    FROM platform.tenants t
   WHERE t.slug = lower(trim(p_slug)) AND t.activo;
$$;

COMMENT ON FUNCTION api.marca_por_slug(TEXT) IS
  'Pública a propósito: el logo y el color de una empresa no son un
   secreto, y sin esto la pantalla de acceso se pinta genérica y después
   salta a la marca. Devuelve CUATRO campos y ninguno es dato de negocio.';

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.admin_resumen()',
    'api.admin_empresa(UUID)',
    'api.admin_asignar_usuario(UUID,TEXT,TEXT,TEXT)',
    'api.admin_quitar_usuario(UUID,UUID)',
    'api.admin_configurar_documentos(UUID,JSONB)',
    'api.admin_estado_excluido(UUID,TEXT[])',
    'api.admin_marca(UUID,TEXT,TEXT,TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION api.marca_por_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.marca_por_slug(TEXT) TO anon, authenticated;
