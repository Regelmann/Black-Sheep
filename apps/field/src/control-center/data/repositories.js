import { supabase } from '../../lib/supabase.js'

function result(data, error) {
  if (error) throw error
  return data || []
}

export const ventasRepo = {
  async resumen() {
    return result(...await Promise.resolve(supabase.from('gerencia').select('*')))
  },
  async tendencia() {
    return result(...await Promise.resolve(supabase.from('tendencia').select('*')))
  },
}

export const clientesRepo = {
  async resumen(limit = 3000) {
    return result(...await Promise.resolve(
      supabase.from('gerencia_clientes').select('*').order('venta_mtd', { ascending: false }).limit(limit)
    ))
  },
  async cartera(ejecutivoId, limit = 800) {
    let q = supabase.from('cartera').select('*').limit(limit)
    if (ejecutivoId) q = q.eq('ejecutivo_id', ejecutivoId)
    return result(...await Promise.resolve(q))
  },
  async mix(clienteKey, limit = 800) {
    if (!clienteKey) return []
    return result(...await Promise.resolve(
      supabase.from('ventas_lineas')
        .select('sku_canon,producto_nombre,cantidad,venta_neta_clp,fecha')
        .eq('cliente_key', String(clienteKey))
        .order('fecha', { ascending: false })
        .limit(limit)
    ))
  },
}

export const ejecutivosRepo = {
  async listar() {
    return result(...await Promise.resolve(
      supabase.from('ejecutivos').select('id,nombre,zona,rol')
    ))
  },
}

export const stockRepo = {
  async listar(limit = 500) {
    return result(...await Promise.resolve(supabase.from('stock').select('*').limit(limit)))
  },
}

export const notasRepo = {
  async listar(limit = 300) {
    return result(...await Promise.resolve(supabase.from('notas_cliente').select('*').limit(limit)))
  },
}
