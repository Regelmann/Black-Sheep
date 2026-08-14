/* KF_GEO_V2 mobile-first */
/**
 * Geolocalización KeyFoods Field
 * Browser + Capacitor (app nativa) cuando está disponible.
 */

export function haversineM(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => v == null || isNaN(Number(v)))) return null
  const R = 6371000
  const toRad = d => (Number(d) * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatDist(m) {
  if (m == null || isNaN(m)) return '—'
  if (m < 1000) return Math.round(m) + ' m'
  return (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km'
}

export function formatEta(m) {
  if (m == null || isNaN(m)) return null
  const min = Math.max(1, Math.round((m / 1000 / 25) * 60))
  if (min < 60) return '~' + min + ' min'
  const h = Math.floor(min / 60)
  const r = min % 60
  return '~' + h + 'h' + (r ? ' ' + r + 'm' : '')
}

export function accuracyLabel(acc) {
  if (acc == null || isNaN(acc)) return { text: 'sin precisión', level: 'bad' }
  if (acc <= 25) return { text: 'GPS preciso', level: 'good' }
  if (acc <= 50) return { text: 'GPS bueno', level: 'ok' }
  if (acc <= 100) return { text: 'GPS aproximado', level: 'warn' }
  return { text: 'GPS poco preciso', level: 'bad' }
}

export function isNearClient(myLat, myLng, cLat, cLng, maxM = 150) {
  const d = haversineM(myLat, myLng, cLat, cLng)
  return d != null && d <= maxM
}

function posFromCoords(p) {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: p.coords.accuracy,
    altitude: p.coords.altitude,
    heading: p.coords.heading,
    speed: p.coords.speed,
    ts: p.timestamp,
    error: null,
  }
}

async function tryCapacitorGeolocation() {
  try {
    if (typeof window === 'undefined') return null
    const Cap = window.Capacitor
    if (!Cap?.Plugins?.Geolocation) return null
    const p = await Cap.Plugins.Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
    return {
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      accuracy: p.coords.accuracy,
      error: null,
      source: 'capacitor',
    }
  } catch {
    return null
  }
}

export function getPosition(opts = {}) {
  const options = {
    enableHighAccuracy: opts.enableHighAccuracy !== false,
    timeout: opts.timeout ?? 20000,
    maximumAge: opts.maximumAge ?? 0,
  }
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      return resolve({ lat: null, lng: null, accuracy: null, error: 'no_geo' })
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve(posFromCoords(p)),
      err =>
        resolve({
          lat: null,
          lng: null,
          accuracy: null,
          error: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable',
        }),
      options
    )
  })
}

export async function getPositionPrecise(opts = {}) {
  const targetAccM = opts.targetAccM ?? 40
  const maxWaitMs = opts.maxWaitMs ?? 12000
  const enableHighAccuracy = opts.enableHighAccuracy !== false

  const cap = await tryCapacitorGeolocation()
  if (cap?.lat != null && (cap.accuracy == null || cap.accuracy <= Math.max(targetAccM, 80))) {
    return { ...cap, pending: false }
  }

  return new Promise(resolve => {
    if (!navigator.geolocation) {
      return resolve(cap || { lat: null, lng: null, accuracy: null, error: 'no_geo' })
    }

    let best = cap || null
    let settled = false

    const finish = result => {
      if (settled) return
      settled = true
      try {
        navigator.geolocation.clearWatch(watchId)
      } catch (_) {}
      clearTimeout(timer)
      resolve(result)
    }

    const watchId = navigator.geolocation.watchPosition(
      p => {
        const cur = posFromCoords(p)
        if (!best || (cur.accuracy != null && cur.accuracy < (best.accuracy ?? 9999))) {
          best = cur
        }
        if (best.accuracy != null && best.accuracy <= targetAccM) {
          finish(best)
        }
      },
      err => {
        if (best) return finish(best)
        finish({
          lat: null,
          lng: null,
          accuracy: null,
          error: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable',
        })
      },
      { enableHighAccuracy, timeout: maxWaitMs, maximumAge: 0 }
    )

    const timer = setTimeout(() => {
      if (best) finish(best)
      else finish({ lat: null, lng: null, accuracy: null, error: 'timeout' })
    }, maxWaitMs)
  })
}

export function watchPosition(onUpdate, opts = {}) {
  if (!navigator.geolocation) {
    onUpdate({ lat: null, lng: null, accuracy: null, error: 'no_geo' })
    return () => {}
  }

  const acceptAccM = opts.acceptAccM ?? 120
  const hardRejectM = opts.hardRejectM ?? 400
  const minMoveM = opts.minMoveM ?? 25
  const enableHighAccuracy = opts.enableHighAccuracy !== false

  let lastGood = null

  const id = navigator.geolocation.watchPosition(
    p => {
      const cur = posFromCoords(p)
      const acc = cur.accuracy

      if (acc != null && acc > hardRejectM) {
        onUpdate({ ...cur, pending: true, rejected: true })
        return
      }

      if (!lastGood) {
        if (acc == null || acc <= acceptAccM) {
          lastGood = cur
          onUpdate({ ...cur, pending: false })
        } else {
          onUpdate({ ...cur, pending: true })
        }
        return
      }

      const moved = haversineM(lastGood.lat, lastGood.lng, cur.lat, cur.lng)
      const better = acc != null && lastGood.accuracy != null && acc < lastGood.accuracy - 5
      if (better || (moved != null && moved >= minMoveM && (acc == null || acc <= acceptAccM * 1.5))) {
        lastGood = cur
        onUpdate({ ...cur, pending: false })
      }
    },
    err => {
      onUpdate({
        lat: lastGood?.lat ?? null,
        lng: lastGood?.lng ?? null,
        accuracy: lastGood?.accuracy ?? null,
        error: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable',
      })
    },
    { enableHighAccuracy, timeout: 20000, maximumAge: 0 }
  )

  return () => {
    try {
      navigator.geolocation.clearWatch(id)
    } catch (_) {}
  }
}


/** Mejor esfuerzo: Capacitor → getCurrent → watch corto. Pensado para móvil. */
export function getPositionPrecise(opts = {}) {
  const maxWaitMs = opts.maxWaitMs ?? 18000
  const targetAccM = opts.targetAccM ?? 50
  return new Promise(async resolve => {
    const cap = await tryCapacitorGeolocation()
    if (cap?.lat != null) return resolve(cap)

    if (!navigator.geolocation) {
      return resolve({ lat: null, lng: null, accuracy: null, error: 'no_geo' })
    }

    let best = null
    let done = false
    const finish = r => {
      if (done) return
      done = true
      try { navigator.geolocation.clearWatch(wid) } catch (_) {}
      resolve(r)
    }

    // Primer intento rápido
    navigator.geolocation.getCurrentPosition(
      pos => {
        best = posFromCoords(pos)
        best.source = 'browser'
        if (best.accuracy != null && best.accuracy <= targetAccM) finish(best)
      },
      () => {},
      { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 }
    )

    const wid = navigator.geolocation.watchPosition(
      pos => {
        const cur = posFromCoords(pos)
        cur.source = 'watch'
        if (!best || (cur.accuracy != null && cur.accuracy < (best.accuracy ?? 9999))) best = cur
        if (best.accuracy != null && best.accuracy <= targetAccM) finish(best)
      },
      err => {
        if (best) return finish(best)
        finish({
          lat: null,
          lng: null,
          accuracy: null,
          error: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable',
        })
      },
      { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 }
    )

    setTimeout(() => {
      if (best) finish(best)
      else finish({ lat: null, lng: null, accuracy: null, error: 'timeout' })
    }, maxWaitMs)
  })
}
