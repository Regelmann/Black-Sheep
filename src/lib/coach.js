/**
 * Coach KeyFoods Field — parse sku_detalle robusto + scoring
 * Formatos soportados (ciclo):
 *  A) nombre|prom|mtd|promClp|clpMtd|ultima|ciclo|n
 *  B) nombre|prom|mtd|falta|promClp|clpMtd|ultima|ciclo|n|estado|dias
 * Separadores de producto: salto de línea o  ·  o ||
 */

import { haversineM } from './geo'

function isGarbageName(n) {
  if (!n || n.length < 3) return true
  if (/^\d+([.,]\d+)?$/.test(n)) return true
  if (/^\d+([.,]\d+)?\s*(kg|lt|l|un|ud|mm)$/i.test(n)) return true
  if (/^(OK|HOY|ATRASA|MIX|null|undefined)$/i.test(n)) return true
  return false
}

function num(v) {
  if (v == null || v === '') return 0
  const n = Number(String(v).replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function parseOneBlock(block) {
  const p = String(block)
    .split(/[|｜¦]/)
    .map(s => s.trim())
    .filter((s, i) => !(i > 0 && s === ''))
  if (!p.length) return null

  let row
  if (p.length >= 10) {
    row = {
      nombre: p[0],
      promUd: num(p[1]),
      udMtd: num(p[2]),
      falta: num(p[3]),
      promClp: num(p[4]),
      clpMtd: num(p[5]),
      ultima: p[6] || null,
      cicloDias: p[7] !== '' && !isNaN(Number(p[7])) ? Number(p[7]) : null,
      nCompras: p[8] !== '' && !isNaN(Number(p[8])) ? Number(p[8]) : null,
      estadoRecompra: p[9] || null,
    }
  } else if (p.length >= 5) {
    row = {
      nombre: p[0],
      promUd: num(p[1]),
      udMtd: num(p[2]),
      falta: Math.max(0, num(p[1]) - num(p[2])),
      promClp: num(p[3]),
      clpMtd: num(p[4]),
      ultima: p[5] || null,
      cicloDias: p[6] !== '' && !isNaN(Number(p[6])) ? Number(p[6]) : null,
      nCompras: p[7] !== '' && !isNaN(Number(p[7])) ? Number(p[7]) : null,
      estadoRecompra: null,
    }
  } else {
    return null
  }

  if (isGarbageName(row.nombre)) return null
  // Sanear $ ridículos (campo corrido)
  if (row.promClp > 0 && row.promClp < 500 && row.promUd > 10) {
    // probablemente promClp no es plata
    row.promClp = 0
  }
  return row
}

export function parseSkuDetalle(text) {
  if (!text) return []
  const raw = String(text).trim()
  if (!raw) return []

  let blocks
  if (raw.includes('\n')) {
    blocks = raw.split(/\n+/).map(s => s.trim()).filter(Boolean)
  } else if (raw.includes('||')) {
    blocks = raw.split('||').map(s => s.trim()).filter(Boolean)
  } else if (raw.includes(' · ')) {
    // no partir tamaños 1X2,5 — los productos suelen venir por || o \n
    blocks = [raw]
  } else {
    blocks = [raw]
  }

  // Si un "block" sigue sin pipes y es corto, descartar
  const out = []
  for (const b of blocks) {
    if (!b.includes('|') && !b.includes('｜')) {
      // puede ser solo nombre
      if (!isGarbageName(b)) {
        out.push({
          nombre: b,
          promUd: 0,
          udMtd: 0,
          falta: 0,
          promClp: 0,
          clpMtd: 0,
          ultima: null,
          cicloDias: null,
          nCompras: null,
        })
      }
      continue
    }
    const row = parseOneBlock(b)
    if (row) out.push(row)
  }
  return out
}

export function pctRitmo(udMtd, promUd) {
  if (!promUd || promUd <= 0) return null
  const p = Math.round((udMtd / promUd) * 100)
  if (p > 300) return 300 // cap visual
  if (p < 0) return 0
  return p
}

export function cicloReposicion(s) {
  let diasUltima = null
  if (s.ultima) {
    const d = new Date(String(s.ultima).slice(0, 10) + 'T12:00:00')
    if (!isNaN(d.getTime())) {
      diasUltima = Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000))
    }
  }
  const cicloEst =
    s.cicloDias != null && Number(s.cicloDias) > 0 ? Math.round(Number(s.cicloDias)) : null
  let recompra = null
  if (diasUltima != null && cicloEst != null) {
    const delta = diasUltima - cicloEst
    if (delta >= 3) recompra = { label: `Atrasa ${delta}d`, tone: 'bad', delta }
    else if (delta >= 0) recompra = { label: 'Hoy reponer', tone: 'warn', delta }
    else if (delta === -1) recompra = { label: 'Mañana', tone: 'ok', delta }
    else recompra = { label: `En ${Math.abs(delta)}d`, tone: 'muted', delta }
  } else if (diasUltima != null && diasUltima >= 21) {
    recompra = { label: `Sin compra ${diasUltima}d`, tone: 'warn', delta: diasUltima }
  }
  return { diasUltima, cicloEst, recompra }
}

