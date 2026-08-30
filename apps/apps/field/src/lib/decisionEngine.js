/**
 * BLACK SHEEP — DECISION OS (ONE BRAIN)
 * Única fuente de decisiones para Hoy / Cliente / Gerencia.
 * Otras libs (riesgo, coach, predictor) alimentan datos; no compiten en UI.
 */
import { calcGoal } from './calculations/goal.js'

const n = v => Number(v) || 0
const txt = v => String(v ?? '').trim()
const money = v => `$${Math.round(n(v)).toLocaleString('es-CL')}`

function diasUtiles(c) {
  const d = n(c.dias_sin_comprar)
  if (!d || d < 0 || d >= 180) return null
  return d
}

function tuvoHistorial(c) {
  if (n(c.venta_mtd) > 0 || n(c.venta_mensual) > 0) return true
  if (c.ultima_compra) return true
  const d = n(c.dias_sin_comprar)
  return d > 0 && d < 180
}

/**
 * Score compuesto 0–100:
 * urgencia × valor × probabilidad × accionable × confianza (promedio ponderado)
 */
function scoreParts({ urgencia, valor, probabilidad, accionable, confianza }) {
  const u = Math.min(100, Math.max(0, urgencia))
  const v = Math.min(100, Math.max(0, valor))
  const p = Math.min(100, Math.max(0, probabilidad))
  const a = Math.min(100, Math.max(0, accionable))
  const c = Math.min(100, Math.max(0, confianza))
  // pesos: urgencia y valor mandan
  const total = u * 0.3 + v * 0.25 + p * 0.2 + a * 0.15 + c * 0.1
  return {
    urgencia: Math.round(u),
    valor: Math.round(v),
    probabilidad: Math.round(p),
    accionable: Math.round(a),
    confianza: Math.round(c),
    total: Math.round(total),
  }
}

function attentionFromScore(total, type) {
  if (type === 'order') return 'now'
  if (total >= 78) return 'now'
  if (total >= 55) return 'today'
  if (total >= 40) return 'week'
  return null // ignorar
}

function evidenceFromClient(c, dias, ciclo, venta) {
  const ev = []
  if (dias != null) {
    ev.push({ label: 'Sin compra', value: `${dias}d`, tone: dias >= 12 ? 'risk' : 'neutral' })
  }
  if (ciclo > 0 && dias != null) {
    const over = dias - ciclo
    ev.push({
      label: over > 0 ? 'Sobre ciclo' : 'Ciclo',
      value: over > 0 ? `+${over}d` : `~${ciclo}d`,
      tone: over > 0 ? 'risk' : 'ok',
    })
  }
  if (venta > 0) {
    ev.push({ label: 'Habitual', value: money(venta), tone: 'neutral' })
  }
  if (c.estado_fuga) {
    const e = txt(c.estado_fuga).replace(/^\d+_?/, '')
    if (e) ev.push({ label: 'Estado', value: e, tone: /RIESGO|ENFRI/i.test(e) ? 'risk' : 'neutral' })
  }
  return ev.slice(0, 4)
}

