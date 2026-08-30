import { supabase } from '../../lib/supabase.js'
import { listarPedidosHistorial } from '../../lib/pedido.js'

function result(data, error) {
  if (error) throw error
  return data || []
}

export const ventasRepo = {
  async resumen() { const { data, error } = await supabase.from('gerencia').select('*'); return result(data, error) },
  async tendencia() { const { data, error } = await supabase.from('tendencia').select('*'); return result(data, error) },
}

export const clientesRepo = {
  async resumen(limit = 3000) { const { data, error } = await supabase.from('gerencia_clientes').select('*').order('venta_mtd', { ascending: false }).limit(limit); return result(data, error) },
  async cartera(ejecutivoId, limit = 800) { let q = supabase.from('cartera').select('*').limit(limit); if (ejecutivoId) q = q.eq('ejecutivo_id', ejecutivoId); const { data, error } = await q; return result(data, error) },
  async mix(clienteKey, limit = 800) { if (!clienteKey) return []; const { data, error } = await supabase.from('ventas_lineas').select('sku_canon,producto_nombre,cantidad,venta_neta_clp,fecha').eq('cliente_key', String(clienteKey)).order('fecha', { ascending: false }).limit(limit); return result(data, error) },
  async historial(clienteKey, limit = 120) { if (!clienteKey) return []; const { data, error } = await supabase.from('ventas_lineas').select('sku_canon,producto_nombre,cantidad,venta_neta_clp,fecha').eq('cliente_key', String(clienteKey)).order('fecha', { ascending: false }).limit(limit); return result(data, error) },
}

export const ejecutivosRepo = { async listar() { const { data, error } = await supabase.from('ejecutivos').select('id,nombre,zona,rol'); return result(data, error) } }
export const stockRepo = { async listar(limit = 500) { const { data, error } = await supabase.from('stock').select('*').limit(limit); return result(data, error) } }
export const catalogoRepo = { async cliente(clienteKey, limit = 500) { if (!clienteKey) return []; const { data, error } = await supabase.from('catalogo_b2b').select('*').eq('cliente_key', String(clienteKey)).limit(limit); return result(data, error) } }
export const pedidosRepo = { async cliente(clienteKey, limit = 100) { if (!clienteKey) return []; const r = await listarPedidosHistorial({ clienteKey: String(clienteKey), dias: 0, limit }); if (r.error) throw r.error; return r.data || [] } }
export const notasRepo = { async listar(limit = 300) { const { data, error } = await supabase.from('notas_cliente').select('*').limit(limit); return result(data, error) } }
