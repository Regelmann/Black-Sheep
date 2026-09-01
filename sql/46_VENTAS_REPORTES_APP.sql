-- KEYFOODS V13.1 — capa definitiva de reportes para la app
-- Ejecutar después de 44_VENTAS_INTEGRACION_TOTAL.sql.

CREATE INDEX IF NOT EXISTS idx_vh_documento_tipo ON public.ventas_hechos(documento_key,tipo_hecho);
CREATE INDEX IF NOT EXISTS idx_vd_fecha_entrega ON public.ventas_documentos(fecha_entrega_solicitada);
CREATE INDEX IF NOT EXISTS idx_vh_fuente_fecha ON public.ventas_hechos(fuente,fecha);

CREATE OR REPLACE VIEW public.v_ventas_resumen_mensual AS
WITH hist AS (
  SELECT date_trunc('month',vl.fecha)::date mes,
         SUM(vl.venta_neta_clp) venta_historica,
         COUNT(DISTINCT vl.cliente_key) clientes_historicos,
         SUM(COALESCE(vl.cantidad,0)) cantidad_historica
  FROM public.ventas_lineas vl GROUP BY 1
), op AS (
  SELECT date_trunc('month',h.fecha)::date mes,
         SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='PEDIDO') pedido_neto,
         SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='FACTURA') facturado_neto,
         COALESCE(SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='NC'),0) nc_neto,
         SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='PEDIDO') kg_pedido,
         SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='FACTURA') kg_facturados,
         COALESCE(SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='NC'),0) kg_nc,
         COUNT(DISTINCT h.cliente_master_key) FILTER (WHERE h.tipo_hecho='FACTURA') clientes_facturados,
         SUM(COALESCE(h.cantidad,0)) FILTER (WHERE h.tipo_hecho='FACTURA') cantidad_facturada
  FROM public.ventas_hechos h WHERE h.fuente='NUEVO_OPERATIVO' GROUP BY 1
), meses AS (SELECT mes FROM hist UNION SELECT mes FROM op)
SELECT m.mes,
       COALESCE(o.pedido_neto,0) pedido_neto,
       COALESCE(o.facturado_neto,h.venta_historica,0) facturado_neto,
       COALESCE(o.nc_neto,0) nc_neto,
       CASE WHEN o.mes IS NOT NULL THEN COALESCE(o.facturado_neto,0)-COALESCE(o.nc_neto,0) ELSE COALESCE(h.venta_historica,0) END venta_neta_real,
       COALESCE(o.kg_pedido,0) kg_pedido, COALESCE(o.kg_facturados,0) kg_facturados, COALESCE(o.kg_nc,0) kg_nc,
       CASE WHEN COALESCE(o.kg_pedido,0)>0 THEN ROUND(100.0*COALESCE(o.kg_facturados,0)/o.kg_pedido,2) END fill_rate_kg,
       COALESCE(o.clientes_facturados,h.clientes_historicos,0) clientes_facturados,
       COALESCE(o.cantidad_facturada,h.cantidad_historica,0) cantidad
FROM meses m LEFT JOIN hist h USING(mes) LEFT JOIN op o USING(mes)
ORDER BY m.mes DESC;

CREATE OR REPLACE VIEW public.v_ventas_cliente AS
WITH hist AS (
  SELECT vl.cliente_key cliente_master_key, MAX(vl.nombre_cliente) nombre_cliente,
         SUM(vl.venta_neta_clp) venta_historica
  FROM public.ventas_lineas vl GROUP BY 1
), op AS (
  SELECT h.cliente_master_key,
         MAX(NULLIF(c.nombre_canon,'')) nombre_operativo,
         SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='PEDIDO') pedido_neto,
         SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='FACTURA') facturado_neto,
         COALESCE(SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='NC'),0) nc_neto,
         SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='PEDIDO') kg_pedido,
         SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='FACTURA') kg_facturados,
         MAX(h.fecha) FILTER (WHERE h.tipo_hecho='FACTURA') ultima_factura
  FROM public.ventas_hechos h LEFT JOIN public.ventas_clientes_mapa c USING(cliente_master_key)
  WHERE h.fuente='NUEVO_OPERATIVO' GROUP BY 1
)
SELECT COALESCE(o.cliente_master_key,h.cliente_master_key) cliente_master_key,
       COALESCE(o.nombre_operativo,h.nombre_cliente) nombre_cliente,
       COALESCE(o.pedido_neto,0) pedido_neto,
       COALESCE(o.facturado_neto,CASE WHEN o.cliente_master_key IS NULL THEN h.venta_historica ELSE 0 END,0) facturado_neto,
       COALESCE(o.nc_neto,0) nc_neto,
       CASE WHEN o.cliente_master_key IS NOT NULL THEN COALESCE(o.facturado_neto,0)-COALESCE(o.nc_neto,0) ELSE COALESCE(h.venta_historica,0) END venta_neta_real,
       COALESCE(o.kg_pedido,0) kg_pedido, COALESCE(o.kg_facturados,0) kg_facturados,
       CASE WHEN COALESCE(o.kg_pedido,0)>0 THEN ROUND(100.0*o.kg_facturados/o.kg_pedido,2) END fill_rate_kg,
       o.ultima_factura
