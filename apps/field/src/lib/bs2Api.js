import { supabase } from './supabase.js'
import { safeSelect, explainError } from './query.js'

/**
 * Frontera única entre Field 1.54 y los read models de App 2.0.
 * Permite activar api.* por tenant sin romper instalaciones que todavía
 * sirven las vistas legacy del esquema public.
 */
export const BS2_RESOURCES = Object.freeze({
  cartera: { v2: 'cartera', legacy: 'cartera' },
  stock: { v2: 'stock_vendible', legacy: 'stock' },
  pedidos: { v2: 'pedidos_field', legacy: 'pedidos' },
  prospectos: { v2: 'prospectos', legacy: 'prospectos' },
  conflictos: { v2: 'conflictos' },
  ventasResumenMensual: { v2: 'v_ventas_resumen_mensual' },
  ventasCliente: { v2: 'v_ventas_cliente' },
  ventasProducto: { v2: 'v_ventas_producto' },
  ventasPedidoFactura: { v2: 'v_ventas_pedido_factura' },
  ventasPendientes: { v2: 'v_ventas_pedidos_pendientes' },
  ventasVendedor: { v2: 'v_ventas_vendedor' },
  ventasCalidad: { v2: 'v_ventas_calidad' },
  gerencia: { v2: 'gerencia', legacy: 'gerencia' },
  tendencia: { v2: 'tendencia', legacy: 'tendencia' },
  gerenciaClientes: { v2: 'gerencia_clientes', legacy: 'gerencia_clientes' },
  notasCliente: { v2: 'notas_cliente', legacy: 'notas_cliente' },
  ejecutivos: { v2: 'ejecutivos', legacy: 'ejecutivos' },
  zonasComunas: { v2: 'zonas_comunas', legacy: 'zonas_comunas' },
  metas: { v2: 'metas', legacy: 'metas' },
  focos: { v2: 'focos', legacy: 'focos' },
})

export const BS2_OPERATIONS = Object.freeze({
  guardarCliente: 'guardar_cliente',
  guardarProspecto: 'guardar_prospecto',
  convertirProspecto: 'convertir_prospecto',
  guardarProducto: 'guardar_producto',
  guardarPrecio: 'guardar_precio',
  guardarCosto: 'guardar_costo',
  guardarStock: 'guardar_stock',
  liberarCampo: 'liberar_campo',
  resolverConflicto: 'resolver_conflicto',
  publicarLote: 'publicar_lote',
  revertirLote: 'revertir_lote',
})

function isSchemaError(error) {
  const info = explainError(error)
  return info.kind === 'schema' || /schema|relation|not found/i.test(String(error?.message || ''))
}

function builderFor(schema, resource, columns, transform) {
  const client = schema ? supabase.schema(schema) : supabase
  const builder = client.from(resource).select(columns)
  return typeof transform === 'function' ? transform(builder) : builder
}

/** Lee primero el contrato App 2.0 y cae a V154 sólo si falta el modelo. */
export async function selectResource(name, columns = '*', options = {}) {
  const resource = BS2_RESOURCES[name] || { v2: name, legacy: name }
  const label = options.label || name
  const first = await safeSelect(builderFor('api', resource.v2, columns, options.transform), { label: `${label}:api` })
  if (first.ok || !resource.legacy || !isSchemaError(first.error)) return first
  return safeSelect(builderFor(null, resource.legacy, columns, options.transform), { label: `${label}:legacy` })
}

/** Ejecuta una mutación idempotente del contrato v2 y preserva el error. */
export async function callOperation(name, args = {}, options = {}) {
  const result = await supabase.schema('api').rpc(name, args)
  if (!result.error) return result
  if (options.legacyRpc) return supabase.rpc(options.legacyRpc, args)
  return result
}

export async function selectIngest(name, columns = '*', options = {}) {
  return selectResource(name, columns, { ...options, label: options.label || `ingest_${name}` })
}

export function isBs2SchemaError(error) {
  return isSchemaError(error)
}
