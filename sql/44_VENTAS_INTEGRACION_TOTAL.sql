-- Black Sheep V13.1 — integración total de NUEVAS VENTAS
-- Ejecutar UNA VEZ en Supabase SQL Editor antes del primer ciclo V1.38.

CREATE TABLE IF NOT EXISTS public.ventas_documentos (
  documento_key text PRIMARY KEY,
  cliente_master_key text,
  num_pedido text,
  orden_compra text,
  estado_pedido text,
  almacen text,
  fecha_digitacion date,
  hora_digitacion text,
  fecha_entrega_solicitada date,
  documento_factura text,
  folio_factura text,
  fecha_factura date,
  documento_nc text,
  folio_nc text,
  fecha_nc date,
  condicion_pago text,
  transporte text,
  vendedor text,
  usuario_digitador text,
  region text,
  comuna_despacho text,
  direccion_despacho text,
  comentario_ov text,
  comentario_factura text,
  comentario_nc text,
  fuente text NOT NULL DEFAULT 'NUEVO_OPERATIVO',
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vd_cliente_fecha ON public.ventas_documentos(cliente_master_key,fecha_factura DESC);
ALTER TABLE public.ventas_documentos ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'keyfoods';
CREATE INDEX IF NOT EXISTS idx_vd_tenant ON public.ventas_documentos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vd_pedido ON public.ventas_documentos(num_pedido);
CREATE INDEX IF NOT EXISTS idx_vd_factura ON public.ventas_documentos(folio_factura);
CREATE INDEX IF NOT EXISTS idx_vd_nc ON public.ventas_documentos(folio_nc);

CREATE TABLE IF NOT EXISTS public.ventas_hechos (
  hecho_id text PRIMARY KEY,
  documento_key text,
  cliente_master_key text,
  producto_master_key text,
  fecha date NOT NULL,
  tipo_hecho text NOT NULL CHECK (tipo_hecho IN ('HISTORICO','PEDIDO','FACTURA','NC')),
  cantidad numeric,
  kg numeric,
  cajas numeric,
  precio_unitario numeric,
  total_neto numeric NOT NULL DEFAULT 0,
  costo_unitario numeric,
  fuente text NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vh_fecha ON public.ventas_hechos(fecha);
ALTER TABLE public.ventas_hechos ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'keyfoods';
CREATE INDEX IF NOT EXISTS idx_vh_tenant ON public.ventas_hechos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vh_cliente_fecha ON public.ventas_hechos(cliente_master_key,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_vh_producto_fecha ON public.ventas_hechos(producto_master_key,fecha DESC);
CREATE INDEX IF NOT EXISTS idx_vh_tipo_fecha ON public.ventas_hechos(tipo_hecho,fecha DESC);

CREATE TABLE IF NOT EXISTS public.ventas_clientes_mapa (
  cliente_master_key text PRIMARY KEY,
  codigo_historico text,
  rut_cliente text,
  nombre_canon text,
  confianza numeric(5,4),
  estado text NOT NULL DEFAULT 'OBSERVADO',
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_vcm_rut ON public.ventas_clientes_mapa(rut_cliente) WHERE rut_cliente IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ventas_productos_mapa (
  producto_master_key text PRIMARY KEY,
  sku_historico text,
  sku_nuevo text,
  nombre_canon text,
  confianza numeric(5,4),
  estado text NOT NULL DEFAULT 'OBSERVADO',
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_vpm_sku_nuevo ON public.ventas_productos_mapa(sku_nuevo) WHERE sku_nuevo IS NOT NULL;

-- Resumen: la venta histórica completa proviene de ventas_lineas; la capa
-- operativa aporta la separación factura/NC y kilos. No se duplica el neto.
CREATE OR REPLACE VIEW public.v_ventas_resumen_mensual AS
WITH base AS (
  SELECT date_trunc('month',fecha)::date mes, SUM(venta_neta_clp) venta_neta_real,
         COUNT(DISTINCT cliente_key) clientes, SUM(COALESCE(cantidad,0)) cantidad
  FROM public.ventas_lineas GROUP BY 1
), op AS (
  SELECT date_trunc('month',fecha)::date mes,
    SUM(total_neto) FILTER (WHERE tipo_hecho='FACTURA') facturado_neto,
    SUM(total_neto) FILTER (WHERE tipo_hecho='NC') nc_neto,
    SUM(COALESCE(kg,0)) FILTER (WHERE tipo_hecho='FACTURA') kg_facturados,
    SUM(COALESCE(kg,0)) FILTER (WHERE tipo_hecho='NC') kg_nc
  FROM public.ventas_hechos GROUP BY 1
)
SELECT b.mes,
       COALESCE(o.facturado_neto, b.venta_neta_real) AS facturado_neto,
       COALESCE(o.nc_neto,0) AS nc_neto,
       b.venta_neta_real,
       o.kg_facturados, o.kg_nc,
       b.clientes AS clientes_facturados,
       b.cantidad
FROM base b LEFT JOIN op o USING(mes) ORDER BY b.mes DESC;

CREATE OR REPLACE VIEW public.v_ventas_cliente AS
WITH b AS (
 SELECT cliente_key AS cliente_master_key, MAX(nombre_cliente) nombre_cliente,
        SUM(venta_neta_clp) venta_neta_real
 FROM public.ventas_lineas GROUP BY 1
), o AS (
 SELECT cliente_master_key,
        SUM(total_neto) FILTER (WHERE tipo_hecho='FACTURA') facturado_neto,
        COALESCE(SUM(total_neto) FILTER (WHERE tipo_hecho='NC'),0) nc_neto,
        SUM(COALESCE(kg,0)) FILTER (WHERE tipo_hecho='FACTURA') kg_facturados,
        MAX(fecha) FILTER (WHERE tipo_hecho='FACTURA') ultima_factura
 FROM public.ventas_hechos GROUP BY 1
)
SELECT b.cliente_master_key,b.nombre_cliente,
       COALESCE(o.facturado_neto,b.venta_neta_real) facturado_neto,
       COALESCE(o.nc_neto,0) nc_neto,b.venta_neta_real,
       o.kg_facturados,o.ultima_factura
FROM b LEFT JOIN o USING(cliente_master_key)
ORDER BY b.venta_neta_real DESC;

CREATE OR REPLACE VIEW public.v_ventas_producto AS
WITH b AS (
 SELECT sku_canon AS producto_master_key, MAX(producto_nombre) producto,
        SUM(venta_neta_clp) venta_neta_real
 FROM public.ventas_lineas WHERE sku_canon IS NOT NULL GROUP BY 1
), o AS (
 SELECT producto_master_key,
        SUM(total_neto) FILTER (WHERE tipo_hecho='FACTURA') facturado_neto,
        COALESCE(SUM(total_neto) FILTER (WHERE tipo_hecho='NC'),0) nc_neto,
        SUM(COALESCE(kg,0)) FILTER (WHERE tipo_hecho='FACTURA') kg_facturados
 FROM public.ventas_hechos GROUP BY 1
)
SELECT b.producto_master_key,b.producto,
       COALESCE(o.facturado_neto,b.venta_neta_real) facturado_neto,
       COALESCE(o.nc_neto,0) nc_neto,b.venta_neta_real,o.kg_facturados
FROM b LEFT JOIN o USING(producto_master_key)
ORDER BY b.venta_neta_real DESC;

CREATE OR REPLACE VIEW public.v_ventas_pedido_factura AS
SELECT d.documento_key,d.cliente_master_key,d.num_pedido,d.folio_factura,d.folio_nc,
       d.vendedor,d.fecha_digitacion,d.fecha_entrega_solicitada,d.transporte,d.condicion_pago,
       SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='FACTURA') factura_neto,
       COALESCE(SUM(h.total_neto) FILTER (WHERE h.tipo_hecho='NC'),0) nc_neto,
       COALESCE(SUM(h.total_neto),0) venta_neta_real,
       SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='FACTURA') kg_facturados,
       SUM(COALESCE(h.kg,0)) FILTER (WHERE h.tipo_hecho='NC') kg_nc
FROM public.ventas_documentos d LEFT JOIN public.ventas_hechos h ON h.documento_key=d.documento_key
GROUP BY d.documento_key,d.cliente_master_key,d.num_pedido,d.folio_factura,d.folio_nc,d.vendedor,d.fecha_digitacion,d.fecha_entrega_solicitada,d.transporte,d.condicion_pago;

ALTER TABLE public.ventas_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_hechos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_clientes_mapa ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'keyfoods';
CREATE INDEX IF NOT EXISTS idx_ventas_clientes_mapa_tenant ON public.ventas_clientes_mapa(tenant_id);

ALTER TABLE public.ventas_clientes_mapa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas_productos_mapa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ventas_documentos_authenticated_read ON public.ventas_documentos;
DROP POLICY IF EXISTS ventas_hechos_authenticated_read ON public.ventas_hechos;
DROP POLICY IF EXISTS ventas_clientes_mapa_authenticated_read ON public.ventas_clientes_mapa;
DROP POLICY IF EXISTS ventas_productos_mapa_authenticated_read ON public.ventas_productos_mapa;
CREATE POLICY ventas_documentos_authenticated_read ON public.ventas_documentos FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(public.mi_tenant(), 'keyfoods'));
CREATE POLICY ventas_hechos_authenticated_read ON public.ventas_hechos FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(public.mi_tenant(), 'keyfoods'));
CREATE POLICY ventas_clientes_mapa_authenticated_read ON public.ventas_clientes_mapa FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(public.mi_tenant(), 'keyfoods'));
CREATE POLICY ventas_productos_mapa_authenticated_read ON public.ventas_productos_mapa FOR SELECT TO authenticated
  USING (tenant_id = COALESCE(public.mi_tenant(), 'keyfoods'));
