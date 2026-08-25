// Helpers compartidos entre páginas
export const money = n => {
  const v = Number(n)
  return isNaN(v) ? '$0' : '$' + v.toLocaleString('es-CL', { maximumFractionDigits: 0 })
}

export function pctNum(x) {
  const p = Number(x)
  if (isNaN(p)) return 0
  return p <= 1.5 ? Math.round(p * 100) : Math.round(p)
}

export function pctBar(pct) {
  const p = Math.min(Math.max(pct, 0), 200)
  const color = pct >= 100 ? 'var(--ok-mid)' : pct >= 80 ? 'var(--info)' : pct >= 50 ? 'var(--warn)' : 'var(--danger)'
  return { width: `${Math.min(p, 100)}%`, background: color }
}

export function limpiaEstado(e) {
  return String(e || 's/estado').replace(/^\d+_?/, '').replace(/_/g, ' ')
}

export function exportCsv(nombre, cabeceras, filas) {
  const cab = cabeceras.join(',')
  const body = filas.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, "'")}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + cab + '\n' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

export function ymd(d) {
  const x = d instanceof Date ? d : new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export function mesLabel(m) {
  const s = String(m || '')
  const [y, mo] = s.slice(0, 7).split('-')
  const nombres = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const mi = Number(mo)
  return nombres[mi] ? `${nombres[mi]} ${String(y).slice(2)}` : s.slice(0, 7)
}
