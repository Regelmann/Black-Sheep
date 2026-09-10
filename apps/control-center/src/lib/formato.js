/** Formatos chilenos. Un número mal formateado es un número que nadie lee. */
const pesos = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
const enteros = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const decimales = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 })

/** null NO es cero. Un cero se lee como un dato real; "no disponible", no. */
export const clp = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : pesos.format(Number(n)))
export const num = (n) => (n === null || n === undefined ? '—' : enteros.format(Number(n)))
export const dec = (n) => (n === null || n === undefined ? '—' : decimales.format(Number(n)))
export const pct = (n, d = 1) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(d)}%`)

export const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
export const fechaHora = (f) => (f ? new Date(f).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

/** Cifra grande y corta para las tarjetas: 32,7 M en vez de $32.712.480. */
export function corto(n) {
  if (n === null || n === undefined) return '—'
  const v = Number(n)
  const s = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1e9) return `${s}$${decimales.format(a / 1e9)} MM`
  if (a >= 1e6) return `${s}$${decimales.format(a / 1e6)} M`
  if (a >= 1e3) return `${s}$${enteros.format(a / 1e3)} K`
  return clp(v)
}

export const mesActual = () => new Date().toISOString().slice(0, 8) + '01'
