-- ═══════════════════════════════════════════════════════════════════
-- 018 · RETENCIÓN Y ANONIMIZACIÓN
--
-- Retención POR FINALIDAD, no una regla genérica.
-- No se borra evidencia comercial o contable sólo por una regla de
-- privacidad cuando hay obligación legal de conservarla. En esos casos
-- se restringe el uso, se separa el acceso y se anonimiza lo personal.
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO compliance.politica_retencion (codigo, descripcion, objeto, criterio, meses, accion, fundamento) VALUES
 ('GPS_EJECUTIVO', 'Posición GPS de check-in de ejecutivos',
  'core.checkin', 'creado_en', 12, 'anonimizar',
  'Dato personal de trabajador. Finalidad de supervisión cumplida; el hecho de la visita se conserva sin coordenadas.'),
 ('NOTAS_VISITA', 'Texto libre sobre clientes y contactos',
  'core.nota_cliente', 'creado_en', 24, 'anonimizar',
  'Dato personal. Utilidad comercial acotada en el tiempo.'),
 ('CONTACTOS_INACTIVOS', 'Contactos de clientes dados de baja',
  'core.cliente_contacto', 'creado_en', 36, 'anonimizar',
  'Sin relación contractual vigente decae la base de legitimidad.'),
 ('VENTAS', 'Líneas de venta',
  'core.venta_linea', 'fecha', 72, 'restringir',
  'CONSERVAR: respaldo tributario y contable. No se elimina por regla de privacidad; se restringe el acceso.'),
 ('AUDITORIA', 'Bitácora de acciones administrativas',
  'platform.auditoria', 'creado_en', 24, 'restringir',
  'Evidencia de controles. Se conserva.')
ON CONFLICT (codigo) DO NOTHING;

-- Anonimizar no es borrar: el hecho se conserva, el dato personal no.
CREATE OR REPLACE FUNCTION compliance.aplicar_retencion(p_dry_run BOOLEAN DEFAULT TRUE)
RETURNS TABLE (politica TEXT, afectadas BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, compliance, core, platform AS $$
DECLARE n BIGINT;
BEGIN
  -- GPS
  SELECT count(*) INTO n FROM core.checkin
   WHERE creado_en < now() - interval '12 months' AND lat IS NOT NULL;
  IF NOT p_dry_run THEN
    UPDATE core.checkin SET lat = NULL, lng = NULL, precision_m = NULL
     WHERE creado_en < now() - interval '12 months' AND lat IS NOT NULL;
  END IF;
  politica := 'GPS_EJECUTIVO'; afectadas := n; RETURN NEXT;

  -- Notas
  SELECT count(*) INTO n FROM core.nota_cliente
   WHERE creado_en < now() - interval '24 months' AND anonimizado_en IS NULL;
  IF NOT p_dry_run THEN
    UPDATE core.nota_cliente
       SET texto = '[anonimizado por política de retención]', anonimizado_en = now()
     WHERE creado_en < now() - interval '24 months' AND anonimizado_en IS NULL;
  END IF;
  politica := 'NOTAS_VISITA'; afectadas := n; RETURN NEXT;

  -- Contactos de clientes inactivos
  SELECT count(*) INTO n
    FROM core.cliente_contacto cc
    JOIN core.cliente c ON c.tenant_id = cc.tenant_id AND c.cliente_key = cc.cliente_key
   WHERE NOT c.activo AND cc.creado_en < now() - interval '36 months'
     AND cc.anonimizado_en IS NULL;
  IF NOT p_dry_run THEN
    UPDATE core.cliente_contacto cc
       SET nombre = NULL, telefono = NULL, email = NULL, anonimizado_en = now()
      FROM core.cliente c
     WHERE c.tenant_id = cc.tenant_id AND c.cliente_key = cc.cliente_key
       AND NOT c.activo AND cc.creado_en < now() - interval '36 months'
       AND cc.anonimizado_en IS NULL;
  END IF;
  politica := 'CONTACTOS_INACTIVOS'; afectadas := n; RETURN NEXT;
END $$;

COMMENT ON FUNCTION compliance.aplicar_retencion(BOOLEAN) IS
  'Por defecto DRY RUN: informa cuántas filas tocaría y no toca nada.
   Un proceso de borrado que se ejecuta solo la primera vez que alguien
   lo prueba es un incidente, no una función.';

REVOKE ALL ON FUNCTION compliance.aplicar_retencion(BOOLEAN) FROM PUBLIC;
