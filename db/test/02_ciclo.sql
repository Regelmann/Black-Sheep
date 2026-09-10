-- ═══════════════════════════════════════════════════════════════════
-- PRUEBA DEL CICLO · simula lo que hace una empresa desde su dashboard
--   sube archivo → corre su ciclo → revisa → publica → vuelve a subir
-- Todo como usuario de la empresa. Sin superadmin en ningún paso.
-- ═══════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\set T '11111111-1111-1111-1111-111111111111'

SET request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111"}}';
SET ROLE authenticated;

\echo '── C1 · MAESTRA con columnas del ERP del cliente (nombres distintos)'
SELECT api.registrar_carga('maestra','maestra_sept.xlsx','hash-maestra-001') AS lote \gset
SELECT api.agregar_filas(:'lote'::uuid, '[
 {"RUT":"76000010-1","EJECUTIVO":"Ana Rojas","CANAL":"NOR-ORIENTE","RAZON SOCIAL":"CAFÉ CORDILLERA","COMUNA":"Lo Barnechea","DIRECCION":"Av. La Dehesa 100"},
 {"RUT":"76000011-2","EJECUTIVO":"Ana Rojas","CANAL":"NOR-ORIENTE","RAZON SOCIAL":"SUSHI KAI","COMUNA":"Vitacura"},
 {"RUT":"76000012-3","EJECUTIVO":"","CANAL":"ZONA SUR","RAZON SOCIAL":"SIN EJECUTIVO SPA"}
]'::jsonb) AS filas_cargadas;
\echo '   Nota: RUT, CANAL y RAZON SOCIAL no son nombres canónicos. El mapeo los traduce.'
SELECT * FROM api.ejecutar_ciclo(:'lote'::uuid);
\echo '   la fila sin ejecutivo queda excluida CON MOTIVO, no desaparece:'
SELECT regla, filas FROM api.carga_exclusiones WHERE lote_id = :'lote'::uuid;
SELECT * FROM api.publicar_lote(:'lote'::uuid);
SELECT cliente_key, nombre, zona_id, ejecutivo_id FROM core.cliente
 WHERE tenant_id = :'T' AND lote_id = :'lote'::uuid ORDER BY cliente_key;

\echo ''
\echo '── C2 · PRECIOS'
SELECT api.registrar_carga('precios','precios.xlsx','hash-precios-001') AS lp \gset
SELECT api.agregar_filas(:'lp'::uuid, '[
 {"Código":"P100","Descripción":"ENTRAÑA CHOICE 17KG","Precio Unidad":"12.500","Categoría":"CARNES"},
 {"Código":"P200","Descripción":"ACEITE NEO PROFRY 5L","Precio Caja":"$61.500","Categoría":"ACEITES"},
 {"Código":"P300","Descripción":"PRODUCTO SIN PRECIO"}
]'::jsonb);
SELECT * FROM api.ejecutar_ciclo(:'lp'::uuid);
SELECT * FROM api.publicar_lote(:'lp'::uuid);
\echo '   precios normalizados desde "12.500" y "$61.500":'
SELECT sku, precio_unidad, precio_caja FROM core.precio
 WHERE tenant_id = :'T' AND lote_id = :'lp'::uuid ORDER BY sku;

\echo ''
\echo '── C3 · VENTAS · con NC, con documento anulado y con tipo desconocido'
SELECT api.registrar_carga('ventas','ventas_sept.xlsx','hash-ventas-001') AS lv \gset
SELECT api.agregar_filas(:'lv'::uuid, '[
 {"COD CLIENTE":"76000010-1","FECHA":"01-09-2026","CODIGO":"P100","NETO":"1.000.000","CANTIDAD":"10","TIPO":"FA","NUMERO":"5001"},
 {"COD CLIENTE":"76000010-1","FECHA":"02-09-2026","CODIGO":"P100","NETO":"190.000","CANTIDAD":"2","TIPO":"NC","NUMERO":"5001"},
 {"COD CLIENTE":"76000011-2","FECHA":"03-09-2026","CODIGO":"P200","NETO":"500.000","CANTIDAD":"8","TIPO":"FA","NUMERO":"5002","ESTADO":"ANULADO"},
 {"COD CLIENTE":"76000011-2","FECHA":"04-09-2026","CODIGO":"P200","NETO":"300.000","CANTIDAD":"5","TIPO":"GD","NUMERO":"5003"},
 {"COD CLIENTE":"76000099-9","FECHA":"05-09-2026","CODIGO":"P100","NETO":"250.000","CANTIDAD":"3","TIPO":"FA","NUMERO":"5004"}
]'::jsonb);
\echo '   se declara la venta oficial del período: 1.060.000'
SELECT * FROM api.ejecutar_ciclo(:'lv'::uuid, 1060000);
SELECT regla, filas FROM api.carga_exclusiones WHERE lote_id = :'lv'::uuid ORDER BY regla;
SELECT * FROM api.publicar_lote(:'lv'::uuid);
\echo '   venta neta en core (1.000.000 − 190.000 + 250.000 = 1.060.000):'
SELECT sum(monto_neto) AS venta_neta, count(*) AS lineas FROM core.venta_linea
 WHERE tenant_id = :'T' AND lote_id = :'lv'::uuid;

