-- ═══════════════════════════════════════════════════════════════════
-- SEGUNDO TENANT · la prueba que importa
--
-- Una distribuidora DELIBERADAMENTE distinta de KeyFoods:
--   · columnas con otros nombres (ARTICULO, CLIENTE, IMPORTE…)
--   · otros códigos de documento (33, 61, 52 · el formato del SII)
--   · otro estado que anula (NULA en vez de ANULADO)
--   · no mide por SKU: capacidad foco_sku apagada
--   · sin costos: capacidad costos_margen apagada
--
-- Si esto funciona SIN UNA LÍNEA de código nuevo, es multitenancy.
-- Si hubiera que tocar algo, es "KeyFoods con otro nombre".
-- ═══════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\set B '33333333-3333-3333-3333-333333333333'

-- ─── Alta, como la haría el Control Center ─────────────────────────
INSERT INTO platform.tenants (id, slug, nombre, color) VALUES
 (:'B','austral-foods','Austral Foods','#c2410c');
INSERT INTO platform.suscripcion (tenant_id, plan, estado, monto_mensual, vigente_hasta)
 VALUES (:'B','terreno','trial', 150000, current_date + 30);
SELECT platform.sembrar_capacidades(:'B');

-- Esta empresa NO mide por producto ni lleva costos.
INSERT INTO platform.tenant_capacidad (tenant_id, capacidad, activa) VALUES
 (:'B','foco_sku', false), (:'B','venta_por_sku', false), (:'B','costos_margen', false)
ON CONFLICT (tenant_id, capacidad) DO UPDATE SET activa = EXCLUDED.activa;

INSERT INTO platform.usuarios (id, email, nombre)
 VALUES ('dddddddd-0000-0000-0000-000000000001','ger@austral.cl','Gerente Austral');
INSERT INTO platform.membresias (usuario_id, tenant_id, rol)
 VALUES ('dddddddd-0000-0000-0000-000000000001', :'B', 'gerencia');

-- ─── Sus códigos de documento, en formato SII ──────────────────────
INSERT INTO core.tipo_documento (tenant_id, codigo, descripcion, cuenta_como_venta, signo) VALUES
 (:'B','33','Factura electrónica', true,  1),
 (:'B','39','Boleta electrónica',  true,  1),
 (:'B','61','Nota de crédito',     true, -1),
 (:'B','52','Guía de despacho',    false, 1);
INSERT INTO core.estado_excluido (tenant_id, estado) VALUES (:'B','NULA');

-- ─── Alias propios de columna: gana el del tenant ──────────────────
INSERT INTO ingest.mapeo_columna (tenant_id, tipo, canonica, alias_norm) VALUES
 (:'B','ventas','sku',         ingest.norm_texto('ARTICULO')),
 (:'B','ventas','cliente_key', ingest.norm_texto('CLIENTE')),
 (:'B','ventas','monto',       ingest.norm_texto('IMPORTE')),
 (:'B','ventas','tipo_doc',    ingest.norm_texto('DTE')),
 (:'B','ventas','fecha',       ingest.norm_texto('EMISION')),
 (:'B','ventas','cantidad',    ingest.norm_texto('UNIDADES')),
 (:'B','maestra','cliente_key',ingest.norm_texto('CLIENTE')),
 (:'B','maestra','ejecutivo',  ingest.norm_texto('RESPONSABLE')),
 (:'B','maestra','zona',       ingest.norm_texto('TERRITORIO')),
 (:'B','maestra','nombre',     ingest.norm_texto('FANTASIA')),
 (:'B','precios','sku',        ingest.norm_texto('ARTICULO')),
 (:'B','precios','nombre',     ingest.norm_texto('GLOSA')),
 (:'B','precios','precio_unidad', ingest.norm_texto('VALOR'));

SET request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"33333333-3333-3333-3333-333333333333"}}';
SET ROLE authenticated;

\echo '── A1 · Carga la maestra con SUS nombres de columna'
SELECT api.registrar_carga('maestra','clientes_austral.xlsx','hash-austral-m1') AS lm \gset
SELECT api.agregar_filas(:'lm'::uuid, '[
 {"CLIENTE":"90111000-1","RESPONSABLE":"Marta Silva","TERRITORIO":"SUR","FANTASIA":"HOTEL PATAGONIA"},
 {"CLIENTE":"90111001-2","RESPONSABLE":"Marta Silva","TERRITORIO":"SUR","FANTASIA":"CASINO AUSTRAL"}
]'::jsonb);
SELECT * FROM api.ejecutar_ciclo(:'lm'::uuid);
SELECT * FROM api.publicar_lote(:'lm'::uuid);

