/**
 * Zone theme — única fuente de verdad visual de zonas de terreno.
 * Nunca hardcodear colores de zona en pages/ o App.jsx.
 */

export const ZONE_THEME = Object.freeze({
  'NOR-ORIENTE': Object.freeze({
    key: 'NOR-ORIENTE',
    label: 'Nor-Oriente',
    short: 'N-Oriente',
    chip: '#c2410c',
    chipMuted: '#fdba74',
    header: '#1e3a5f',
    soft: '#fff7ed',
    ring: 'rgba(194, 65, 12, 0.20)',
    onChip: '#ffffff',
    cssKey: 'nor-oriente',
  }),
  'NOR-PONIENTE': Object.freeze({
    key: 'NOR-PONIENTE',
    label: 'Nor-Poniente',
    short: 'N-Poniente',
    chip: '#0d9488',
    chipMuted: '#5eead4',
    header: '#0f766e',
    soft: '#f0fdfa',
    ring: 'rgba(13, 148, 136, 0.20)',
    onChip: '#ffffff',
    cssKey: 'nor-poniente',
  }),
  'ZONA SUR': Object.freeze({
    key: 'ZONA SUR',
    label: 'Zona Sur',
    short: 'Sur',
    chip: '#ea580c',
    chipMuted: '#fdba74',
    header: '#7c2d12',
    soft: '#fff7ed',
    ring: 'rgba(234, 88, 12, 0.20)',
    onChip: '#ffffff',
    cssKey: 'sur',
  }),
})

export const ZONE_ORDER = Object.freeze(['NOR-ORIENTE', 'NOR-PONIENTE', 'ZONA SUR'])

const DEFAULT_THEME = Object.freeze({
  key: 'DEFAULT',
  label: 'Zona',
  short: 'Zona',
  chip: '#c2410c',
  chipMuted: '#fdba74',
  header: '#1c1917',
  soft: '#fff7ed',
  ring: 'rgba(194, 65, 12, 0.18)',
  onChip: '#ffffff',
  cssKey: 'default',
})

export function normalizeZoneKey(zona) {
  return String(zona || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getZoneTheme(zona) {
  const key = normalizeZoneKey(zona)
  if (ZONE_THEME[key]) return ZONE_THEME[key]
  if (key.includes('ORIENTE')) return ZONE_THEME['NOR-ORIENTE']
  if (key.includes('PONIENTE')) return ZONE_THEME['NOR-PONIENTE']
  if (key.includes('SUR')) return ZONE_THEME['ZONA SUR']
  if (!key) return DEFAULT_THEME
  return Object.freeze({
    ...DEFAULT_THEME,
    key,
    label: String(zona).trim() || 'Zona',
    short: String(zona).trim().slice(0, 12) || 'Zona',
  })
}

/** Inline style vars for a node (tab, header chip). */
export function zoneCssVars(theme) {
  const t = theme || DEFAULT_THEME
  return {
    '--zone-chip': t.chip,
    '--zone-chip-muted': t.chipMuted,
    '--zone-header': t.header,
    '--zone-soft': t.soft,
    '--zone-ring': t.ring,
    '--zone-on-chip': t.onChip,
  }
}

/**
 * Publica en :root el color de zona activa (headers, mapas, acentos).
 * Usa hex reales — nunca nombres de var() sin resolver.
 */
export function applyZoneCssVars(zona) {
  if (typeof document === 'undefined') return
  const t = getZoneTheme(zona)
  const root = document.documentElement
  root.style.setProperty('--zone-active', t.chip)
  root.style.setProperty('--zone-active-soft', t.soft)
  root.style.setProperty('--zone-active-ring', t.ring)
  root.style.setProperty('--zone-active-header', t.header)
  root.dataset.zone = t.cssKey || t.key
}

export function sortZones(list = []) {
  return [...list].sort((a, b) => {
    const za = normalizeZoneKey(a?.zona)
    const zb = normalizeZoneKey(b?.zona)
    const ia = ZONE_ORDER.indexOf(za)
    const ib = ZONE_ORDER.indexOf(zb)
    if (ia < 0 && ib < 0) return za.localeCompare(zb)
    if (ia < 0) return 1
    if (ib < 0) return -1
    return ia - ib
  })
}

/** Lista de labels de zona a partir de ejecutivos (TopBar / ZoneTabs). */
export function zonesFromEjecutivos(todos = []) {
  const set = new Set((todos || []).map((e) => e.zona).filter(Boolean))
  const ordered = ZONE_ORDER.filter((z) => set.has(z))
  const extra = [...set].filter((z) => !ZONE_ORDER.includes(z)).sort()
  return ordered.concat(extra)
}
