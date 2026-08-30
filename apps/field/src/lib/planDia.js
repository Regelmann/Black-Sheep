/**
 * Plan del día — Black Sheep Field
 * ================================
 * Score 0–100 = ¿vale la pena ir?
 *   vendible  → hay stock de algo que este cliente compra / toca reponer
 *   foco      → alineado con productos foco del mes
 *   reponer   → ciclo vencido / SKUs a reponer
 *   fuga      → riesgo de perder al cliente
 *   valor     → ticket habitual
 *   recencia  → días sin compra
 *
 * Orden de ruta (con GPS): 1ª = más cercana a mí → nearest-neighbor.
 * Quién entra al plan lo decide el score (prioridad comercial).
 */

import { haversineM, formatDist } from './geo.js'

const n = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function nombre(c) {
  return (
    c?.razon_social ||
    c?.nombre_razon ||
    c?.nombre_cliente ||
    c?.nombre ||
    c?.cliente_key ||
    'Cliente'
  )
}

function coordsOf(c) {
  const lat = n(c.lat ?? c.latitud ?? c.latitude)
  const lng = n(c.lng ?? c.longitud ?? c.longitude)
  if (!lat || !lng) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

function normSku(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+/, '')
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s) {
  return normName(s)
    .split(' ')
    .filter((t) => t.length >= 3 && !/^(kg|prom|caja|pack|und|ud|mm|lt|lts|x\d+)$/i.test(t))
}

function nameOverlap(a, b) {
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.length || !tb.length) return false
  let hit = 0
  for (const t of ta) {
    if (tb.some((x) => x === t || x.includes(t) || t.includes(x))) hit++
  }
  return hit >= Math.min(2, ta.length) || (ta[0] && tb.some((x) => x.includes(ta[0]) || ta[0].includes(x)))
}

/** SKUs a reponer desde sku_detalle del ciclo */
function parseSkusReponer(c) {
  const raw = c?.sku_detalle
  if (!raw || typeof raw !== 'string') return []
  const blocks = raw.includes('||') ? raw.split('||') : raw.split(/\n/)
  const out = []
  for (const block of blocks) {
    const p = block.split('|').map((s) => s.trim())
    if (!p[0]) continue
    const estado = (p[9] || '').toUpperCase()
    const diasPara = p[10] !== undefined && p[10] !== '' ? n(p[10]) : null
    const toca =
      /REPOS|ATRAS|VENCID/i.test(estado) || (diasPara != null && diasPara <= 0)
    if (!toca && !/REPOS/i.test(estado)) continue
    out.push({
      nombre: p[0],
      sku: p[11] || p[0],
      sku_canon: p[11] || null,
      promClp: n(p[4]),
      clpMtd: n(p[5]),
    })
  }
  return out
}

/** Todos los SKUs del mix del cliente (para match de stock / foco) */
function parseSkusAll(c) {
  const raw = c?.sku_detalle
  if (!raw || typeof raw !== 'string') return []
  const blocks = raw.includes('||') ? raw.split('||') : raw.split(/\n/)
  const out = []
  for (const block of blocks) {
    const p = block.split('|').map((s) => s.trim())
    if (!p[0]) continue
    out.push({
      nombre: p[0],
      sku: p[11] || p[0],
      sku_canon: p[11] || null,
      promClp: n(p[4]),
      clpMtd: n(p[5]),
    })
  }
  return out
}

function riesgoBasico(c) {
  if (c.riesgo_score != null) return Math.min(100, n(c.riesgo_score))
  const dias = n(c.dias_sin_comprar)
  const ef = String(c.estado_fuga || '').toUpperCase()
  let s = 0
  if (/FUGADO/.test(ef)) s = 90
  else if (/RIESGO/.test(ef)) s = 75
  else if (/ENFRI/.test(ef)) s = 55
  else if (/DORMIDO/.test(ef)) s = 60
  if (dias >= 60) s = Math.max(s, 85)
  else if (dias >= 35) s = Math.max(s, 65)
  else if (dias >= 21) s = Math.max(s, 40)
  return s
}

/**
 * Índice de stock: { bySku, byName tokens, focosSku }
 * stock rows: { sku_canon, producto_nombre, stock_total|stock|cantidad, es_foco_mes }
 */
export function buildStockIndex(stockRows = []) {
  const bySku = new Map()
  const list = []
  for (const r of stockRows || []) {
    const qty = n(r.stock_total ?? r.stock ?? r.cantidad ?? r.disponible)
    if (qty <= 0) continue
    const sku = normSku(r.sku_canon || r.sku || r.codigo)
    const nombre = r.producto_nombre || r.descripcion || r.nombre || ''
    const entry = {
      sku,
      nombre,
      qty,
      foco: !!(r.es_foco_mes || r.es_foco || r.foco),
    }
    if (sku) bySku.set(sku, entry)
    list.push(entry)
  }
  return { bySku, list }
}