\echo ''
\echo '── A2 · Su lista de precios'
SELECT api.registrar_carga('precios','articulos.xlsx','hash-austral-p1') AS lp \gset
SELECT api.agregar_filas(:'lp'::uuid, '[
 {"ARTICULO":"A-100","GLOSA":"MERLUZA AUSTRAL 5KG","VALOR":"18.900"},
 {"ARTICULO":"A-200","GLOSA":"CENTOLLA 1KG","VALOR":"32.500"}
]'::jsonb);
SELECT * FROM api.ejecutar_ciclo(:'lp'::uuid);
SELECT * FROM api.publicar_lote(:'lp'::uuid);

\echo ''
\echo '── A3 · Ventas con documentos SII: 33 suma, 61 resta, 52 no cuenta, NULA se excluye'
SELECT api.registrar_carga('ventas','ventas_austral.xlsx','hash-austral-v1') AS lv \gset
SELECT api.agregar_filas(:'lv'::uuid, '[
 {"CLIENTE":"90111000-1","EMISION":"02-09-2026","ARTICULO":"A-100","IMPORTE":"2.000.000","UNIDADES":"100","DTE":"33"},
 {"CLIENTE":"90111000-1","EMISION":"03-09-2026","ARTICULO":"A-100","IMPORTE":"300.000","UNIDADES":"15","DTE":"61"},
 {"CLIENTE":"90111001-2","EMISION":"04-09-2026","ARTICULO":"A-200","IMPORTE":"900.000","UNIDADES":"30","DTE":"52"},
 {"CLIENTE":"90111001-2","EMISION":"05-09-2026","ARTICULO":"A-200","IMPORTE":"500.000","UNIDADES":"16","DTE":"33","ESTADO":"NULA"},
 {"CLIENTE":"90111001-2","EMISION":"06-09-2026","ARTICULO":"A-200","IMPORTE":"650.000","UNIDADES":"20","DTE":"33"}
]'::jsonb);
\echo '   venta oficial declarada: 2.350.000'
SELECT * FROM api.ejecutar_ciclo(:'lv'::uuid, 2350000);
SELECT regla, filas FROM api.carga_exclusiones WHERE lote_id = :'lv'::uuid ORDER BY regla;
SELECT * FROM api.publicar_lote(:'lv'::uuid);

\echo ''
\echo '   venta neta: 2.000.000 − 300.000 + 650.000 = 2.350.000'
SELECT sum(monto_neto) AS venta_neta, count(*) AS lineas
  FROM core.venta_linea WHERE tenant_id = :'B';

\echo ''
\echo '── A4 · Sus capacidades: no mide por SKU ni lleva costos'
SELECT codigo, activa FROM api.mis_capacidades
 WHERE codigo IN ('foco_sku','venta_por_sku','costos_margen','metas_ejecutivo') ORDER BY codigo;

\echo ''
\echo '── A5 · Su cartera y su precio por cliente funcionan igual'
SELECT cliente_key, nombre, zona_id, ejecutivo_id, venta_mtd FROM api.cartera ORDER BY cliente_key;
\echo '   A-100: se le vendió a 20.000 (2.000.000/100) sobre lista de 18.900'
SELECT * FROM core.precio_para_cliente(:'B','90111000-1','A-100');

\echo ''
\echo '── A6 · AISLAMIENTO: Austral no ve NADA de la otra empresa'
SELECT count(*) AS clientes_visibles FROM api.cartera;
SELECT count(*) AS ventas_visibles FROM core.venta_linea;
RESET ROLE;
\echo '   (en la base hay clientes y ventas de las tres empresas)'
SELECT count(*) AS total_clientes_en_la_base FROM core.cliente;

\echo ''
\echo '── A7 · Ciclo de vida: se da de baja y se archiva. NADA se borra.'
SET request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000009","app_metadata":{"rol_plataforma":"superadmin"}}';
SET ROLE authenticated;
SELECT api.admin_dar_de_baja(:'B','No renovó tras la prueba') AS baja;
SELECT api.admin_archivar(:'B') AS archivo;
RESET ROLE;
SELECT estado, motivo_baja, archivada_en IS NOT NULL AS archivada FROM platform.suscripcion WHERE tenant_id = :'B';
\echo '   sus datos siguen enteros en la base:'
SELECT count(*) AS clientes, (SELECT count(*) FROM core.venta_linea WHERE tenant_id = :'B') AS ventas
  FROM core.cliente WHERE tenant_id = :'B';
\echo '   pero su gerente ya no ve nada:'
SET request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"33333333-3333-3333-3333-333333333333"}}';
SET ROLE authenticated;
SELECT count(*) AS ve_despues_de_archivar FROM api.cartera;
RESET ROLE;
