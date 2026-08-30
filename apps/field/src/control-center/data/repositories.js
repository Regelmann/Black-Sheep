import { supabase } from '../../lib/supabase.js'
import { listarPedidosHistorial, getPedidoById } from '../../lib/pedido.js'

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
export const catalogoRepo = { async cliente(clienteKey, limit = 500) { if (!clienteKey) return []; const { data, error } = await supabase.from('oferta_cliente_items').select('*').eq('cliente_key', String(clienteKey)).limit(limit); return result(data, error) } }
export const pedidosRepo = {
  async cliente(clienteKey, limit = 100) { if (!clienteKey) return []; const r = await listarPedidosHistorial({ clienteKey: String(clienteKey), dias: 0, limit }); if (r.error) throw r.error; return r.data || [] },
  async detalle(id) { const r = await getPedidoById(id); if (r.error) throw r.error; return r.data || null },
}

export const catalogPerformanceRepo = {
  async resumen() {
    const [{ data: ofertas, error: ofertasError }, { data: pedidos, error: pedidosError }] = await Promise.all([
      supabase.from('ofertas_cliente').select('id,cliente_key,activo,actualizado_en'),
      supabase.from('pedidos').select('id,cliente_key,estado,fuente,total_estimado,creado_en,lineas').order('creado_en', { ascending: false }).limit(5000),
    ])
    if (ofertasError) throw ofertasError
    if (pedidosError) throw pedidosError

    const activeKeys = new Set((ofertas || []).filter(o => o.activo).map(o => String(o.cliente_key)))
    const catalogOrders = (pedidos || []).filter(p => p.cliente_key && p.fuente === 'catalogo_publico' && activeKeys.has(String(p.cliente_key)))
    const totals = catalogOrders.reduce((a, p) => a + Number(p.total_estimado || 0), 0)
    const clients = new Set(catalogOrders.map(p => String(p.cliente_key)))
    const completed = catalogOrders.filter(p => !['borrador', 'cancelado'].includes(String(p.estado || '').toLowerCase()))
    const completedSales = completed.reduce((a, p) => a + Number(p.total_estimado || 0), 0)

    return {
      activeCatalogs: activeKeys.size,
      orders: catalogOrders.length,
      orderingClients: clients.size,
      sales: completedSales,
      avgTicket: completed.length ? completedSales / completed.length : 0,
      pendingOrders: catalogOrders.filter(p => ['borrador', 'recibido'].includes(String(p.estado || '').toLowerCase())).length,
      completedOrders: completed.length,
      source: 'catalogo_publico',
    }
  },
}

export const notasRepo = { async listar(limit = 300) { const { data, error } = await supabase.from('notas_cliente').select('*').limit(limit); return result(data, error) } }
