-- ═══════════════════════════════════════════════════════════════════
-- SMOKE TEST · prueba que la arquitectura hace lo que dice
--   1 · aislamiento entre empresas (D-10)
--   2 · las notas de crédito restan (D-06)
--   3 · la regla de elegibilidad invertida (D-05)
--   4 · datos personales requieren permiso
--   5 · el catálogo público valida token por hash (D-09)
-- Se corre sobre una base desechable. NUNCA contra producción.
-- ═══════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

-- ─── Datos de prueba ───────────────────────────────────────────────
INSERT INTO platform.tenants (id, slug, nombre) VALUES
 ('11111111-1111-1111-1111-111111111111','empresa-a','Empresa A'),
 ('22222222-2222-2222-2222-222222222222','empresa-b','Empresa B');

INSERT INTO platform.usuarios (id, email, nombre) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','eje@a.cl','Ejecutivo A'),
 ('bbbbbbbb-0000-0000-0000-000000000001','ger@a.cl','Gerencia A');

INSERT INTO platform.membresias (usuario_id, tenant_id, rol) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','ejecutivo'),
 ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','gerencia');

INSERT INTO core.tipo_documento (tenant_id, codigo, descripcion, cuenta_como_venta, signo) VALUES
 ('11111111-1111-1111-1111-111111111111','FA','Factura',      true,  1),
 ('11111111-1111-1111-1111-111111111111','NC','Nota crédito', true, -1),
 ('11111111-1111-1111-1111-111111111111','GD','Guía despacho',false, 1),
 ('22222222-2222-2222-2222-222222222222','FA','Factura',      true,  1);

INSERT INTO core.estado_excluido (tenant_id, estado) VALUES
 ('11111111-1111-1111-1111-111111111111','ANULADO');

INSERT INTO core.zona (tenant_id, id, nombre) VALUES
 ('11111111-1111-1111-1111-111111111111','NOR-ORIENTE','Nor Oriente'),
 ('22222222-2222-2222-2222-222222222222','SUR','Sur');

INSERT INTO core.ejecutivo (tenant_id, id, nombre, usuario_id, zona_id) VALUES
 ('11111111-1111-1111-1111-111111111111','E1','Ejecutivo A',
  'aaaaaaaa-0000-0000-0000-000000000001','NOR-ORIENTE');

INSERT INTO core.cliente (tenant_id, cliente_key, nombre, comuna, lat, lng, zona_id, ejecutivo_id) VALUES
 ('11111111-1111-1111-1111-111111111111','76000001-1','Hotel Uno','VITACURA',-33.39,-70.57,'NOR-ORIENTE','E1'),
 ('22222222-2222-2222-2222-222222222222','77000002-2','Bar Dos','PUENTE ALTO',-33.60,-70.57,'SUR',NULL);

INSERT INTO core.cliente_contacto (tenant_id, cliente_key, nombre, telefono) VALUES
 ('11111111-1111-1111-1111-111111111111','76000001-1','Patricio M.','+56900000000');

INSERT INTO core.producto (tenant_id, sku, nombre) VALUES
 ('11111111-1111-1111-1111-111111111111','SKU1','Entraña Choice 17kg'),
 ('11111111-1111-1111-1111-111111111111','SKU2','Aceite Neo Profry 5L');
INSERT INTO core.precio (tenant_id, sku, precio_unidad) VALUES
 ('11111111-1111-1111-1111-111111111111','SKU1', 10000);
INSERT INTO core.stock (tenant_id, sku, stock_total) VALUES
 ('11111111-1111-1111-1111-111111111111','SKU1', 50),
 ('11111111-1111-1111-1111-111111111111','SKU2', 20);   -- con stock y SIN precio

INSERT INTO core.oferta_cliente (tenant_id, cliente_key, skus) VALUES
 ('11111111-1111-1111-1111-111111111111','76000001-1', ARRAY['SKU1','SKU2']);

