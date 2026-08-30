/**
 * Exporta filas a CSV y dispara descarga en el navegador.
 * - UTF-8 con BOM para que Excel en Chile abra tildes bien.
 * - Escapa comillas y saltos de línea.
 */

function cell(v) {
  if (v == null) return ''
  if (typeof v === 'object') {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  const s = String(v)
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * @param {string} filename sin extensión o con .csv
 * @param {Record<string, unknown>[]} rows
 * @param {string[]} [columns] orden opcional de columnas
 */
export function exportCsv(filename, rows, columns) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) {
    throw new Error('No hay filas para exportar')
  }
  const cols = columns && columns.length
    ? columns
    : Array.from(
        list.reduce((set, r) => {
          Object.keys(r || {}).forEach(k => set.add(k))
          return set
        }, new Set())
      )
  const lines = [
    cols.join(','),
    ...list.map(r => cols.map(c => cell(r?.[c])).join(',')),
  ]
  const bom = '\uFEFF'
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const name = String(filename || 'export').replace(/\.csv$/i, '') + '.csv'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function stampDate() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}
