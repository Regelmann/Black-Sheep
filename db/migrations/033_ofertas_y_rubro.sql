-- ═══════════════════════════════════════════════════════════════════
-- 033 · OFERTAS Y SUGERENCIAS POR RUBRO
--
-- Dos cosas que el catálogo necesitaba:
--
-- 1 · OFERTAS · rematar por precio, por stock parado o por vencimiento.
--     REGLA QUE NO SE NEGOCIA: una oferta NUNCA sube el precio de un
--     cliente. Si alguien negoció $750 y la oferta general es $800,
--     mandarle $800 es un error que se lee como abuso. La oferta aplica
--     sólo si deja al cliente MEJOR de lo que ya estaba.
--
-- 2 · SUGERENCIAS POR RUBRO · no es lo mismo ofrecerle a una pizzería
--     que a una hamburguesería. Salen del histórico real: qué compran
--     los otros locales del mismo rubro que este cliente todavía no
--     compra. Sin modelos ni adivinanzas, con los datos que ya hay.
--
-- ORDEN EN LA PANTALLA: primero lo suyo, después las ofertas, después
-- lo de su rubro. Quien abre el catálogo viene a reponer; descubrir es
-- lo segundo.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS core.oferta (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  sku           TEXT NOT NULL,
  precio_oferta NUMERIC NOT NULL CHECK (precio_oferta >= 0),
  motivo        TEXT NOT NULL CHECK (motivo IN ('precio','stock','vencimiento','lanzamiento')),
  detalle       TEXT,
  fecha_venc    DATE,
  -- NULL = para todos. Con rubros, sólo esos: una oferta de mozzarella
  -- en bloque no le sirve a una ferretería.
  rubros        TEXT[],
  vigente_desde DATE NOT NULL DEFAULT current_date,
  vigente_hasta DATE,
  creado_por    UUID REFERENCES platform.usuarios(id),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, sku) REFERENCES core.producto(tenant_id, sku) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_oferta_vigente
  ON core.oferta (tenant_id, sku, vigente_desde, vigente_hasta);

COMMENT ON COLUMN core.oferta.motivo IS
  'precio · stock · vencimiento · lanzamiento. Cambia CÓMO se muestra:
   un producto por vencer se comunica distinto que una novedad, y
   esconder el motivo hace que el comprador desconfíe del descuento.';

ALTER TABLE core.oferta ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.oferta FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_lectura   ON core.oferta;
DROP POLICY IF EXISTS tenant_escritura ON core.oferta;
CREATE POLICY tenant_lectura   ON core.oferta FOR SELECT USING (platform.tiene_acceso(tenant_id));
CREATE POLICY tenant_escritura ON core.oferta FOR ALL
  USING (platform.tiene_acceso(tenant_id)) WITH CHECK (platform.tiene_acceso(tenant_id));
GRANT SELECT ON core.oferta TO authenticated;

