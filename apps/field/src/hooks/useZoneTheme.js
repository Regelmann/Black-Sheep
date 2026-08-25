import { useMemo } from 'react'
import {
  getZoneTheme,
  zoneCssVars,
  applyZoneCssVars,
  sortZones,
  normalizeZoneKey,
  zonesFromEjecutivos,
  ZONE_ORDER,
  ZONE_THEME,
} from '../lib/theme/zones'

/**
 * Theme de la zona activa (o override).
 * @param {string} [zona]
 */
export function useZoneTheme(zona) {
  return useMemo(() => {
    const theme = getZoneTheme(zona)
    return {
      ...theme,
      zona: theme.key,
      cssVars: zoneCssVars(theme),
    }
  }, [zona])
}

/**
 * Lista deduplicada y ordenada de zonas a partir de ejecutivos.
 */
export function useZoneList(ejecutivos = []) {
  return useMemo(() => {
    if (!Array.isArray(ejecutivos) || !ejecutivos.length) return []
    const byZone = new Map()
    for (const e of ejecutivos) {
      const key = normalizeZoneKey(e?.zona)
      if (!key || byZone.has(key)) continue
      byZone.set(key, {
        id: e.id || key,
        zona: e.zona,
        nombre: e.nombre,
        theme: getZoneTheme(key),
      })
    }
    return sortZones(Array.from(byZone.values()))
  }, [ejecutivos])
}

export {
  getZoneTheme,
  zoneCssVars,
  applyZoneCssVars,
  zonesFromEjecutivos,
  normalizeZoneKey,
  ZONE_ORDER,
  ZONE_THEME,
}
