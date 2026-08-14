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

export function ordenarPorDistancia(paradas, origin) {
  const withGeo = paradas.filter(p => p.lat != null && p.lng != null)
  const without = paradas.filter(p => p.lat == null || p.lng == null)
  if (!withGeo.length) return paradas

  let originLat = origin?.lat
  let originLng = origin?.lng
  if (originLat == null || originLng == null) {
    originLat = Number(withGeo[0].lat)
    originLng = Number(withGeo[0].lng)
  }

  const remaining = [...withGeo]
  const ordered = []
  let curLat = originLat
  let curLng = originLng
  while (remaining.length) {
    let bestI = 0
    let bestD = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineM(curLat, curLng, remaining[i].lat, remaining[i].lng)
      if (d != null && d < bestD) {
        bestD = d
        bestI = i
      }
    }
    const next = remaining.splice(bestI, 1)[0]
    ordered.push(next)
    curLat = Number(next.lat)
    curLng = Number(next.lng)
  }
  return [...ordered, ...without]
}
