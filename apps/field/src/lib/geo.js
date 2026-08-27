/**
 * Geolocalización KeyFoods Field — mobile-first
 * Estrategia: red/WiFi rápido → GPS preciso → watch en vivo
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
  if (acc <= 30) return { text: 'GPS preciso', level: 'good' }
  if (acc <= 80) return { text: 'GPS bueno', level: 'ok' }
  if (acc <= 200) return { text: 'Aprox. (red/WiFi)', level: 'warn' }
  return { text: 'Poco preciso', level: 'bad' }
}

export function isNearClient(myLat, myLng, cLat, cLng, maxM = 150) {
  const d = haversineM(myLat, myLng, cLat, cLng)
  return d != null && d <= maxM
}

function posFromCoords(p, source = 'browser') {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: p.coords.accuracy,
    altitude: p.coords.altitude,
    heading: p.coords.heading,
    speed: p.coords.speed,
    ts: p.timestamp,
    error: null,
    source,
  }
}

function errCode(err) {
  if (!err) return 'unavailable'
  if (err.code === 1) return 'denied'
  if (err.code === 3) return 'timeout'
  return 'unavailable'
}

/** Mensaje legible para el vendedor */
export function geoErrorMessage(code) {
  switch (code) {
    case 'denied':
      return 'Ubicación bloqueada. En el celular: candado de la URL → Permisos → Ubicación → Permitir'
    case 'timeout':
      return 'GPS tardó demasiado. Salí al exterior o activá “Ubicación precisa”'
    case 'no_geo':
      return 'Este navegador no soporta GPS'
    default:
      return 'No se pudo obtener ubicación. Activá GPS del sistema y reintentá'
  }
}

async function tryCapacitorGeolocation() {
  try {
    if (typeof window === 'undefined') return null
    const Cap = window.Capacitor
    if (!Cap?.Plugins?.Geolocation) return null
    const p = await Cap.Plugins.Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 10000,
    })
    return { ...posFromCoords(p, 'capacitor'), pending: false }
  } catch {
    return null
  }
}

/**
 * getCurrentPosition envuelto en Promise (una lectura).
 * maximumAge > 0 ayuda en móvil (usa caché reciente).
 */
export function getPosition(opts = {}) {
  const options = {
    enableHighAccuracy: opts.enableHighAccuracy !== false,
    timeout: opts.timeout ?? 25000,
    maximumAge: opts.maximumAge ?? 15000,
  }
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return resolve({ lat: null, lng: null, accuracy: null, error: 'no_geo' })
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve(posFromCoords(p)),
      err =>
        resolve({
          lat: null,
          lng: null,
          accuracy: null,
          error: errCode(err),
        }),
      options
    )
  })
}

/**
 * Mejor esfuerzo para móvil:
 * 1) Capacitor si existe
 * 2) Lectura rápida (WiFi/red, highAccuracy false) — suele funcionar en interior
 * 3) Lectura GPS (highAccuracy true)
 * 4) watch corto hasta targetAcc o timeout
 */