-- Venta: 1.000.000 de factura, 190.000 de NC, y una anulada que no cuenta
INSERT INTO core.venta_linea
 (tenant_id, linea_id, cliente_key, fecha, sku, tipo_doc, documento, estado_pedido,
  cantidad, monto_neto, lote_id) VALUES
 ('11111111-1111-1111-1111-111111111111','L1','76000001-1',current_date,'SKU1','FA','100',NULL,
  10, 1000000, gen_random_uuid()),
 ('11111111-1111-1111-1111-111111111111','L2','76000001-1',current_date,'SKU1','NC','100',NULL,
  2, -190000, gen_random_uuid());

INSERT INTO core.meta (tenant_id, ejecutivo_id, mes, monto) VALUES
 ('11111111-1111-1111-1111-111111111111','E1',date_trunc('month',current_date)::date, 2000000);

-- ─── Sesión: ejecutivo de la Empresa A ─────────────────────────────
SET request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;

\echo '── 1 · AISLAMIENTO: sólo debe verse el cliente de la Empresa A'
SELECT cliente_key, nombre FROM api.cartera ORDER BY cliente_key;

\echo '── 2 · VENTA NETA: 1.000.000 − 190.000 = 810.000 (la NC RESTA)'
SELECT venta_mtd, meta_mes, avance_pct FROM api.mi_dia;

\echo '── 3 · ELEGIBILIDAD (D-05): FA sí, GD no, FA+ANULADO no, FA con estado vacío SÍ'
SELECT core.venta_elegible('11111111-1111-1111-1111-111111111111','FA',NULL)      AS fa_sin_estado,
       core.venta_elegible('11111111-1111-1111-1111-111111111111','FA','Cerrado') AS fa_cerrado,
       core.venta_elegible('11111111-1111-1111-1111-111111111111','FA','ANULADO') AS fa_anulado,
       core.venta_elegible('11111111-1111-1111-1111-111111111111','GD',NULL)      AS guia;

\echo '── 4 · STOCK: SKU2 tiene stock y NO es vendible (sin precio), pero se VE'
SELECT sku, stock_total, es_vendible, motivo_no_vendible FROM api.stock_vendible ORDER BY sku;

\echo '── 5 · INTEGRIDAD: SKU con stock y sin precio aparece como hallazgo'
SELECT hallazgo, ref FROM api.integridad ORDER BY hallazgo, ref;

\echo '── 6 · DATO PERSONAL: el ejecutivo TIENE permiso ver_contacto → 1 fila'
SELECT count(*) AS contactos_visibles FROM core.cliente_contacto;

RESET ROLE;

\echo '── 7 · Rol SIN permiso ver_contacto (solo_lectura) → 0 filas'
INSERT INTO platform.usuarios (id,email,nombre) VALUES ('cccccccc-0000-0000-0000-000000000001','ro@a.cl','Solo Lectura');
INSERT INTO platform.membresias (usuario_id,tenant_id,rol) VALUES
 ('cccccccc-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','solo_lectura');
SET request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;
SELECT count(*) AS contactos_visibles_solo_lectura FROM core.cliente_contacto;

\echo '── 8 · INTENTO DE CRUCE: pedir el tenant B con un token del tenant A'
SET request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"22222222-2222-2222-2222-222222222222"}}';
SELECT count(*) AS filas_que_logra_ver FROM api.cartera;
RESET ROLE;

\echo '── 9 · CATÁLOGO PÚBLICO: emitir → consultar → revocar (D-09)'
SET request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;
SELECT api.emitir_token_catalogo('76000001-1') AS token \gset
\echo '   el token NO queda en la base, sólo su hash:'
RESET ROLE;
SELECT (SELECT count(*) FROM core.catalog_token WHERE token_hash = :'token') AS guardado_en_claro,
       (SELECT count(*) FROM core.catalog_token WHERE token_hash = api.hash_token(:'token')) AS guardado_hasheado;
SET ROLE anon;
\echo '   anon consulta el catálogo con el token (sólo SKU vendibles):'
SELECT sku, nombre, precio_unidad, hay_stock FROM api.get_catalogo(:'token');
\echo '   anon NO tiene acceso a la cartera (debe decir f):'
SELECT has_table_privilege('anon','api.cartera','SELECT') AS anon_ve_cartera;
RESET ROLE;

\echo '── 10 · SUSCRIPCIÓN: sin fila de suscripción, la empresa NO opera (fail-closed)'
SET request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;
SELECT count(*) AS cartera_sin_suscripcion FROM api.cartera;
RESET ROLE;