function matchStock(item, index) {
  if (!index?.list?.length) return null
  const sk = normSku(item.sku_canon || item.sku)
  if (sk && index.bySku.has(sk)) return index.bySku.get(sk)
  // fuzzy by name
  for (const e of index.list) {
    if (nameOverlap(e.nombre, item.nombre || '')) return e
  }
  return null
}

/**
 * Focos del mes: nombres / skus del ejecutivo
 * focos rows: { foco, unidad_meta, ... }
 */
function focoKeywords(focos = []) {
  const keys = []
  for (const f of focos || []) {
    const name = String(f.foco || f.nombre || f.sku || '').trim()
    if (name) keys.push(normName(name))
  }
  return keys
}

function itemMatchesFoco(item, focoKeys, stockHit) {
  if (stockHit?.foco) return true
  if (!focoKeys.length) return false
  const nm = normName(item.nombre || item.sku || '')
  if (!nm) return false
  return focoKeys.some((k) => k && (nm.includes(k) || k.includes(nm) || nameOverlap(k, nm)))
}

/**
 * Score comercial auditable.
 * @param {object} c cliente cartera
 * @param {{ stockIndex?: object, focos?: array }} ctx
 */
export function scoreClientePlan(c, ctx = {}) {
  const dias = n(c.dias_sin_comprar)
  const mtd = n(c.venta_mtd)
  const hist = n(c.venta_mensual) || n(c.venta_historica)
  const skusRep = parseSkusReponer(c)
  const skusAll = parseSkusAll(c)
  const fuga = riesgoBasico(c)
  const stockIndex = ctx.stockIndex || null
  const focoKeys = focoKeywords(ctx.focos || [])
  const hasStockData = !!(stockIndex && stockIndex.list && stockIndex.list.length)

  // —— Vendible: ¿puedo llevar algo que este cliente compre? ——
  let vendible = 50 // neutral si no hay stock cargado
  let vendibleHits = []
  let sinStockHits = []
  let focoHits = []

  const candidates = skusRep.length ? skusRep : skusAll.slice(0, 8)

  if (hasStockData) {
    vendible = 0
    for (const it of candidates) {
      const hit = matchStock(it, stockIndex)
      if (hit) {
        vendibleHits.push({ ...it, stockQty: hit.qty, stockName: hit.nombre })
        if (itemMatchesFoco(it, focoKeys, hit)) focoHits.push(it)
      } else {
        sinStockHits.push(it)
      }
    }
    // también: stock en foco que el cliente podría comprar (nombre overlap con mix)
    if (!vendibleHits.length && skusAll.length) {
      for (const e of stockIndex.list) {
        if (!e.foco && !focoKeys.some((k) => nameOverlap(k, e.nombre))) continue
        for (const it of skusAll) {
          if (nameOverlap(e.nombre, it.nombre || '')) {
            vendibleHits.push({ ...it, stockQty: e.qty, stockName: e.nombre })
            focoHits.push(it)
            break
          }
        }
      }
    }

    if (vendibleHits.length) {
      vendible = Math.min(100, 65 + vendibleHits.length * 12)
      const top$ = vendibleHits.reduce(
        (mx, s) => Math.max(mx, n(s.promClp) || n(s.clpMtd)),
        0
      )
      if (top$ > 0) vendible = Math.min(100, vendible + Math.min(25, Math.round(top$ / 80000)))
    } else if (candidates.length) {
      // Quiere reponer / tiene mix pero NO hay stock → casi no vale la visita por producto
      vendible = 8
    } else {
      // Sin mix conocido: visita genérica / recuperación blanda
      vendible = 25
    }
  } else {
    // Sin data de stock: no penalizamos fuerte
    vendible = skusRep.length ? 70 : 45
    if (skusRep.length) vendibleHits = skusRep.slice(0, 3)
  }

  // —— Foco del mes ——
  let foco = 0
  if (focoHits.length) {
    foco = Math.min(100, 60 + focoHits.length * 15)
  } else if (focoKeys.length && candidates.length) {
    // cliente no alineado con foco actual
    foco = 10
  } else if (!focoKeys.length) {
    foco = 40 // sin focos definidos, no penalizar
  }

  // —— Reponer (urgencia de ciclo) ——
  let reponer = 0
  if (skusRep.length) {
    reponer = Math.min(100, 40 + skusRep.length * 8)
    const top$ = skusRep.reduce((mx, s) => Math.max(mx, n(s.promClp) || n(s.clpMtd)), 0)
    if (top$ > 0) reponer = Math.min(100, reponer + Math.min(20, Math.round(top$ / 100000)))
  }

  // —— Valor / recencia ——
  const valor = Math.min(
    100,
    Math.round((Math.max(mtd, hist) / 500000) * 40 + (mtd > 0 ? 20 : 0))
  )
  let recencia = 0
  if (dias >= 45) recencia = 90
  else if (dias >= 28) recencia = 70
  else if (dias >= 14) recencia = 45
  else if (dias >= 7) recencia = 25

  // Pesos comerciales: sin algo que vender, el resto casi no importa.
  // vendible 38% | foco 20% | reponer 18% | fuga 12% | valor 8% | recencia 4%
  let total = Math.round(
    vendible * 0.38 +
      foco * 0.2 +
      reponer * 0.18 +
      fuga * 0.12 +
      valor * 0.08 +
      recencia * 0.04
  )

  // Hard gate: stock cargado y NADA que llevar → techo 18 (casi fuera del plan)
  if (hasStockData && vendibleHits.length === 0 && candidates.length > 0) {
    total = Math.min(total, 18)
  }
  // Cliente genérico sin mix ni historial fuerte
  if (hasStockData && !candidates.length && !vendibleHits.length && hist < 50000) {
    total = Math.min(total, 30)
  }
  // Boost: foco + stock + reponer = visita de máxima prioridad comercial
  if (vendibleHits.length && focoHits.length && skusRep.length) {
    total = Math.min(100, total + 10)
  }
  // Boost menor: hay stock vendible aunque no sea foco
  if (vendibleHits.length && !focoHits.length) {
    total = Math.min(100, total + 4)
  }

  const reasons = []
  if (vendibleHits.length) {
    const top = vendibleHits[0]
    reasons.push(
      `Vendible: ${String(top.stockName || top.nombre || 'SKU')
        .split(/\s+/)
        .slice(0, 3)
        .join(' ')}` + (vendibleHits.length > 1 ? ` +${vendibleHits.length - 1}` : '')
    )
  } else if (hasStockData && sinStockHits.length) {
    reasons.push('Sin stock de su mix')
  } else if (skusRep.length) {
    reasons.push(
      `Reponer ${String(skusRep[0].nombre || 'SKU')
        .split(/\s+/)
        .slice(0, 3)
        .join(' ')}`
    )
  }
  if (focoHits.length) reasons.push('Foco del mes')
  if (fuga >= 50) reasons.push(`Riesgo ${Math.round(fuga)}`)
  if (dias >= 14) reasons.push(`${dias}d sin compra`)

  const expectedValue = vendibleHits.length
    ? vendibleHits.reduce((s, x) => s + (n(x.promClp) || n(x.clpMtd) || 0), 0)
    : skusRep.reduce((s, x) => s + (n(x.promClp) || n(x.clpMtd) || 0), 0) ||
      Math.max(mtd * 0.15, hist * 0.1)

  let tipo = 'seguimiento'
  if (hasStockData && vendibleHits.length === 0 && candidates.length) tipo = 'sin_stock'
  else if (vendibleHits.length && focoHits.length) tipo = 'foco'
  else if (vendibleHits.length || skusRep.length) tipo = 'reponer'
  else if (fuga >= 55) tipo = 'riesgo'
  else if (dias >= 21) tipo = 'recuperar'

  return {
    score: Math.min(100, Math.max(0, total)),
    parts: { vendible, foco, reponer, fuga, valor, recencia },
    reasons: reasons.slice(0, 3),
    insight: reasons[0] || null,
    expectedValue: Math.round(expectedValue),
    skusReponer: skusRep.slice(0, 3),
    vendibleHits: vendibleHits.slice(0, 3),
    sinStock: hasStockData && vendibleHits.length === 0 && candidates.length > 0,
    tipo,
  }
}