-- ─── El precio efectivo ahora considera la oferta ──────────────────
-- Sigue siendo UNA sola función: la usan el catálogo, el pedido del
-- vendedor y el pedido público. Si el cálculo estuviera duplicado, la
-- pantalla mostraría la oferta y el pedido cobraría otra cosa.
CREATE OR REPLACE FUNCTION core.precio_para_cliente(
  p_tenant UUID, p_cliente_key TEXT, p_sku TEXT
) RETURNS TABLE (precio NUMERIC, origen TEXT, precio_lista NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, core AS $$
DECLARE v_lista NUMERIC; v_acordado NUMERIC; v_hist NUMERIC;
        v_base NUMERIC; v_origen TEXT; v_oferta NUMERIC; v_rubro TEXT;
BEGIN
  SELECT COALESCE(p.precio_unidad, p.precio_caja, p.precio_kilo)
    INTO v_lista
    FROM core.precio p
   WHERE p.tenant_id = p_tenant AND p.sku = p_sku
     AND p.vigente_desde <= current_date
   ORDER BY p.vigente_desde DESC LIMIT 1;

  SELECT pc.precio_unidad INTO v_acordado
    FROM core.precio_cliente pc
   WHERE pc.tenant_id = p_tenant AND pc.cliente_key = p_cliente_key
     AND pc.sku = p_sku
     AND pc.vigente_desde <= current_date
     AND (pc.vigente_hasta IS NULL OR pc.vigente_hasta >= current_date)
   ORDER BY pc.vigente_desde DESC LIMIT 1;

  IF v_acordado IS NOT NULL THEN
    v_base := v_acordado; v_origen := 'acordado';
  ELSE
    v_hist := core.precio_historico(p_tenant, p_cliente_key, p_sku);
    IF v_hist IS NOT NULL AND v_lista IS NOT NULL
       AND v_hist BETWEEN v_lista * 0.4 AND v_lista * 1.6 THEN
      v_base := v_hist; v_origen := 'historico';
    ELSIF v_hist IS NOT NULL AND v_lista IS NULL THEN
      v_base := v_hist; v_origen := 'historico';
    ELSE
      v_base := v_lista; v_origen := 'lista';
    END IF;
  END IF;

  -- La oferta entra al final y SÓLO si mejora lo que ya tenía.
  SELECT c.rubro INTO v_rubro FROM core.cliente c
   WHERE c.tenant_id = p_tenant AND c.cliente_key = p_cliente_key;

  SELECT min(o.precio_oferta) INTO v_oferta
    FROM core.oferta o
   WHERE o.tenant_id = p_tenant AND o.sku = p_sku
     AND o.vigente_desde <= current_date
     AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date)
     AND (o.rubros IS NULL OR v_rubro = ANY(o.rubros));

  IF v_oferta IS NOT NULL AND (v_base IS NULL OR v_oferta < v_base) THEN
    RETURN QUERY SELECT v_oferta, 'oferta'::text, v_lista; RETURN;
  END IF;

  RETURN QUERY SELECT v_base, v_origen, v_lista;
END $$;

COMMENT ON FUNCTION core.precio_para_cliente(UUID, TEXT, TEXT) IS
  'Precedencia: oferta (sólo si MEJORA) → acordado → histórico → lista.
   Una oferta nunca sube el precio de nadie.';

