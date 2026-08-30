const n = (v) => Number(v || 0)
const first = (row, keys) => keys.map(k => row?.[k]).find(v => v != null)

export function summarizeVentas(rows = []) {
  const ventaMtd = rows.reduce((s, r) => s + n(first(r, ['venta_mtd','ventas_mtd','venta'])), 0)
  const meta = rows.reduce((s, r) => s + n(first(r, ['meta_mtd','meta'])), 0)
  return { ventaMtd, meta, cumplimiento: meta > 0 ? ventaMtd / meta : null }
}

export function summarizeCanales(rows = []) {
  const map = new Map()
  for (const r of rows) {
    const canal = first(r, ['canal','canal_nombre','tipo_canal']) || 'Sin canal'
    const venta = n(first(r, ['venta_mtd','ventas_mtd','venta']))
    const meta = n(first(r, ['meta_mtd','meta']))
    const current = map.get(canal) || { canal, venta: 0, meta: 0 }
    current.venta += venta
    current.meta += meta
    map.set(canal, current)
  }
  return [...map.values()].map(x => ({ ...x, cumplimiento: x.meta > 0 ? x.venta / x.meta : null })).sort((a,b) => b.venta - a.venta)
}

export function summarizeClientes(rows = []) {
  const risk = rows.map(r => String(first(r, ['estado_fuga','riesgo','estado_riesgo']) || '').toLowerCase())
  return {
    total: rows.length,
    altoRiesgo: risk.filter(v => v.includes('alto') || v.includes('rojo') || v.includes('crit')).length,
    bloqueados: rows.filter(r => Boolean(first(r, ['es_bloqueado','bloqueado']))).length,
    sinCompra: rows.filter(r => n(first(r, ['venta_mtd','ventas_mtd','venta'])) === 0).length,
  }
}

export function buildCliente360(row = {}) {
  const ventaMtd = n(first(row, ['venta_mtd','ventas_mtd','venta']))
  const promedioMensual = n(first(row, ['promedio_mensual','promedio','venta_promedio','venta_mensual']))
  const diasSinComprar = n(first(row, ['dias_sin_comprar','dias_sin_compra']))
  return {
    id: first(row, ['id','cliente_id','cliente_key']),
    nombre: first(row, ['nombre_cliente','nombre','razon_social','cliente_key']) || 'Cliente',
    ventaMtd,
    promedioMensual,
    variacion: promedioMensual > 0 ? (ventaMtd - promedioMensual) / promedioMensual : null,
    diasSinComprar,
    riesgo: first(row, ['estado_fuga','riesgo','estado_riesgo']),
    ejecutivo: first(row, ['ejecutivo_nombre','ejecutivo']),
    zona: first(row, ['zona','zona_nombre']),
    canal: first(row, ['canal','canal_nombre','tipo_canal']),
  }
}

export function buildOpportunities(rows = []) {
  return rows.map(row => {
    const c = buildCliente360(row)
    const opportunity = n(first(row, ['oportunidad_estimada','oportunidad','venta_oportunidad']))
    return { ...c, oportunidad: opportunity, prioridad: c.riesgo || (c.diasSinComprar >= 30 ? 'alto' : 'media') }
  }).filter(x => x.oportunidad > 0 || x.prioridad)
}