/**
 * Orden: con GPS, 1ª = más cercana a mí; luego nearest-neighbor.
 * Quién entra lo define el score en buildPlanDia.
 */
export function orderStopsByRoute(stops, origin = null) {
  if (!stops.length) return []
  const withGeo = stops.filter((s) => s.coords)
  const without = stops.filter((s) => !s.coords)

  if (!withGeo.length) {
    return [...without]
      .sort((a, b) => b.score - a.score)
      .map((s) => ({ ...s, distFromPrevM: null, distLabel: null, distFromOriginM: null }))
  }

  const remaining = [...withGeo]
  const ordered = []

  let current = origin
  if (origin?.lat != null && origin?.lng != null) {
    let bestIdx = 0
    let bestD = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineM(
        origin.lat,
        origin.lng,
        remaining[i].coords.lat,
        remaining[i].coords.lng
      )
      if (d != null && d < bestD) {
        bestD = d
        bestIdx = i
      }
    }
    const first = remaining.splice(bestIdx, 1)[0]
    ordered.push({
      ...first,
      distFromPrevM: bestD === Infinity ? null : bestD,
      distLabel: formatDist(bestD === Infinity ? null : bestD),
      distFromOriginM: bestD === Infinity ? null : bestD,
    })
    current = first.coords
  } else {
    remaining.sort((a, b) => b.score - a.score)
    const first = remaining.shift()
    ordered.push({
      ...first,
      distFromPrevM: null,
      distLabel: null,
      distFromOriginM: null,
    })
    current = first.coords
  }

  while (remaining.length) {
    let bestIdx = 0
    let bestD = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineM(
        current.lat,
        current.lng,
        remaining[i].coords.lat,
        remaining[i].coords.lng
      )
      if (d != null && d < bestD) {
        bestD = d
        bestIdx = i
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]
    ordered.push({
      ...next,
      distFromPrevM: bestD === Infinity ? null : bestD,
      distLabel: formatDist(bestD === Infinity ? null : bestD),
      distFromOriginM: null,
    })
    current = next.coords
  }

  without.sort((a, b) => b.score - a.score)
  return [
    ...ordered,
    ...without.map((s) => ({
      ...s,
      distFromPrevM: null,
      distLabel: null,
      distFromOriginM: null,
    })),
  ]
}

