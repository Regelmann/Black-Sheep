/**
 * Motor de "qué hacer hoy" — usa cartera + stock + focos ya cargados.
 * No inventa datos: prioriza reponer, riesgo, foco del mes, nuevos.
 */
import { clienteTocaReponer } from './metrics.js'
import { cicloReposicion, skusAReponer, parseSkuDetalle } from './coach.js'

function nom(c) {
  return c?.nombre_cliente || c?.razon_social || c?.nombre || c?.cliente_key || 'Cliente'
}

/**
 * @param {object[]} cartera
 * @param {{ focos?: object[], stockFoco?: object[] }} ctx
 * @returns {Array<{ id, tipo, priority, title, subtitle, insight, cliente_key, telefono, amount, cta }>}
 */
export function buildRecomendacionesHoy(cartera, ctx = {}) {
  const list = Array.isArray(cartera) ? cartera : []
  const out = []

  for (const c of list) {
    if (c.es_bloqueado) continue
    const key = c.cliente_key || c.id
    if (!key) continue

    const skus = skusAReponer(c)
    const toca = clienteTocaReponer(c) || skus.length > 0
    const estado = String(c.estado_fuga || '').toLowerCase()
    const dias = Number(c.dias_sin_comprar) || 0
    const venta = Number(c.venta_mtd || c.venta_mensual) || 0

    // 1) Reponer
    if (toca && skus.length) {
      const top = skus.slice(0, 2).map(s => s.nombre || s.sku).filter(Boolean).join(', ')
      out.push({
        id: `rep_${key}`,
        tipo: 'reponer',
        priority: 100 + Math.min(dias, 40) + skus.length * 3,
        title: nom(c),
        subtitle: `${dias ? `hace ${dias}d` : 'ciclo vencido'} · ${skus.length} SKU`,
        insight: top ? `Reponer: ${top}` : 'Toca reponer mix',
        cliente_key: key,
        telefono: c.telefono,
        amount: venta,
        cta: 'Ir a visitar',
      })
      continue
    }

    // 2) Riesgo / fuga
    if (/riesgo|fuga|enfri/.test(estado) || dias >= 35) {
      out.push({
        id: `riesgo_${key}`,
        tipo: 'riesgo',
        priority: 80 + Math.min(dias, 60),
        title: nom(c),
        subtitle: dias ? `${dias} días sin compra` : (estado || 'en riesgo'),
        insight: 'Recuperar relación · ofrecer mix habitual',
        cliente_key: key,
        telefono: c.telefono,
        amount: venta,
        cta: 'Recuperar',
      })
      continue
    }

    // 3) Activo sin visita reciente pero con potencial foco
    if (venta > 0 && dias >= 12 && dias < 35) {
      const detalle = parseSkuDetalle(c.sku_detalle)
      const hint = detalle[0]?.nombre
      out.push({
        id: `ritmo_${key}`,
        tipo: 'ritmo',
        priority: 50 + dias,
        title: nom(c),
        subtitle: `MTD ${Math.round(venta / 1000)}k · ${dias}d`,
        insight: hint ? `Empujar ${hint}` : 'Mantener ritmo de compra',
        cliente_key: key,
        telefono: c.telefono,
        amount: venta,
        cta: 'Visitar',
      })
    }
  }

  // Orden + top 12
  out.sort((a, b) => b.priority - a.priority)
  return out.slice(0, 12)
}

/**
 * Texto corto de coaching para el hero de Hoy.
 */
export function resumenDia(recs, meta) {
  const nRep = recs.filter(r => r.tipo === 'reponer').length
  const nRiesgo = recs.filter(r => r.tipo === 'riesgo').length
  const parts = []
  if (nRep) parts.push(`${nRep} a reponer`)
  if (nRiesgo) parts.push(`${nRiesgo} en riesgo`)
  if (!parts.length) parts.push('Cartera al día')
  if (meta?.brecha > 0) {
    parts.push(`brecha $${Math.round(meta.brecha).toLocaleString('es-CL')}`)
  }
  return parts.join(' · ')
}