\echo ''
\echo '── C4 · IDEMPOTENCIA · el MISMO archivo, otra vez'
SELECT api.registrar_carga('ventas','ventas_sept.xlsx','hash-ventas-001') AS lv2 \gset
SELECT api.agregar_filas(:'lv2'::uuid, '[
 {"COD CLIENTE":"76000010-1","FECHA":"01-09-2026","CODIGO":"P100","NETO":"1.000.000","CANTIDAD":"10","TIPO":"FA","NUMERO":"5001"},
 {"COD CLIENTE":"76000010-1","FECHA":"02-09-2026","CODIGO":"P100","NETO":"190.000","CANTIDAD":"2","TIPO":"NC","NUMERO":"5001"}
]'::jsonb);
\echo '   el sistema avisa que ese hash ya se cargó:'
SELECT motivo_rechazo FROM api.cargas WHERE lote_id = :'lv2'::uuid;
SELECT * FROM api.ejecutar_ciclo(:'lv2'::uuid);
SELECT * FROM api.publicar_lote(:'lv2'::uuid);
\echo '   la venta NO se duplicó (sigue en 1.060.000):'
SELECT sum(monto_neto) AS venta_neta_total, count(*) AS lineas_totales
  FROM core.venta_linea WHERE tenant_id = :'T' AND cliente_key IN ('76000010-1','76000011-2','76000099-9');

\echo ''
\echo '── C5 · INCREMENTAL · sube sólo el día siguiente'
SELECT api.registrar_carga('ventas','ventas_dia_06.xlsx','hash-ventas-dia06') AS lv3 \gset
SELECT api.agregar_filas(:'lv3'::uuid, '[
 {"COD CLIENTE":"76000011-2","FECHA":"06-09-2026","CODIGO":"P200","NETO":"440.000","CANTIDAD":"7","TIPO":"FA","NUMERO":"5010"}
]'::jsonb);
SELECT * FROM api.ejecutar_ciclo(:'lv3'::uuid);
SELECT * FROM api.publicar_lote(:'lv3'::uuid);
\echo '   se SUMA al mes, no lo reemplaza (1.060.000 + 440.000 = 1.500.000):'
SELECT sum(monto_neto) AS venta_neta_mes FROM core.venta_linea
 WHERE tenant_id = :'T' AND cliente_key IN ('76000010-1','76000011-2','76000099-9');

\echo ''
\echo '── C6 · ARCHIVO TRUNCADO · la maestra llega con 1 de 3 clientes'
SELECT api.registrar_carga('maestra','maestra_mala.xlsx','hash-maestra-mala') AS lm \gset
SELECT api.agregar_filas(:'lm'::uuid, '[
 {"RUT":"76000010-1","EJECUTIVO":"Ana Rojas","CANAL":"NOR-ORIENTE","RAZON SOCIAL":"CAFÉ CORDILLERA"}
]'::jsonb);
SELECT * FROM api.ejecutar_ciclo(:'lm'::uuid);
\echo '   la compuerta NO publica: pide aprobación explícita'
SELECT * FROM api.publicar_lote(:'lm'::uuid);
\echo '   los clientes siguen intactos:'
SELECT count(*) AS clientes_activos FROM core.cliente
 WHERE tenant_id = :'T' AND activo AND cliente_key IN ('76000010-1','76000011-2','76000099-9');

\echo ''
\echo '── C7 · REVERTIR una publicación'
SELECT * FROM api.revertir_lote(:'lv3'::uuid);
\echo '   la venta vuelve a 1.060.000 y las otras cargas NO se tocaron:'
SELECT sum(monto_neto) AS venta_tras_revertir, count(*) AS lineas FROM core.venta_linea
 WHERE tenant_id = :'T' AND cliente_key IN ('76000010-1','76000011-2','76000099-9');

RESET ROLE;