/** Decisión de un cliente — export para Visita / 360 */
export function decideClient(c) {
  if (!c || c.es_bloqueado) return null
  const key = c.cliente_key || c.id
  if (!key) return null
  if (!tuvoHistorial(c) && n(c.venta_mtd) <= 0) return null

  const venta = n(c.venta_mtd ?? c.venta_mensual)
  const dias = diasUtiles(c)
  const ciclo = n(c.ciclo_dias) || 0
  const estado = txt(c.estado_fuga).toUpperCase()
  const nombre = c.nombre_cliente || c.razon_social || String(key)

  // --- Reposición ---
  if (dias != null && dias >= 7 && dias <= 45) {
    const late = ciclo > 0 ? Math.max(0, dias - ciclo) : Math.max(0, dias - 9)
    const urgencia = Math.min(100, 50 + dias * 1.5 + late * 4)
    const valor = Math.min(100, 30 + (venta >= 500000 ? 50 : venta >= 200000 ? 35 : venta >= 50000 ? 20 : 10))
    const probabilidad = Math.min(100, 55 + (ciclo > 0 && dias >= ciclo ? 25 : 10) + (venta > 0 ? 10 : 0))
    const accionable = 100
    const confianza = dias <= 21 ? 88 : 72
    const parts = scoreParts({ urgencia, valor, probabilidad, accionable, confianza })
    const att = attentionFromScore(parts.total, 'replenish')
    if (!att) return null
    return {
      id: `rep_${key}`,
      type: 'replenish',
      attention: att,
      score: parts.total,
      parts,
      clientId: key,
      title: nombre,
      reason:
        ciclo > 0 && dias > ciclo
          ? `${dias}d sin compra · ciclo ${ciclo}d`
          : `Hace ${dias} días · reponer`,
      why: [
        ciclo > 0 ? `Ciclo habitual ~${ciclo} días` : 'Cliente con historial',
        `Lleva ${dias} días sin comprar`,
        venta > 0 ? `Venta habitual ${money(venta)}` : 'Tiene compras previas',
        'Pedido accionable en terreno',
      ],
      evidence: evidenceFromClient(c, dias, ciclo, venta),
      confidence: parts.confianza,
      actionLabel: 'Armar pedido',
      expectedValue: Math.round(venta > 0 ? Math.max(venta * 0.25, 40000) : 80000),
      raw: c,
    }
  }

  // --- Riesgo recuperable ---
  if (dias != null && dias >= 30 && dias <= 90 && (venta > 0 || /RIESGO|ENFRI|DORMIDO/.test(estado))) {
    const urgencia = Math.min(100, 40 + (90 - dias) * 0.4 + (venta >= 300000 ? 15 : 0))
    const valor = Math.min(100, 25 + (venta >= 300000 ? 40 : venta >= 100000 ? 25 : 12))
    const probabilidad = Math.min(100, 45 + (dias <= 60 ? 20 : 5))
    const parts = scoreParts({ urgencia, valor, probabilidad, accionable: 95, confianza: 70 })
    const att = attentionFromScore(parts.total, 'protect')
    if (!att) return null
    return {
      id: `risk_${key}`,
      type: 'protect',
      attention: att,
      score: parts.total,
      parts,
      clientId: key,
      title: nombre,
      reason: `${dias} días sin compra · rescatar`,
      why: [
        `${dias}d sin compra`,
        venta > 0 ? `Valía ${money(venta)}` : 'Marcado en riesgo',
        'Todavía recuperable',
        'Contacto + pedido corto',
      ],
      evidence: evidenceFromClient(c, dias, ciclo, venta),
      confidence: parts.confianza,
      actionLabel: 'Contactar',
      expectedValue: Math.round(venta * 0.2 || 50000),
      raw: c,
    }
  }

  // --- Nudge ventana ---
  if (dias != null && dias >= 5 && dias < 7 && venta >= 150000) {
    const parts = scoreParts({
      urgencia: 48,
      valor: Math.min(100, 40 + (venta >= 500000 ? 30 : 15)),
      probabilidad: 70,
      accionable: 100,
      confianza: 65,
    })
    const att = attentionFromScore(parts.total, 'replenish')
    if (!att) return null
    return {
      id: `nudge_${key}`,
      type: 'replenish',
      attention: att,
      score: parts.total,
      parts,
      clientId: key,
      title: nombre,
      reason: `Ventana de reposición · ${dias}d`,
      why: [`${dias}d desde última compra`, `MTD/prom ${money(venta)}`, 'Adelantarse al ciclo'],
      evidence: evidenceFromClient(c, dias, ciclo, venta),
      confidence: parts.confianza,
      actionLabel: 'Ver cliente',
      expectedValue: Math.round(venta * 0.15),
      raw: c,
    }
  }

  return null
}

const ATT_RANK = { now: 0, today: 1, week: 2 }

/**
 * Feed único. actividad.pedidos → prioridad máxima.
 * effectiveness (memory) puede bonificar tipos que convierten.
 */