export function skusAReponer(c) {
  try {
    return parseSkuDetalle(c?.sku_detalle)
      .map(s => {
        const r = cicloReposicion(s)
        if (!r.recompra || (r.recompra.tone !== 'bad' && r.recompra.tone !== 'warn')) return null
        return { ...s, ...r }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

export function scoreVisita(item, myPos) {
  let score = 0
  const skus = skusAReponer(item)
  if (skus.some(s => s.recompra?.tone === 'bad')) score += 40
  else if (skus.length) score += 25

  const venta = Number(item.venta_mensual || item.venta_mtd || item.potencial) || 0
  if (venta >= 500000) score += 25
  else if (venta >= 200000) score += 15
  else if (venta >= 50000) score += 8

  const est = String(item.estado_fuga || '')
  if (est.includes('RIESGO') || est.includes('ENFRI')) score += 15
  else if (est.includes('ACTIVO')) score += 8
  else if (est.includes('DORMIDO') || est.includes('FUGA')) score += 12

  if (myPos?.lat != null && item.lat != null) {
    const d = haversineM(myPos.lat, myPos.lng, item.lat, item.lng)
    if (d != null) {
      if (d <= 800) score += 20
      else if (d <= 2000) score += 12
      else if (d <= 5000) score += 5
    }
  }

  if (item._tipo === 'prospecto' && Number(item.score || item.potencial) > 0) score += 10
  return Math.min(100, score)
}

/**
 * Nearest-neighbor clásico (solo distancia).
 * Preferí ordenarRutaOptima para terreno real (distancia + prioridad comercial).
 */
export function ordenarPorDistancia(paradas, origin) {
  return ordenarRutaOptima(paradas, origin, { priorityWeight: 0 }).ordered
}

/**
 * Ruta óptima para fuerza de ventas:
 * nearest-neighbor con sesgo de prioridad (reponer / riesgo / $).
 *
 * cost = distancia_m - priorityWeight * score(0-100)
 * → prioriza clientes urgentes cuando están a distancias similares.
 *
 * @returns {{ ordered, totalM, legs }}
 */
export function ordenarRutaOptima(paradas, origin, opts = {}) {
  const priorityWeight = opts.priorityWeight != null ? opts.priorityWeight : 35 // metros “ahorrados” por punto de score
  const withGeo = paradas.filter(p => p.lat != null && p.lng != null && !isNaN(Number(p.lat)))
  const without = paradas.filter(p => p.lat == null || p.lng == null || isNaN(Number(p.lat)))
  if (!withGeo.length) return { ordered: [...paradas], totalM: 0, legs: [] }

  let originLat = origin?.lat != null ? Number(origin.lat) : null
  let originLng = origin?.lng != null ? Number(origin.lng) : null
  if (originLat == null || originLng == null) {
    originLat = Number(withGeo[0].lat)
    originLng = Number(withGeo[0].lng)
  }

  const remaining = withGeo.map(p => ({
    ...p,
    _score: scoreVisita(p, { lat: originLat, lng: originLng }),
  }))
  const ordered = []
  const legs = []
  let curLat = originLat
  let curLng = originLng
  let totalM = 0

  while (remaining.length) {
    let bestI = 0
    let bestCost = Infinity
    let bestD = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineM(curLat, curLng, remaining[i].lat, remaining[i].lng)
      if (d == null) continue
      const cost = d - priorityWeight * (remaining[i]._score || 0)
      if (cost < bestCost) {
        bestCost = cost
        bestD = d
        bestI = i
      }
    }
    const next = remaining.splice(bestI, 1)[0]
    legs.push({ from: { lat: curLat, lng: curLng }, to: next, m: bestD })
    totalM += bestD === Infinity ? 0 : bestD
    ordered.push(next)
    curLat = Number(next.lat)
    curLng = Number(next.lng)
  }

  return { ordered: [...ordered, ...without], totalM, legs }
}

/** Resumen legible: km + ETA aprox (25 km/h urbano) */
export function metricasRuta(ordered, origin) {
  const { totalM, legs } = ordenarRutaOptima(ordered, origin, { priorityWeight: 0 })
  const km = totalM / 1000
  const min = Math.max(ordered.length * 12, Math.round((km / 25) * 60) + ordered.length * 8) // viaje + 8–12 min por parada
  return {
    totalM,
    km: Math.round(km * 10) / 10,
    etaMin: min,
    stops: ordered.length,
    legs,
  }
}

/**
 * Candidatos para “Armar ruta del día”:
 * top N por scoreVisita, con geo, no bloqueados, opc. radio km.
 */
/**
 * Candidatos para la ruta del día:
 * - Clientes priorizados por score (reponer / riesgo / $)
 * - Prospectos cercanos con geo, mezclados para maximizar oportunidades
 *
 * Filosofía: la ruta no es solo recuperar clientes — es también prospectar.
 * Si hay prospectos cerca que coinciden con los focos, entran en la ruta.
 */
export function candidatosRutaDia(territorio, myPos, opts = {}) {
  const maxStops    = opts.maxStops    || 10
  const radioKm     = opts.radioKm    != null ? opts.radioKm : 15
  const maxProspect = opts.maxProspect != null ? opts.maxProspect : 3 // máx prospectos en la ruta

  const withGeo = (territorio || []).filter(c => {
    if (c.es_bloqueado) return false
    if (c.lat == null || c.lng == null) return false
    if (myPos?.lat != null && radioKm > 0) {
      const d = haversineM(myPos.lat, myPos.lng, c.lat, c.lng)
      if (d != null && d > radioKm * 1000) return false
    }
    return true
  })

  // Separar clientes y prospectos
  const clientes   = withGeo.filter(c => c._tipo !== 'prospecto')
  const prospectos = withGeo.filter(c => c._tipo === 'prospecto')

  // Score clientes (score real comercial)
  const clientesCon = clientes
    .map(c => ({ ...c, _score: scoreVisita(c, myPos) }))
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, maxStops - maxProspect)

  // Score prospectos: garantizar score mínimo 5 si tienen geo
  // Priorizamos por: cercanía + rating Google (score) + potencial
  const prospectosCon = prospectos
    .map(p => {
      let s = 5 // base garantida
      const rating = Number(p.score || 0)
      if (rating >= 4.5) s += 20
      else if (rating >= 4.0) s += 12
      else if (rating >= 3.5) s += 6
      if (myPos?.lat != null && p.lat != null) {
        const d = haversineM(myPos.lat, myPos.lng, p.lat, p.lng)
        if (d != null) {
          if (d <= 500)  s += 25
          else if (d <= 1000) s += 18
          else if (d <= 2000) s += 10
          else if (d <= 4000) s += 4
        }
      }
      // Bonus si tiene oferta alineada con focos
      if (p.oferta || p.productos_top) s += 8
      return { ...p, _score: Math.min(100, s) }
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, maxProspect)

  // Mezclar: cliente urgente primero, luego intercalar 1 prospecto cada ~3 clientes
  const result = []
  let pi = 0
  for (let i = 0; i < clientesCon.length; i++) {
    result.push(clientesCon[i])
    // Insertar un prospecto cada 3 clientes si queda cupo
    if ((i + 1) % 3 === 0 && pi < prospectosCon.length) {
      result.push(prospectosCon[pi++])
    }
  }
  // Agregar prospectos restantes al final si hay cupo
  while (pi < prospectosCon.length && result.length < maxStops) {
    result.push(prospectosCon[pi++])
  }

  return result.slice(0, maxStops)
}
