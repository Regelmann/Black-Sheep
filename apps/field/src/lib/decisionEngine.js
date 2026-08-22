const n = v => Number(v) || 0
const txt = v => String(v ?? '').trim()
const money = v => `$${Math.round(n(v)).toLocaleString('es-CL')}`

function clientDecision(c) {
  const venta = n(c.venta_mtd ?? c.venta_mensual)
  const dias = n(c.dias_sin_comprar)
  const estado = txt(c.estado_fuga).toUpperCase()
  const key = c.cliente_key || c.id
  if (!key) return null

  let score = 18
  let type = 'opportunity'
  let title = 'Mantener relación'
  let actionLabel = 'Ver cliente'
  let reason = venta ? `Compra activa · MTD ${money(venta)}.` : 'Cliente activo en cartera.'
  let why = []

  if (/FUGA|RIESGO|CRIT/.test(estado) || dias >= 30) {
    score = 72
    type = 'protect'
    title = 'Proteger cliente'
    actionLabel = 'Preparar contacto'
    reason = `${dias} días sin compra${venta ? ` · MTD ${money(venta)}` : ''}.`
    why.push(`${dias} días fuera de compra`)
  } else if (dias >= 12) {
    score = 48
    type = 'replenish'
    title = 'Activar reposición'
    actionLabel = 'Preparar pedido'
    reason = `${dias} días sin compra.`
    why.push(`${dias} días sin compra`)
  }

  if (venta >= 500000) { score += 20; why.push('alto valor MTD') }
  else if (venta >= 200000) { score += 12; why.push('valor MTD relevante') }

  if (n(c.potencial_clp || c.oportunidad_clp) > 0) {
    score += Math.min(18, n(c.potencial_clp || c.oportunidad_clp) / 100000)
    why.push(`potencial ${money(c.potencial_clp || c.oportunidad_clp)}`)
  }

  if (c.es_bloqueado) {
    score -= 40
    type = 'blocked'
    actionLabel = 'Revisar condición'
    reason = 'Cliente bloqueado: revisar condición antes de ofrecer.'
    why = ['cliente bloqueado']
  }

  const confidence = Math.max(0.45, Math.min(0.98, 0.52 + Math.min(0.3, dias / 100) + (venta > 0 ? 0.08 : 0) + (why.length >= 2 ? 0.05 : 0)))
  return {
    id: `client_${key}`,
    type,
    score: Math.round(score),
    clientId: key,
    title: c.nombre_cliente || c.razon_social || String(key),
    reason,
    why: why.slice(0, 3),
    confidence: Math.round(confidence * 100),
    actionLabel,
    expectedValue: Math.round(n(c.potencial_clp || c.oportunidad_clp) || venta * (type === 'protect' ? 0.35 : 0.18)),
    raw: c,
  }
}

export function buildDecisionFeed({ cartera = [], focos = [], meta = null, actividad = {} } = {}) {
  const out = []
  for (const c of cartera) {
    const d = clientDecision(c)
    if (d) out.push(d)
  }

  for (const f of focos) {
    const sold = n(f.vendido_unidad)
    const goal = n(f.meta_unidad)
    if (!goal) continue
    const pct = Math.round((sold / goal) * 100)
    if (pct < 80) {
      const missing = Math.max(0, goal - sold)
      out.push({
        id: `focus_${f.id || f.foco}`,
        type: 'focus',
        score: Math.round(46 + (80 - pct) * 0.8),
        title: String(f.foco || 'Foco del mes'),
        reason: `${pct}% de meta · faltan ${missing.toLocaleString('es-CL')} ${f.unidad_meta || ''}.`,
        why: [`avance ${pct}%`, `brecha ${missing.toLocaleString('es-CL')} ${f.unidad_meta || ''}`],
        confidence: 96,
        actionLabel: 'Ver oportunidad',
        expectedValue: 0,
        route: `/cartera?filtro=Foco&q=${encodeURIComponent(f.foco || '')}`,
      })
    }
  }

  if (n(actividad.pedidos) > 0) {
    out.push({
      id: 'orders', type: 'order', score: 96,
      title: `${actividad.pedidos} pedido${actividad.pedidos === 1 ? '' : 's'} capturado${actividad.pedidos === 1 ? '' : 's'}`,
      reason: `${money(actividad.totalPedidos)} listos para revisar.`,
      why: ['pedido web/capturado pendiente de gestión'], confidence: 100,
      actionLabel: 'Revisar pedidos', expectedValue: n(actividad.totalPedidos), route: '/',
    })
  }

  if (meta && n(meta.brecha) > 0) {
    out.push({
      id: 'gap', type: 'goal', score: 40,
      title: 'Cerrar brecha de meta',
      reason: `Faltan ${money(meta.brecha)} para la meta mensual.`,
      why: ['brecha financiera vigente'], confidence: 100,
      actionLabel: 'Ver cartera', expectedValue: n(meta.brecha), route: '/cartera?filtro=CerrarMeta',
    })
  }

  return out
    .filter(x => x.score > 0)
    .sort((a, b) => (b.score - a.score) || (b.expectedValue - a.expectedValue))
    .slice(0, 12)
}