export function buildDecisionFeed({
  cartera = [],
  focos = [],
  meta = null,
  actividad = {},
  effectiveness = null, // Map type_attention -> { pctConversion }
} = {}) {
  const out = []

  if (n(actividad.pedidos) > 0) {
    out.push({
      id: 'orders_today',
      type: 'order',
      attention: 'now',
      score: 99,
      parts: scoreParts({ urgencia: 100, valor: 90, probabilidad: 100, accionable: 100, confianza: 100 }),
      title: `${actividad.pedidos} pedido${actividad.pedidos === 1 ? '' : 's'} por gestionar`,
      reason: actividad.totalPedidos
        ? `${money(actividad.totalPedidos)} capturados hoy`
        : 'Confirmá con bodega',
      why: ['Pedido ya ingresado', 'Requiere gestión ahora'],
      evidence: [
        { label: 'Pedidos', value: String(actividad.pedidos), tone: 'risk' },
        ...(actividad.totalPedidos
          ? [{ label: 'Monto', value: money(actividad.totalPedidos), tone: 'ok' }]
          : []),
      ],
      confidence: 100,
      actionLabel: 'Revisar',
      expectedValue: n(actividad.totalPedidos),
      route: '/',
    })
  }

  for (const c of cartera || []) {
    const d = decideClient(c)
    if (!d) continue
    // Memory boost
    if (effectiveness && typeof effectiveness.get === 'function') {
      const key = `${d.type}_${d.attention}`
      const eff = effectiveness.get(key)
      if (eff && n(eff.pctConversion) >= 30) {
        d.score = Math.min(100, d.score + 5)
        d.why = [...(d.why || []), `Histórico: ${Math.round(eff.pctConversion)}% conversión`]
      }
    }
    out.push(d)
  }

  // Un foco como máximo — usando calcGoal (SSoT) con días hábiles
  let worstFoco = null
  // Calcular días hábiles del mes actual (igual que metrics.js)
  const _hoy = new Date()
  let _bElapsed = 0, _bTotal = 0
  const _mesIni = new Date(_hoy.getFullYear(), _hoy.getMonth(), 1)
  const _mesFin = new Date(_hoy.getFullYear(), _hoy.getMonth() + 1, 0)
  for (let d = new Date(_mesIni); d <= _mesFin; d.setDate(d.getDate() + 1)) {
    const dw = d.getDay()
    if (dw !== 0 && dw !== 6) {
      _bTotal++
      if (d <= _hoy) _bElapsed++
    }
  }
  for (const f of focos || []) {
    const sold = n(f.vendido_unidad)
    const goal = n(f.meta_unidad)
    if (!goal) continue
    const pct = Math.round((sold / goal) * 100)
    if (pct >= 100) continue
    const missing = Math.max(0, goal - sold)
    // calcGoal determina si es EN_RITMO o ATRASADO con días hábiles reales
    const { status: goalStatus, expectedPct } = calcGoal({
      sold, target: goal,
      businessDaysElapsed: _bElapsed,
      businessDaysInMonth: _bTotal,
    })
    if (goalStatus === 'EN_RITMO' && pct >= 85) continue
    const parts = scoreParts({
      urgencia: Math.min(100, goalStatus === 'ATRASADO' ? 65 : 40 + (85 - pct)),
      valor: 50,
      probabilidad: 55,
      accionable: 80,
      confianza: 60,
    })
    const att = attentionFromScore(parts.total, 'focus') || 'week'
    const score = parts.total
    if (!worstFoco || score > worstFoco.score) {
      worstFoco = {
        id: `focus_${f.foco || f.id}`,
        type: 'focus',
        attention: att,
        score,
        parts,
        title: String(f.foco || 'Foco del mes'),
        reason: `${pct}% meta · ${goalStatus === 'ATRASADO' ? '⚠️ Atrasado' : 'En ritmo'} · faltan ${missing.toLocaleString('es-CL')} ${f.unidad_meta || 'u'}`,
        why: [
          `Avance ${pct}% (ritmo esperado ${expectedPct}%)`,
          goalStatus === 'ATRASADO' ? `Atrasado vs días hábiles del mes` : `En ritmo`,
          `Faltan ${missing.toLocaleString('es-CL')} ${f.unidad_meta || 'u'}`,
        ],
        evidence: [
          { label: 'Avance', value: `${pct}%`, tone: goalStatus === 'ATRASADO' ? 'bad' : 'ok' },
          { label: 'Ritmo', value: `${expectedPct}%`, tone: 'neutral' },
          { label: 'Falta', value: String(missing), tone: 'neutral' },
        ],
        confidence: 65,
        actionLabel: 'Ver clientes',
        expectedValue: 0,
        route: '/cartera',
      }
    }
  }
  if (worstFoco) out.push(worstFoco)

  out.sort((a, b) => {
    const ar = ATT_RANK[a.attention] ?? 9
    const br = ATT_RANK[b.attention] ?? 9
    if (ar !== br) return ar - br
    return (b.score || 0) - (a.score || 0)
  })

  return out.slice(0, 6)
}

export function nextBestAction(feed) {
  return (feed && feed[0]) || null
}

export function groupByAttention(feed = []) {
  const g = { now: [], today: [], week: [] }
  for (const d of feed) {
    const k = d.attention && g[d.attention] ? d.attention : 'today'
    g[k].push(d)
  }
  return g
}

export function calcCommercialValue(c) {
  const nn = v => Number(v) || 0
  const vtaMtd = nn(c.venta_mtd)
  const vtaProm = nn(c.venta_mensual)
  const dias = nn(c.dias_sin_comprar)
  const ciclo = nn(c.ciclo_dias)
  const estado = String(c.estado_fuga || '').toUpperCase()
  const esperada = vtaProm > 0 ? vtaProm : vtaMtd
  const enRiesgo = /RIESGO|ENFRI|DORMIDO/.test(estado)
    ? Math.round(esperada * 0.4)
    : dias > (ciclo || 12)
      ? Math.round(esperada * 0.2)
      : 0
  const oportunidad = vtaProm > 0 ? Math.round(vtaProm * 0.15) : 0
  return {
    vtaMtd,
    esperada,
    enRiesgo,
    oportunidad,
    valorComercial: vtaMtd + esperada + enRiesgo + oportunidad,
  }
}

/** Resumen del día para el footer de Hoy — una sola frase del cerebro */
export function daySummary(feed = [], pred7 = null) {
  const nAct = feed.length
  const pot = feed.reduce((s, d) => s + (Number(d.expectedValue) || 0), 0)
  const now = feed.filter(d => d.attention === 'now').length
  const parts = []
  if (now) parts.push(`${now} ahora`)
  if (nAct) parts.push(`${nAct} oportunidades`)
  if (pot > 0) parts.push(`$${Math.round(pot).toLocaleString('es-CL')} potencial`)
  if (pred7?.ventaEnRiesgo > 0) {
    parts.push(`$${Math.round(pred7.ventaEnRiesgo).toLocaleString('es-CL')} en riesgo (7d)`)
  }
  return parts.join(' · ') || 'Sin urgencias de terreno'
}
