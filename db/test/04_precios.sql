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

\echo ''
\echo '── P6 · EL CATÁLOGO DEL CLIENTE, en una llamada'
INSERT INTO core.catalog_token (tenant_id, token_hash, cliente_key, expira_en)
VALUES (:'T', encode(digest(convert_to('TOKENdePRUEBA1234567890','UTF8'),'sha256'),'hex'),
        '76000010-1', now() + interval '30 days')
ON CONFLICT DO NOTHING;
SET ROLE anon;
\echo '   empresa y cliente:'
SELECT api.catalogo('TOKENdePRUEBA1234567890') -> 'empresa' AS empresa,
       api.catalogo('TOKENdePRUEBA1234567890') -> 'cliente' AS cliente;
\echo '   lo que compra siempre (del histórico, no de una lista):'
SELECT jsonb_pretty(api.catalogo('TOKENdePRUEBA1234567890') -> 'habituales') AS habituales;
\echo '   su precio, no el de lista (SKUP1: 800 histórico vs 1000 lista):'
SELECT p->>'sku' AS sku, p->>'precio' AS precio, p->>'precio_lista' AS lista, p->>'origen_precio' AS origen
  FROM jsonb_array_elements(api.catalogo('TOKENdePRUEBA1234567890') -> 'productos') p
 WHERE p->>'sku' LIKE 'SKUP%' ORDER BY 1;
\echo '   un token inventado no abre nada:'
DO $$ BEGIN
  PERFORM api.catalogo('estoNOesUnTokenValido123');
  RAISE NOTICE 'FALLA DE SEGURIDAD: abrió con un token falso';
EXCEPTION WHEN sqlstate '28000' THEN RAISE NOTICE 'OK · rechazado: token_invalido';
END $$;
RESET ROLE;

\echo ''
\echo '── P7 · OFERTAS · nunca pueden subirle el precio a nadie'
SET request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;
\echo '   este cliente tiene SKUP1 a 800 por histórico. Oferta general a 900:'
SELECT api.guardar_oferta('SKUP1', 900, 'stock', 'Liquidación de bodega') AS r;
\echo '   su precio NO sube: sigue en 800'
SELECT * FROM core.precio_para_cliente(:'T','76000010-1','SKUP1');
\echo '   ahora una oferta a 700, que SÍ lo mejora:'
SELECT api.guardar_oferta('SKUP1', 700, 'vencimiento', 'Vence este mes',
                          p_fecha_venc => current_date + 20) AS r;
SELECT * FROM core.precio_para_cliente(:'T','76000010-1','SKUP1');
\echo '   y el pedido cobra lo mismo que muestra (10 × 700 = 7.000):'
SELECT api.crear_pedido(gen_random_uuid(), '76000010-1',
  '[{"sku":"SKUP1","cantidad":10}]'::jsonb) AS ped \gset
SELECT total_estimado FROM core.pedido WHERE id = :'ped'::uuid;

\echo ''
\echo '── P8 · OFERTA POR RUBRO · no le llega a quien no corresponde'
RESET ROLE;
UPDATE core.cliente SET rubro = 'PIZZERIA' WHERE tenant_id = :'T' AND cliente_key = '76000010-1';
UPDATE core.cliente SET rubro = 'FERRETERIA' WHERE tenant_id = :'T' AND cliente_key = '76000011-2';
SET ROLE authenticated;
SELECT api.guardar_oferta('SKUP2', 1200, 'precio', 'Promoción pizzerías',
                          p_rubros => ARRAY['PIZZERIA']) AS r;
\echo '   la pizzería la recibe (1200):'
SELECT precio, origen FROM core.precio_para_cliente(:'T','76000010-1','SKUP2');
\echo '   la ferretería NO (se queda en lista, 2500):'
SELECT precio, origen FROM core.precio_para_cliente(:'T','76000011-2','SKUP2');
RESET ROLE;
