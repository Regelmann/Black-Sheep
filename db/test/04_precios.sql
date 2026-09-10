-- ═══════════════════════════════════════════════════════════════════
-- PRECIO POR CLIENTE · lista, histórico y acordado
-- Se corre después de 02_ciclo.sql
-- ═══════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\set T '11111111-1111-1111-1111-111111111111'
SET request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;

\echo '── P0 · Escenario: SKU1 en lista $1.000; a este cliente se le vendió a $800'
RESET ROLE;
INSERT INTO core.producto (tenant_id, sku, nombre) VALUES
 (:'T','SKUP1','SALSA DEMO 1L'), (:'T','SKUP2','ACEITE DEMO 5L')
ON CONFLICT DO NOTHING;
INSERT INTO core.precio (tenant_id, sku, precio_unidad, vigente_desde) VALUES
 (:'T','SKUP1', 1000, current_date - 60),
 (:'T','SKUP2', 2500, current_date - 60)
ON CONFLICT DO NOTHING;
INSERT INTO core.stock (tenant_id, sku, stock_total) VALUES
 (:'T','SKUP1', 100), (:'T','SKUP2', 100) ON CONFLICT DO NOTHING;
-- 10 unidades por $8.000 = $800 cada una
INSERT INTO core.venta_linea (tenant_id, linea_id, cliente_key, fecha, sku,
  tipo_doc, documento, cantidad, monto_neto, lote_id) VALUES
 (:'T','PH1','76000010-1', current_date - 10, 'SKUP1','FA','9001', 10, 8000, gen_random_uuid())
ON CONFLICT DO NOTHING;
-- Y un dato malo: una línea de $50 la unidad contra una lista de $2.500
INSERT INTO core.venta_linea (tenant_id, linea_id, cliente_key, fecha, sku,
  tipo_doc, documento, cantidad, monto_neto, lote_id) VALUES
 (:'T','PH2','76000010-1', current_date - 5, 'SKUP2','FA','9002', 100, 5000, gen_random_uuid())
ON CONFLICT DO NOTHING;
SET ROLE authenticated;

\echo ''
\echo '   SKUP1 → debe dar 800 y origen historico:'
SELECT * FROM core.precio_para_cliente(:'T','76000010-1','SKUP1');
\echo '   SKUP2 → el histórico ($50 vs lista $2.500) está fuera de banda: cae a LISTA:'
SELECT * FROM core.precio_para_cliente(:'T','SKUP2'::text,'SKUP2');
SELECT * FROM core.precio_para_cliente(:'T','76000010-1','SKUP2');
\echo '   otro cliente SIN historial → precio de lista:'
SELECT * FROM core.precio_para_cliente(:'T','76000011-2','SKUP1');

\echo ''
\echo '── P1 · El dato malo queda VISIBLE, no escondido'
SELECT hallazgo, ref, detalle FROM api.integridad
 WHERE hallazgo = 'PRECIO_HISTORICO_FUERA_DE_BANDA';

\echo ''
\echo '── P2 · Gerencia acuerda $750 y eso gana sobre el histórico'
SELECT api.guardar_precio_cliente('76000010-1','SKUP1', 750, 'Acuerdo anual 2026') AS resultado;
SELECT * FROM core.precio_para_cliente(:'T','76000010-1','SKUP1');

\echo ''
\echo '── P3 · Lo que ve el vendedor al tomar el pedido'
SELECT sku, nombre, precio, origen, precio_lista, descuento_pct
  FROM api.precios_cliente('76000010-1') WHERE sku LIKE 'SKUP%' ORDER BY sku;

\echo ''
\echo '── P4 · El pedido COBRA lo mismo que muestra el catálogo'
SELECT api.crear_pedido(gen_random_uuid(), '76000010-1',
  '[{"sku":"SKUP1","cantidad":10},{"sku":"SKUP2","cantidad":2}]'::jsonb) AS pedido \gset
\echo '   esperado: 10 × 750 + 2 × 2500 = 12.500'
SELECT total_estimado FROM core.pedido WHERE id = :'pedido'::uuid;

\echo ''
\echo '── P5 · Se quita el acuerdo: vuelve al histórico ($800)'
SELECT api.quitar_precio_cliente('76000010-1','SKUP1') AS r;
SELECT * FROM core.precio_para_cliente(:'T','76000010-1','SKUP1');
RESET ROLE;