FROM hist h FULL OUTER JOIN op o USING(cliente_master_key)
ORDER BY venta_neta_real DESC;

CREATE OR REPLACE VIEW public.v_ventas_producto AS
WITH hist AS (
  SELECT vl.sku_canon producto_master_key, MAX(vl.producto_nombre) producto, SUM(vl.venta_neta_clp) venta_historica
  FROM public.ventas_lineas vl WHERE vl.sku_canon IS NOT NULL GROUP BY 1
), op AS (
  SELECT h.producto_master_key, MAX(NULLIF(p.nombre_canon,'')) nombre_operativo,
         SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='PEDIDO') pedido_neto,
         SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='FACTURA') facturado_neto,
         COALESCE(SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='NC'),0) nc_neto,
         SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='PEDIDO') kg_pedido,
         SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='FACTURA') kg_facturados
  FROM public.ventas_hechos h LEFT JOIN public.ventas_productos_mapa p USING(producto_master_key)
  WHERE h.fuente='NUEVO_OPERATIVO' GROUP BY 1
)
SELECT COALESCE(o.producto_master_key,h.producto_master_key) producto_master_key,
       COALESCE(o.nombre_operativo,h.producto) producto,
       COALESCE(o.pedido_neto,0) pedido_neto,
       COALESCE(o.facturado_neto,CASE WHEN o.producto_master_key IS NULL THEN h.venta_historica ELSE 0 END,0) facturado_neto,
       COALESCE(o.nc_neto,0) nc_neto,
       CASE WHEN o.producto_master_key IS NOT NULL THEN COALESCE(o.facturado_neto,0)-COALESCE(o.nc_neto,0) ELSE COALESCE(h.venta_historica,0) END venta_neta_real,
       COALESCE(o.kg_pedido,0) kg_pedido, COALESCE(o.kg_facturados,0) kg_facturados,
       CASE WHEN COALESCE(o.kg_pedido,0)>0 THEN ROUND(100.0*o.kg_facturados/o.kg_pedido,2) END fill_rate_kg
FROM hist h FULL OUTER JOIN op o USING(producto_master_key)
ORDER BY venta_neta_real DESC;

CREATE OR REPLACE VIEW public.v_ventas_pedido_factura AS
SELECT d.documento_key,d.cliente_master_key,d.num_pedido,d.orden_compra,d.folio_factura,d.folio_nc,
       d.vendedor,d.estado_pedido,d.almacen,d.fecha_digitacion,d.fecha_entrega_solicitada,d.fecha_factura,d.fecha_nc,
       d.transporte,d.condicion_pago,d.region,d.comuna_despacho,d.direccion_despacho,
       SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='PEDIDO') pedido_neto,
       SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='FACTURA') factura_neto,
       COALESCE(SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='NC'),0) nc_neto,
       COALESCE(SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='FACTURA'),0)-COALESCE(SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='NC'),0) venta_neta_real,
       SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='PEDIDO') kg_pedido,
       SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='FACTURA') kg_facturados,
       COALESCE(SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='NC'),0) kg_nc,
       CASE WHEN SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='PEDIDO')>0 THEN ROUND(100.0*SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='FACTURA')/SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='PEDIDO'),2) END fill_rate_kg
FROM public.ventas_documentos d LEFT JOIN public.ventas_hechos h ON h.documento_key=d.documento_key
GROUP BY d.documento_key,d.cliente_master_key,d.num_pedido,d.orden_compra,d.folio_factura,d.folio_nc,d.vendedor,d.estado_pedido,d.almacen,
 d.fecha_digitacion,d.fecha_entrega_solicitada,d.fecha_factura,d.fecha_nc,d.transporte,d.condicion_pago,d.region,d.comuna_despacho,d.direccion_despacho;

