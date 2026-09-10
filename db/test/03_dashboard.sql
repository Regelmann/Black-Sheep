-- ═══════════════════════════════════════════════════════════════════
-- PRUEBA DEL DASHBOARD · edición manual y su convivencia con el archivo
-- Se corre DESPUÉS de 02_ciclo.sql
-- ═══════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\set T '11111111-1111-1111-1111-111111111111'
SET request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;

\echo '── D1 · MOVER UN CLIENTE DE ZONA desde el dashboard'
SELECT api.guardar_cliente('76000011-2', p_zona => 'ZONA SUR', p_ejecutivo => 'ANA ROJAS') AS resultado;
SELECT cliente_key, zona_id, campos_manuales FROM core.cliente
 WHERE tenant_id = :'T' AND cliente_key = '76000011-2';

\echo ''
\echo '── D2 · LA MAESTRA VUELVE A SUBIR y dice NOR-ORIENTE otra vez'
SELECT api.registrar_carga('maestra','maestra_oct.xlsx','hash-maestra-002') AS lm2 \gset
SELECT api.agregar_filas(:'lm2'::uuid, '[
 {"RUT":"76000010-1","EJECUTIVO":"Ana Rojas","CANAL":"NOR-ORIENTE","RAZON SOCIAL":"CAFÉ CORDILLERA","COMUNA":"Lo Barnechea"},
 {"RUT":"76000011-2","EJECUTIVO":"Ana Rojas","CANAL":"NOR-ORIENTE","RAZON SOCIAL":"SUSHI KAI","COMUNA":"Vitacura"},
 {"RUT":"76000012-3","EJECUTIVO":"Luis Pinto","CANAL":"ZONA SUR","RAZON SOCIAL":"SIN EJECUTIVO SPA"}
]'::jsonb);
SELECT * FROM api.ejecutar_ciclo(:'lm2'::uuid);
SELECT * FROM api.publicar_lote(:'lm2'::uuid, 1.0, true);
\echo '   el cambio manual SOBREVIVE (sigue en ZONA SUR):'
SELECT cliente_key, zona_id, campos_manuales FROM core.cliente
 WHERE tenant_id = :'T' AND cliente_key = '76000011-2';
\echo '   y el desacuerdo queda registrado, no escondido:'
SELECT llave, campo, valor_archivo, valor_manual FROM api.conflictos ORDER BY llave, campo;

\echo ''
\echo '── D3 · RESOLVER el conflicto a favor del archivo'
SELECT id FROM api.conflictos WHERE llave='76000011-2' AND campo='zona_id' LIMIT 1 \gset
SELECT api.resolver_conflicto(:id, 'aceptar_archivo') AS resolucion;
SELECT cliente_key, zona_id, campos_manuales FROM core.cliente
 WHERE tenant_id = :'T' AND cliente_key = '76000011-2';

\echo ''
\echo '── D4 · PROSPECTO creado por el vendedor'
SELECT api.guardar_prospecto('PROSP-001','PANADERÍA LA ESPIGA','ANA ROJAS',
       p_comuna => 'Vitacura', p_rubro => 'PANADERIA') AS r;
SELECT cliente_key, nombre, ejecutivo_id, zona_id FROM api.prospectos;

\echo ''
\echo '── D5 · La maestra vuelve a subir SIN el prospecto'
SELECT api.registrar_carga('maestra','maestra_nov.xlsx','hash-maestra-003') AS lm3 \gset
SELECT api.agregar_filas(:'lm3'::uuid, '[
 {"RUT":"76000010-1","EJECUTIVO":"Ana Rojas","CANAL":"NOR-ORIENTE","RAZON SOCIAL":"CAFÉ CORDILLERA"},
 {"RUT":"76000011-2","EJECUTIVO":"Ana Rojas","CANAL":"NOR-ORIENTE","RAZON SOCIAL":"SUSHI KAI"},
 {"RUT":"76000012-3","EJECUTIVO":"Luis Pinto","CANAL":"ZONA SUR","RAZON SOCIAL":"SIN EJECUTIVO SPA"}
]'::jsonb);
SELECT * FROM api.ejecutar_ciclo(:'lm3'::uuid);
SELECT * FROM api.publicar_lote(:'lm3'::uuid, 1.0, true);
\echo '   el prospecto NO se desactivó (no está en la maestra y da igual):'
SELECT count(*) AS prospectos_vivos FROM api.prospectos;

\echo ''
\echo '── D6 · PRODUCTO NUEVO desde el dashboard, con precio y costo'
SELECT api.guardar_producto('P900','SALSA HANKS 3,6L', p_categoria => 'SALSAS', p_marca => 'HANKS') AS p;
SELECT api.guardar_precio('P900', p_precio_unidad => 8990) AS pr;
SELECT api.guardar_costo('P900', 6200) AS co;
SELECT api.guardar_stock('P900', 120) AS st;
SELECT sku, nombre, es_vendible, precio_unidad, stock_total
  FROM api.stock_vendible WHERE tenant_id = :'T' AND sku = 'P900';

\echo ''
\echo '── D7 · CAMBIO DE PRECIO con fecha: historiza, no pisa'
\echo '   (mismo día = corrige el de hoy · otra fecha = queda el histórico)'
SELECT api.guardar_precio('P100', p_precio_unidad => 13900) AS corrige_hoy;
SELECT api.guardar_precio('P100', p_precio_unidad => 14900,
                          p_vigente_desde => current_date + 1) AS precio_futuro;
SELECT sku, precio_unidad, vigente_desde, origen FROM core.precio
 WHERE tenant_id = :'T' AND sku='P100' ORDER BY vigente_desde;

\echo ''
\echo '── D8 · Un precio sin producto se rechaza con motivo claro'
DO $$ BEGIN
  PERFORM api.guardar_precio('NO-EXISTE', p_precio_unidad => 100);
  RAISE NOTICE 'FALLA: aceptó precio de un SKU inexistente';
EXCEPTION WHEN sqlstate 'P0002' THEN RAISE NOTICE 'OK · rechazado: producto_inexistente';
END $$;

\echo ''
\echo '── D9 · Un ejecutivo NO puede editar precios ni clientes'
RESET ROLE;
SET request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM api.guardar_precio('P100', p_precio_unidad => 1);
  RAISE NOTICE 'FALLA DE SEGURIDAD: un ejecutivo cambió un precio';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK · rechazado: sin_permiso';
END $$;
DO $$ BEGIN
  PERFORM api.guardar_cliente('76000010-1', p_zona => 'ZONA SUR');
  RAISE NOTICE 'FALLA DE SEGURIDAD: un ejecutivo movió un cliente de zona';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK · rechazado: sin_permiso';
END $$;
\echo '   pero SÍ puede levantar un prospecto en terreno:'
SELECT api.guardar_prospecto('PROSP-002','MINIMARKET EL SOL','ANA ROJAS', p_comuna => 'Vitacura') AS r;
RESET ROLE;
