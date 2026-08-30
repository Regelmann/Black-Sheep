import { supabase } from '../../lib/supabase.js'

const text = value => value == null || value === '' ? '—' : String(value)

const closedCatalogOrder = order => {
  const source = text(order?.fuente).toLowerCase()
  const state = text(order?.estado).toLowerCase()
  return source === 'catalogo_publico' && !['borrador', 'cancelado'].includes(state)
}

export const drillDownRepo = {
  async hierarchy({ canal, zona, ejecutivoId, limit = 3000 } = {}) {
    const [{ data: clients, error: clientsError }, { data: executives, error: executivesError }] = await Promise.all([
      supabase.from('gerencia_clientes').select('*').limit(limit),
      supabase.from('ejecutivos').select('id,nombre,zona,rol')
    ])
    if (clientsError) throw clientsError
    if (executivesError) throw executivesError

    const people = new Map((executives || []).map(e => [String(e.id), e]))
    let rows = clients || []
    if (canal && canal !== 'TODOS') rows = rows.filter(c => text(c.canal || people.get(String(c.ejecutivo_id))?.rol).toUpperCase() === String(canal).toUpperCase())
    if (zona && zona !== 'TODAS') rows = rows.filter(c => text(c.zona || people.get(String(c.ejecutivo_id))?.zona) === zona)
    if (ejecutivoId) rows = rows.filter(c => String(c.ejecutivo_id) === String(ejecutivoId))

    const byExecutive = new Map()
    for (const client of rows) {
      const id = client.ejecutivo_id ? String(client.ejecutivo_id) : 'sin-asignar'
      const person = people.get(id)
      const current = byExecutive.get(id) || {
        id: id === 'sin-asignar' ? null : id,
        nombre: person?.nombre || client.ejecutivo || client.ejecutivo_nombre || 'Sin asignar',
        rol: person?.rol || client.canal || 'Terreno',
        zona: person?.zona || client.zona || '—',
        venta: 0,
        meta: 0,
        clientes: 0,
        riesgo: 0,
        cartera: []
      }
      current.venta += Number(client.venta_mtd ?? client.ventaMtd ?? 0)
      current.meta += Number(client.meta_mtd ?? client.metaMtd ?? 0)
      current.clientes += 1
      if (['alto', 'critico', 'crítico'].includes(text(client.riesgo).toLowerCase())) current.riesgo += 1
      current.cartera.push(client)
      byExecutive.set(id, current)
    }

    return [...byExecutive.values()]
      .map(x => ({ ...x, avance: x.meta ? x.venta / x.meta : null }))
      .sort((a, b) => b.venta - a.venta)
  },

  async clients({ canal, zona, ejecutivoId, limit = 3000 } = {}) {
    const [{ data: clients, error: clientsError }, { data: executives, error: executivesError }] = await Promise.all([
      supabase.from('gerencia_clientes').select('*').limit(limit),
      supabase.from('ejecutivos').select('id,nombre,zona,rol')
    ])
    if (clientsError) throw clientsError
    if (executivesError) throw executivesError
    const people = new Map((executives || []).map(e => [String(e.id), e]))
    return (clients || []).filter(client => {
      const person = people.get(String(client.ejecutivo_id))
      const clientCanal = text(client.canal || person?.rol).toUpperCase()
      const clientZona = text(client.zona || person?.zona)
      return (!canal || canal === 'TODOS' || clientCanal === String(canal).toUpperCase()) &&
        (!zona || zona === 'TODAS' || clientZona === zona) &&
        (!ejecutivoId || String(client.ejecutivo_id) === String(ejecutivoId))
    })
  },

  async catalogOrders({ clienteKey, limit = 100 } = {}) {
    if (!clienteKey) return []
    const { data, error } = await supabase.from('pedidos').select('id,cliente_key,estado,fuente,total_estimado,creado_en').eq('cliente_key', String(clienteKey)).order('creado_en', { ascending: false }).limit(limit)
    if (error) throw error
    return (data || []).filter(closedCatalogOrder)
  }
}