export async function getPositionPrecise(opts = {}) {
  const targetAccM = opts.targetAccM ?? 80
  const maxWaitMs = opts.maxWaitMs ?? 25000

  // Secure context (HTTPS) es obligatorio en móvil
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return { lat: null, lng: null, accuracy: null, error: 'insecure' }
  }

  const cap = await tryCapacitorGeolocation()
  if (cap?.lat != null) {
    if (cap.accuracy == null || cap.accuracy <= Math.max(targetAccM * 2, 150)) {
      return { ...cap, pending: false }
    }
  }

  // 2) Red / WiFi (rápido, funciona en muchos celulares bajo techo)
  const coarse = await getPosition({
    enableHighAccuracy: false,
    timeout: 12000,
    maximumAge: 60000,
  })
  if (coarse?.lat != null) {
    // Si ya es suficientemente bueno, devolver
    if (coarse.accuracy == null || coarse.accuracy <= targetAccM) {
      return { ...coarse, pending: false, source: coarse.source || 'network' }
    }
  }

  // 3) GPS de alta precisión
  const fine = await getPosition({
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 5000,
  })
  if (fine?.lat != null) {
    const best =
      coarse?.lat != null &&
      (coarse.accuracy ?? 9999) < (fine.accuracy ?? 9999)
        ? coarse
        : fine
    if (best.accuracy == null || best.accuracy <= targetAccM) {
      return { ...best, pending: false }
    }
    // Seguir refinando con watch, pero ya tenemos algo
  }

  let best =
    [cap, fine, coarse]
      .filter(p => p?.lat != null)
      .sort((a, b) => (a.accuracy ?? 9999) - (b.accuracy ?? 9999))[0] || null

  // 4) Watch corto para mejorar
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      return resolve(best || { lat: null, lng: null, accuracy: null, error: 'no_geo' })
    }

    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      try {
        navigator.geolocation.clearWatch(watchId)
      } catch (_) { void _ }
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
          finish({ ...best, pending: false })
        }
      },
      err => {
        if (best?.lat != null) return finish({ ...best, pending: false })
        finish({
          lat: null,
          lng: null,
          accuracy: null,
          error: errCode(err),
        })
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )

    const timer = setTimeout(() => {
      if (best?.lat != null) finish({ ...best, pending: false })
      else finish({ lat: null, lng: null, accuracy: null, error: 'timeout' })
    }, maxWaitMs)
  })
}

/**
 * Seguimiento en vivo. Más permisivo en precisión (móvil real ~50–200 m en ciudad).
 */
export function watchPosition(onUpdate, opts = {}) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onUpdate({ lat: null, lng: null, accuracy: null, error: 'no_geo' })
    return () => {}
  }

  const enableHighAccuracy = opts.enableHighAccuracy !== false
  const acceptAccM = opts.acceptAccM ?? 250 // antes 80 — demasiado estricto en calle
  const hardRejectM = opts.hardRejectM ?? 2500
  const minMoveM = opts.minMoveM ?? 8

  let lastGood = null
  let gotAny = false

  // Primera lectura rápida (puede ser red)
  navigator.geolocation.getCurrentPosition(
    p => {
      const cur = posFromCoords(p)
      if (cur.accuracy != null && cur.accuracy > hardRejectM) {
        onUpdate({ ...cur, pending: true, error: 'coarse' })
        return
      }
      lastGood = cur
      gotAny = true
      onUpdate({ ...cur, pending: false })
    },
    err => {
      onUpdate({
        lat: null,
        lng: null,
        accuracy: null,
        error: errCode(err),
      })
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
  )

  const id = navigator.geolocation.watchPosition(
    p => {
      const cur = posFromCoords(p)
      const acc = cur.accuracy

      if (acc != null && acc > hardRejectM) {
        if (!gotAny) onUpdate({ ...cur, pending: true, error: 'coarse' })
        return
      }

      if (!lastGood) {
        lastGood = cur
        gotAny = true
        onUpdate({ ...cur, pending: false })
        return
      }

      const moved = haversineM(lastGood.lat, lastGood.lng, cur.lat, cur.lng)
      const better = acc != null && lastGood.accuracy != null && acc < lastGood.accuracy - 8
      const goodEnough = acc == null || acc <= acceptAccM
      const movedEnough = moved != null && moved >= minMoveM

      if (better || (goodEnough && movedEnough) || (goodEnough && !gotAny)) {
        lastGood = cur
        gotAny = true
        onUpdate({ ...cur, pending: false })
      }
    },
    err => {
      onUpdate({
        lat: lastGood?.lat ?? null,
        lng: lastGood?.lng ?? null,
        accuracy: lastGood?.accuracy ?? null,
        error: errCode(err),
      })
    },
    { enableHighAccuracy, timeout: 25000, maximumAge: 5000 }
  )

  return () => {
    try {
      navigator.geolocation.clearWatch(id)
    } catch (_) { void _ }
  }
}