CREATE OR REPLACE VIEW public.v_ventas_vendedor AS
SELECT COALESCE(NULLIF(TRIM(vendedor),''),'Sin vendedor') vendedor,
       SUM(total_neto) FILTER (WHERE tipo_hecho='PEDIDO') pedido_neto,
       SUM(total_neto) FILTER (WHERE tipo_hecho='FACTURA') facturado_neto,
       COALESCE(SUM(total_neto) FILTER (WHERE tipo_hecho='NC'),0) nc_neto,
       COALESCE(SUM(total_neto) FILTER (WHERE tipo_hecho='FACTURA'),0)-COALESCE(SUM(total_neto) FILTER (WHERE tipo_hecho='NC'),0) venta_neta_real,
       SUM(COALESCE(kg,0)) FILTER (WHERE tipo_hecho='PEDIDO') kg_pedido,
       SUM(COALESCE(kg,0)) FILTER (WHERE tipo_hecho='FACTURA') kg_facturados,
       CASE WHEN SUM(COALESCE(kg,0)) FILTER (WHERE tipo_hecho='PEDIDO')>0 THEN ROUND(100.0*SUM(COALESCE(kg,0)) FILTER (WHERE tipo_hecho='FACTURA')/SUM(COALESCE(kg,0)) FILTER (WHERE tipo_hecho='PEDIDO'),2) END fill_rate_kg,
       COUNT(DISTINCT documento_key) FILTER (WHERE tipo_hecho='FACTURA') facturas,
       COUNT(DISTINCT documento_key) FILTER (WHERE tipo_hecho='NC') documentos_con_nc
FROM public.ventas_hechos WHERE fuente='NUEVO_OPERATIVO' GROUP BY 1 ORDER BY venta_neta_real DESC;

CREATE OR REPLACE VIEW public.v_ventas_pedidos_pendientes AS
SELECT * FROM public.v_ventas_pedido_factura
WHERE COALESCE(factura_neto,0)=0 AND COALESCE(nc_neto,0)=0
  AND (estado_pedido IS NULL OR UPPER(estado_pedido) NOT LIKE '%ANUL%');

CREATE OR REPLACE VIEW public.v_ventas_calidad AS
SELECT
 (SELECT COUNT(*) FROM public.ventas_hechos WHERE fuente='NUEVO_OPERATIVO') hechos_operativos,
 (SELECT COUNT(*) FROM public.ventas_hechos WHERE fuente='NUEVO_OPERATIVO' AND tipo_hecho='PEDIDO') pedidos,
 (SELECT COUNT(*) FROM public.ventas_hechos WHERE fuente='NUEVO_OPERATIVO' AND tipo_hecho='FACTURA') facturas,
 (SELECT COUNT(*) FROM public.ventas_hechos WHERE fuente='NUEVO_OPERATIVO' AND tipo_hecho='NC') notas_credito,
 (SELECT COUNT(DISTINCT documento_key) FROM public.ventas_documentos WHERE fuente='NUEVO_OPERATIVO') documentos,
 (SELECT COUNT(*) FROM public.ventas_clientes_mapa WHERE estado='OBSERVADO') clientes_sin_conciliar,
 (SELECT COUNT(*) FROM public.ventas_productos_mapa WHERE estado='OBSERVADO') productos_sin_conciliar,
 (SELECT COUNT(*) FROM public.ventas_hechos WHERE fuente='NUEVO_OPERATIVO' AND cliente_master_key IS NULL) hechos_sin_cliente,
 (SELECT COUNT(*) FROM public.ventas_hechos WHERE fuente='NUEVO_OPERATIVO' AND producto_master_key IS NULL) hechos_sin_producto;

ALTER VIEW public.v_ventas_resumen_mensual SET (security_invoker = true);
ALTER VIEW public.v_ventas_cliente SET (security_invoker = true);
ALTER VIEW public.v_ventas_producto SET (security_invoker = true);
ALTER VIEW public.v_ventas_pedido_factura SET (security_invoker = true);
ALTER VIEW public.v_ventas_vendedor SET (security_invoker = true);
ALTER VIEW public.v_ventas_pedidos_pendientes SET (security_invoker = true);
ALTER VIEW public.v_ventas_calidad SET (security_invoker = true);
