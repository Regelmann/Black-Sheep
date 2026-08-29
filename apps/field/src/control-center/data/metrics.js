const n = (v) => Number(v) || 0

export function summarizeVentas(rows = []) {
  const venta = rows.reduce((s, r) => s + n(r.venta_mtd ?? r.venta ?? r.venta_neta_clp), 0)
  const meta = rows.reduce((s, r) => s + n(r.meta_mtd ?? r.meta), 0)
  return { ventaMtd: venta, meta, cumplimiento: meta ? venta / meta : null }
}

export function summarizeCanales(rows = []) {
  const by = new Map()
  for (const r of rows) {
    const canal = String(r.canal ?? r.zona ?? r.ejecutivo ?? 'SIN ASIGNAR').trim() || 'SIN ASIGNAR'
    const cur = by.get(canal) || { canal, venta: 0, meta: 0, clientes: 0, pedidos: 0 }
    cur.venta += n(r.venta_mtd ?? r.venta)
    cur.meta += n(r.meta_mtd ?? r.meta)
    cur.clientes += n(r.clientes ?? r.clientes_activos)
    cur.pedidos += n(r.pedidos)
    by.set(canal, cur)
  }
  return [...by.values()].map(x => ({ ...x, cumplimiento: x.meta ? x.venta / x.meta : null }))
    .sort((a, b) => b.venta - a.venta)
}

export function summarizeClientes(rows = []) {
  return {
    total: rows.length,
    ventaMtd: rows.reduce((s, r) => s + n(r.venta_mtd), 0),
    altoRiesgo: rows.filter(r => String(r.estado_fuga ?? '').toLowerCase().includes('alto')).length,
    sinCompra: rows.filter(r => n(r.dias_sin_comprar) > 0).length,
    bloqueados: rows.filter(r => r.es_bloqueado === true || String(r.es_bloqueado).toUpperCase() === 'SI').length,
  }
}

export function buildCliente360(cliente, mix = []) {
  if (!cliente) return null
  const venta = n(cliente.venta_mtd)
  const promedio = n(cliente.venta_mensual ?? cliente.promedio_mensual)
  const ultima = cliente.ultima_compra ?? cliente.fecha_ultima_compra ?? null
  const riesgo = cliente.estado_fuga ?? (n(cliente.dias_sin_comprar) >= 21 ? 'alto' : null)
  return {
    id: cliente.cliente_key ?? cliente.id,
    nombre: cliente.nombre_cliente ?? cliente.nombre ?? 'Cliente',
    comuna: cliente.comuna ?? '',
    zona: cliente.zona ?? '',
    ejecutivoId: cliente.ejecutivo_id ?? null,
    ventaMtd: venta,
    promedioMensual: promedio,
    variacion: promedio ? venta / promedio - 1 : null,
    ultimaCompra: ultima,
    diasSinComprar: n(cliente.dias_sin_comprar),
    riesgo,
    bloqueado: !!cliente.es_bloqueado,
    productos: mix,
  }
}