/**
 * @param {object[]} cartera
 * @param {{ origin?, limit?, minScore?, stock?, focos?, excludeSinStock? }} opts
 */
export function buildPlanDia(cartera = [], opts = {}) {
  const limit = opts.limit ?? 12
  const minScore = opts.minScore ?? 28
  const origin = opts.origin || null
  const excludeSinStock = opts.excludeSinStock !== false // default: no meter visitas sin nada que vender
  const stockIndex = buildStockIndex(opts.stock || [])
  const focos = opts.focos || []
  const ctx = { stockIndex, focos }

  const candidates = []
  for (const c of cartera) {
    const key = c.cliente_key || c.id
    if (!key) continue
    if (c.es_bloqueado) continue
    const sc = scoreClientePlan(c, ctx)
    // Sin nada que vender hoy → no entra al plan (salvo que desactiven excludeSinStock)
    if (excludeSinStock && (sc.sinStock || sc.tipo === 'sin_stock')) continue
    if (sc.score < minScore) continue
    candidates.push({
      cliente_key: key,
      nombre: nombre(c),
      score: sc.score,
      parts: sc.parts,
      reasons: sc.reasons,
      insight: sc.insight,
      expectedValue: sc.expectedValue,
      tipo: sc.tipo,
      skusReponer: sc.skusReponer,
      vendibleHits: sc.vendibleHits,
      sinStock: sc.sinStock,
      coords: coordsOf(c),
      telefono: c.telefono || null,
      comuna: c.comuna || null,
      dias_sin_comprar: n(c.dias_sin_comprar) || null,
      raw: c,
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  const top = candidates.slice(0, limit)
  const ordered = orderStopsByRoute(top, origin)

  const expectedTotal = ordered.reduce((s, x) => s + (x.expectedValue || 0), 0)
  const nRep = ordered.filter((x) => x.tipo === 'reponer' || x.tipo === 'foco').length
  const nRiesgo = ordered.filter((x) => x.tipo === 'riesgo' || x.tipo === 'recuperar').length
  const nFoco = ordered.filter((x) => x.tipo === 'foco').length

  return {
    stops: ordered.map((s, i) => ({ ...s, order: i + 1 })),
    totalStops: ordered.length,
    expectedValue: Math.round(expectedTotal),
    summary: {
      reponer: nRep,
      riesgo: nRiesgo,
      foco: nFoco,
      line:
        ordered.length === 0
          ? 'Sin paradas prioritarias · revisá stock y cartera'
          : `${ordered.length} paradas` +
            (nFoco ? ` · ${nFoco} foco` : '') +
            (nRep ? ` · ${nRep} vendible` : '') +
            (nRiesgo ? ` · ${nRiesgo} riesgo` : '') +
            (expectedTotal > 0
              ? ` · ~$${Math.round(expectedTotal).toLocaleString('es-CL')} potencial`
              : ''),
    },
    generatedAt: new Date().toISOString(),
  }
}

export function mapsUrlForStops(stops) {
  const withGeo = (stops || []).filter((s) => s.coords)
  if (!withGeo.length) return null
  if (withGeo.length === 1) {
    const { lat, lng } = withGeo[0].coords
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  }
  const origin = `${withGeo[0].coords.lat},${withGeo[0].coords.lng}`
  const dest = withGeo[withGeo.length - 1]
  const mid = withGeo
    .slice(1, -1)
    .map((s) => `${s.coords.lat},${s.coords.lng}`)
    .join('|')
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest.coords.lat},${dest.coords.lng}`
  if (mid) url += `&waypoints=${encodeURIComponent(mid)}`
  return url
}
