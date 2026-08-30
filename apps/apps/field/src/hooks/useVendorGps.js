/**
 * GPS del vendedor — origen del Plan del día y mapa.
 * Una lectura al montar + refresh opcional; cachea en sessionStorage.
 */
import { useCallback, useEffect, useState } from 'react'
import { getPositionPrecise, accuracyLabel, formatDist } from '../lib/geo.js'

const CACHE_KEY = 'bs_vendor_gps_v1'
const CACHE_MAX_AGE_MS = 5 * 60 * 1000 // 5 min

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o?.lat || !o?.lng) return null
    if (Date.now() - (o.ts || 0) > CACHE_MAX_AGE_MS) return null
    return o
  } catch {
    return null
  }
}

function writeCache(pos) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        ts: Date.now(),
        source: pos.source || null,
      })
    )
  } catch {
    /* ignore */
  }
}

export function useVendorGps(opts = {}) {
  const auto = opts.auto !== false
  const [gps, setGps] = useState(() => {
    const c = readCache()
    return c
      ? {
          lat: c.lat,
          lng: c.lng,
          accuracy: c.accuracy,
          error: null,
          loading: false,
          fromCache: true,
          label: accuracyLabel(c.accuracy),
        }
      : {
          lat: null,
          lng: null,
          accuracy: null,
          error: null,
          loading: auto,
          fromCache: false,
          label: null,
        }
  })

  const refresh = useCallback(async (force = false) => {
    setGps((g) => ({ ...g, loading: true, error: null }))
    const pos = await getPositionPrecise({
      targetAccM: opts.targetAccM ?? 100,
      maxWaitMs: opts.maxWaitMs ?? 20000,
    })
    if (pos?.lat != null && pos?.lng != null) {
      writeCache(pos)
      setGps({
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy ?? null,
        error: null,
        loading: false,
        fromCache: false,
        label: accuracyLabel(pos.accuracy),
        source: pos.source || null,
      })
      return pos
    }
    // Mantener cache si hay
    const c = readCache()
    if (c && !force) {
      setGps({
        lat: c.lat,
        lng: c.lng,
        accuracy: c.accuracy,
        error: pos?.error || 'stale',
        loading: false,
        fromCache: true,
        label: accuracyLabel(c.accuracy),
      })
      return c
    }
    setGps({
      lat: null,
      lng: null,
      accuracy: null,
      error: pos?.error || 'no_geo',
      loading: false,
      fromCache: false,
      label: null,
    })
    return null
  }, [opts.targetAccM, opts.maxWaitMs])

  useEffect(() => {
    if (!auto) return
    let cancelled = false
    ;(async () => {
      const pos = await getPositionPrecise({
        targetAccM: opts.targetAccM ?? 100,
        maxWaitMs: opts.maxWaitMs ?? 20000,
      })
      if (cancelled) return
      if (pos?.lat != null) {
        writeCache(pos)
        setGps({
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy ?? null,
          error: null,
          loading: false,
          fromCache: false,
          label: accuracyLabel(pos.accuracy),
          source: pos.source || null,
        })
      } else {
        setGps((g) => ({
          ...g,
          loading: false,
          error: g.lat ? null : pos?.error || 'no_geo',
        }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [auto, opts.targetAccM, opts.maxWaitMs])

  const origin =
    gps.lat != null && gps.lng != null
      ? { lat: gps.lat, lng: gps.lng }
      : null

  return {
    ...gps,
    origin,
    refresh,
    ready: origin != null,
    accText: gps.label?.text || null,
    accLevel: gps.label?.level || null,
  }
}

export { formatDist }
