const n = (v) => Number(v || 0)
const first = (row, keys) => keys.map(k => row?.[k]).find(v => v != null)

export function summarizeVentas(rows = []) {
  const ventaMtd = rows.reduce((s, r) => s + n(first(r, ['venta_mtd','ventas_mtd','venta'])), 0)
  const meta = rows.reduce((s, r) => s + n(first(r, ['meta_mtd','meta'])), 0)
  return { ventaMtd, meta, cumplimiento: meta ? ventaMtd / meta : null }
}

export function summarizeCanales(rows = []) {
  const map = new Map()
  for (const r of rows) {
    const canal = first(r, ['canal','canal_nombre','tipo_canal']) || 'Sin canal'
    const venta = n(first(r, ['venta_mtd','ventas_mtd','venta']))
    map.set(canal, (map.get(canal) || 0) + venta)
  }
  return [...map.entries()].map(([canal, venta]) => ({ canal, venta })).sort((a,b) => b.venta - a.venta)
}

export function summarizeClientes(rows = []) {
  const norm = rows.map(r => String(first(r, ['estado_fuga','riesgo','estado_riesgo']) || '').toLowerCase())
  return {
    total: rows.length,
    altoRiesgo: norm.filter(v => v.includes('alto') || v.includes('rojo') || v.includes('crit')).length,
    bloqueados: rows.filter(r => Boolean(first(r, ['es_bloqueado','bloqueado']))).length,
    sinCompra: rows.filter(r => n(first(r, ['venta_mtd','ventas_mtd','venta'])) === 0).length,
  }
}

export function buildCliente360(row) {
  const ventaMtd = n(first(row, ['venta_mtd','ventas_mtd','venta']))
  const promedioMensual = n(first(row, ['promedio_mensual','promedio','venta_promedio']))
  return {
    id: first(row, ['id','cliente_id','cliente_key']),
    nombre: first(row, ['nombre_cliente','nombre','razon_social','cliente_key']) || 'Cliente',
    ventaMtd,
    promedioMensual,
    variacion: promedioMensual ? (ventaMtd - promedioMensual) / promedioMensual : null,
    riesgo: first(row, ['estado_fuga','riesgo','estado_riesgo']),
  }
}