INSERT INTO platform.suscripcion (tenant_id, plan, estado, monto_mensual, vigente_hasta) VALUES
 ('11111111-1111-1111-1111-111111111111','base','activa',150000, current_date + 20),
 ('22222222-2222-2222-2222-222222222222','base','activa',150000, current_date + 20);

SET ROLE authenticated;
\echo '   con suscripción activa vuelve a ver su cartera:'
SELECT count(*) AS cartera_con_suscripcion FROM api.cartera;
RESET ROLE;

-- El superadmin también es un usuario: las FK de pago y auditoría exigen
-- que el actor exista. Un registro con actor inventado no es evidencia.
INSERT INTO platform.usuarios (id, email, nombre)
VALUES ('99999999-0000-0000-0000-000000000009','admin@black-sheep.cl','Superadmin');

\echo '── 11 · CORTE POR NO PAGO: el superadmin suspende y la app se apaga'
SET request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000009","app_metadata":{"rol_plataforma":"superadmin","tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;
SELECT api.admin_set_suscripcion('11111111-1111-1111-1111-111111111111','suspendida', NULL, 'impago septiembre');
RESET ROLE;
SET request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;
SELECT count(*) AS cartera_suspendida  FROM api.cartera;
SELECT count(*) AS ventas_suspendida   FROM core.venta_linea;
RESET ROLE;
\echo '   los datos NO se borraron, siguen en la tabla:'
SELECT count(*) AS filas_reales_en_la_tabla FROM core.cliente
 WHERE tenant_id = '11111111-1111-1111-1111-111111111111';

\echo '── 12 · GRACIA: morosa dentro del plazo sigue trabajando; vencida, no'
UPDATE platform.suscripcion SET estado='morosa', vigente_hasta = current_date - 2
 WHERE tenant_id = '11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SELECT count(*) AS morosa_en_gracia FROM api.cartera;
RESET ROLE;
UPDATE platform.suscripcion SET vigente_hasta = current_date - 30
 WHERE tenant_id = '11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SELECT count(*) AS morosa_gracia_vencida FROM api.cartera;
RESET ROLE;

\echo '── 13 · PAGO: se registra y la empresa vuelve sola'
SET request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000009","app_metadata":{"rol_plataforma":"superadmin","tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;
SELECT api.admin_registrar_pago('11111111-1111-1111-1111-111111111111', current_date, 150000, 'OP-1234', 1);
RESET ROLE;
SET request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;
SELECT count(*) AS cartera_reactivada FROM api.cartera;
RESET ROLE;

\echo '── 14 · CONSOLA: sólo el superadmin ve la lista de empresas'
SET request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM * FROM api.admin_empresas();
  RAISE NOTICE 'FALLA DE SEGURIDAD: un ejecutivo pudo listar TODAS las empresas';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'OK · rechazado: sin_permiso';
END $$;
RESET ROLE;
SET request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000009","app_metadata":{"rol_plataforma":"superadmin"}}';
SET ROLE authenticated;
SELECT slug, estado, habilitado, usuarios, clientes, venta_mtd FROM api.admin_empresas();
RESET ROLE;

\echo '── 15 · CAPACIDADES: una empresa que no mide por SKU no puede marcar focos'
INSERT INTO platform.tenant_capacidad (tenant_id, capacidad, activa)
VALUES ('11111111-1111-1111-1111-111111111111','foco_sku', false)
ON CONFLICT (tenant_id, capacidad) DO UPDATE SET activa = false;
SET request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM api.set_foco(current_date, 'SKU1', 100, '*');
  RAISE NOTICE 'FALLA: marcó un foco con la capacidad apagada';
EXCEPTION WHEN feature_not_supported THEN
  RAISE NOTICE 'OK · rechazado: capacidad_desactivada';
END $$;
\echo '   pero las metas por ejecutivo sí, porque esa capacidad está activa:'
SELECT api.set_meta('E1', current_date, 2500000);
SELECT codigo, activa FROM api.mis_capacidades
 WHERE codigo IN ('foco_sku','metas_ejecutivo','costos_margen') ORDER BY codigo;
RESET ROLE;
