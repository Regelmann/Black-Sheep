/**
 * Coach del día + scoring de visitas (KeyFoods Field)
 * Ciclo real desde sku_detalle V1.4: nombre||prom||mtd||clp||clp_mtd||ultima||ciclo||n
 */

import { haversineM } from './geo'

export function parseSkuDetalle(text) {
  if (!text) return []
  return String(text)
    .split(/\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const p = line.split('||')
      if (p.length >= 5) {
        const cicloRaw = p[6]
        return {
          nombre: p[0],
          promUd: Number(p[1]) || 0,
          udMtd: Number(p[2]) || 0,
          promClp: Number(p[3]) || 0,
          clpMtd: Number(p[4]) || 0,
          ultima: p[5] || null,
          cicloDias:
            cicloRaw !== undefined && cicloRaw !== '' && !isNaN(Number(cicloRaw))
              ? Number(cicloRaw)
              : null,
          nCompras: p[7] !== undefined && p[7] !== '' ? Number(p[7]) || 0 : null,
        }
      }
      return null
    })
    .filter(Boolean)
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

/** Score 0–100: ciclo vencido + valor + cercanía + riesgo */
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

/** Nearest-neighbor order from origin (myPos or first stop) */
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

export function buildCoach(territorio, visitas, myPos) {
  const clientes = (territorio || []).filter(t => t._tipo === 'cliente')
  const reponer = clientes
    .map(c => {
      const skus = skusAReponer(c)
      if (!skus.length) return null
      return {
        ...c,
        _skus: skus,
        _score: scoreVisita({ ...c, _tipo: 'cliente' }, myPos),
        _urgencia: skus.some(s => s.recompra?.tone === 'bad') ? 2 : 1,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b._urgencia - a._urgencia || b._score - a._score)
    .slice(0, 8)

  const riesgo = clientes
    .filter(c => {
      const e = String(c.estado_fuga || '')
      return e.includes('RIESGO') || e.includes('ENFRI') || e.includes('DORMIDO')
    })
    .map(c => ({
      ...c,
      _score: scoreVisita(c, myPos),
      _dist:
        myPos?.lat != null && c.lat != null
          ? haversineM(myPos.lat, myPos.lng, c.lat, c.lng)
          : null,
    }))
    .sort((a, b) => (a._dist ?? 9e9) - (b._dist ?? 9e9) || b._score - a._score)
    .slice(0, 5)

  const enRuta = new Set(
    (visitas || []).map(v => String(v.punto_id_bq || v.cliente_key || '')).filter(Boolean)
  )
  const cercanos = clientes
    .filter(c => c.lat != null && myPos?.lat != null && !enRuta.has(String(c.cliente_key)))
    .map(c => ({
      ...c,
      _dist: haversineM(myPos.lat, myPos.lng, c.lat, c.lng),
      _score: scoreVisita(c, myPos),
    }))
    .filter(c => c._dist != null && c._dist <= 2500)
    .sort((a, b) => a._dist - b._dist)
    .slice(0, 5)

  return { reponer, riesgo, cercanos }
}