-- ─── Qué compran los del mismo rubro y este cliente no ─────────────
CREATE OR REPLACE FUNCTION core.sugerencias_rubro(
  p_tenant UUID, p_cliente_key TEXT, p_limite INTEGER DEFAULT 8
) RETURNS TABLE (sku TEXT, clientes_del_rubro BIGINT, penetracion NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, core AS $$
DECLARE v_rubro TEXT; v_total BIGINT;
BEGIN
  SELECT c.rubro INTO v_rubro FROM core.cliente c
   WHERE c.tenant_id = p_tenant AND c.cliente_key = p_cliente_key;
  IF v_rubro IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_total FROM core.cliente c
   WHERE c.tenant_id = p_tenant AND c.rubro = v_rubro AND c.activo;
  -- Con dos o tres locales del rubro, "lo que compran los demás" es
  -- una anécdota, no un patrón. Mejor no sugerir nada.
  IF v_total < 4 THEN RETURN; END IF;

  RETURN QUERY
  SELECT v.sku, count(DISTINCT v.cliente_key),
         round(100.0 * count(DISTINCT v.cliente_key) / v_total, 1)
    FROM core.venta_linea v
    JOIN core.cliente c
      ON c.tenant_id = v.tenant_id AND c.cliente_key = v.cliente_key
   WHERE v.tenant_id = p_tenant
     AND c.rubro = v_rubro
     AND c.cliente_key <> p_cliente_key
     AND v.monto_neto > 0
     AND v.fecha >= current_date - interval '6 months'
     -- Lo que este cliente NO compra: sugerirle lo que ya pide sería
     -- ruido encima de su propia lista.
     AND NOT EXISTS (
       SELECT 1 FROM core.venta_linea w
        WHERE w.tenant_id = p_tenant AND w.cliente_key = p_cliente_key
          AND w.sku = v.sku AND w.fecha >= current_date - interval '6 months')
   GROUP BY v.sku
  HAVING count(DISTINCT v.cliente_key) >= 2
   ORDER BY count(DISTINCT v.cliente_key) DESC
   LIMIT p_limite;
END $$;

GRANT EXECUTE ON FUNCTION core.sugerencias_rubro(UUID, TEXT, INTEGER) TO authenticated;

-- ─── Administrar ofertas desde el dashboard ────────────────────────
CREATE OR REPLACE FUNCTION api.guardar_oferta(
  p_sku TEXT, p_precio NUMERIC, p_motivo TEXT,
  p_detalle TEXT DEFAULT NULL, p_fecha_venc DATE DEFAULT NULL,
  p_rubros TEXT[] DEFAULT NULL, p_vigente_hasta DATE DEFAULT NULL
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
DECLARE v_tenant UUID := platform.tenant_actual(); v_lista NUMERIC; v_costo NUMERIC;
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.producto
                  WHERE tenant_id = v_tenant AND sku = trim(p_sku)) THEN
    RAISE EXCEPTION 'producto_inexistente' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(precio_unidad, precio_caja, precio_kilo) INTO v_lista
    FROM core.precio WHERE tenant_id = v_tenant AND sku = trim(p_sku)
      AND vigente_desde <= current_date ORDER BY vigente_desde DESC LIMIT 1;
  SELECT costo_unitario INTO v_costo
    FROM core.costo WHERE tenant_id = v_tenant AND sku = trim(p_sku)
      AND vigente_desde <= current_date ORDER BY vigente_desde DESC LIMIT 1;

  IF v_costo IS NOT NULL AND p_precio < v_costo THEN
    RAISE WARNING 'La oferta de % queda BAJO EL COSTO (% vs %)', p_sku, p_precio, v_costo;
  END IF;

  INSERT INTO core.oferta (tenant_id, sku, precio_oferta, motivo, detalle,
                           fecha_venc, rubros, vigente_hasta, creado_por)
       VALUES (v_tenant, trim(p_sku), p_precio, p_motivo, p_detalle,
               p_fecha_venc, p_rubros, p_vigente_hasta, platform.usuario_actual());

  RETURN CASE WHEN v_lista > 0
              THEN format('oferta creada · %s%% bajo lista', round(100*(v_lista-p_precio)/v_lista,1))
              ELSE 'oferta creada' END;
END $$;

CREATE OR REPLACE FUNCTION api.terminar_oferta(p_oferta UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, platform AS $$
BEGIN
  IF NOT platform.puede('editar_datos') THEN
    RAISE EXCEPTION 'sin_permiso' USING ERRCODE = '42501';
  END IF;
  -- Se cierra la vigencia, no se borra: hay que poder explicar a qué
  -- precio se vendió algo el mes pasado.
  UPDATE core.oferta SET vigente_hasta = current_date - 1
   WHERE id = p_oferta AND tenant_id = platform.tenant_actual();
  RETURN 'terminada';
END $$;

CREATE OR REPLACE VIEW api.ofertas
WITH (security_invoker = true) AS
SELECT o.id, o.tenant_id, o.sku, p.nombre AS producto, o.precio_oferta,
       o.motivo, o.detalle, o.fecha_venc, o.rubros,
       o.vigente_desde, o.vigente_hasta,
       (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date) AS vigente,
       (SELECT COALESCE(pr.precio_unidad, pr.precio_caja, pr.precio_kilo)
          FROM core.precio pr
         WHERE pr.tenant_id = o.tenant_id AND pr.sku = o.sku
           AND pr.vigente_desde <= current_date
         ORDER BY pr.vigente_desde DESC LIMIT 1) AS precio_lista,
       (SELECT s.stock_total FROM core.stock s
         WHERE s.tenant_id = o.tenant_id AND s.sku = o.sku LIMIT 1) AS stock
  FROM core.oferta o
  LEFT JOIN core.producto p ON p.tenant_id = o.tenant_id AND p.sku = o.sku;

GRANT SELECT ON api.ofertas TO authenticated;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'api.guardar_oferta(TEXT,NUMERIC,TEXT,TEXT,DATE,TEXT[],DATE)',
    'api.terminar_oferta(UUID)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
