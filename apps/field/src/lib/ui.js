/** Helpers UX compartidos — estados KeyFoods + formato */

export function limpiaEstado(e) {
  return String(e || '')
    .replace(/^\d+_?/, '')
    .replace(/_/g, ' ')
    .trim()
}

/** Colores semáforo por estado_fuga */
export function estadoTone(e) {
  const s = String(e || '').toUpperCase()
  if (s.includes('ACTIVO')) return 'ok'
  if (s.includes('ENFRIANDO') || s.includes('RIESGO')) return 'warn'
  if (s.includes('DORMIDO') || s.includes('FUGADO')) return 'bad'
  if (s.includes('NUNCA')) return 'muted'
  return 'muted'
}

export function badgeClassForEstado(e) {
  const t = estadoTone(e)
  return {
    ok: 'b-green',
    warn: 'b-amber',
    bad: 'b-red',
    muted: 'b-gray',
  }[t] || 'b-gray'
}

export function scoreTone(score) {
  const n = Number(score)
  if (isNaN(n)) return 'muted'
  if (n >= 80) return 'ok'
  if (n >= 55) return 'warn'
  return 'muted'
}

export function firstLine(text, max = 90) {
  if (!text) return ''
  const t = String(text).split('|')[0].trim()
  return t.length > max ? t.slice(0, max) + '…' : t
}

/** Parsea "Foco: X · Tu rubro: Y" o multi-SKU pipe */
export function splitOferta(text) {
  if (!text) return []
  return String(text)
    .split(/\s*[·|]\s*/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3)
}

export function shortMoney(n) {
  const v = Number(n)
  if (isNaN(v) || !v) return null
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'k'
  return '$' + Math.round(v)
}
