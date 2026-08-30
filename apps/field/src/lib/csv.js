/** CSV utilities used by Admin imports. RFC-ish parser: quoted cells, commas/semicolons, BOM. */
export function detectDelimiter(line = '') {
  let comma = 0, semi = 0, quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { i++; continue }
      quoted = !quoted
    } else if (!quoted && c === ',') comma++
    else if (!quoted && c === ';') semi++
  }
  return semi > comma ? ';' : ','
}

export function parseCsv(raw) {
  const input = String(raw ?? '').replace(/^\uFEFF/, '')
  if (!input.trim()) return { headers: [], rows: [], error: 'CSV vacío' }
  const delimiter = detectDelimiter(input.split(/\r?\n/, 1)[0] || '')
  const records = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; continue }
      quoted = !quoted
      continue
    }
    if (!quoted && c === delimiter) { row.push(cell); cell = ''; continue }
    if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && input[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(v => String(v).trim() !== '')) records.push(row)
      row = []
      continue
    }
    cell += c
  }
  if (quoted) return { headers: [], rows: [], error: 'CSV inválido: comillas sin cerrar' }
  row.push(cell)
  if (row.some(v => String(v).trim() !== '')) records.push(row)
  if (records.length < 2) return { headers: [], rows: [], error: 'CSV sin filas de datos' }
  const headers = records[0].map((h, i) => {
    const v = String(h ?? '').trim().toLowerCase()
    return i === 0 ? v.replace(/^\uFEFF/, '') : v
  })
  const seen = new Set()
  const dupHeaders = headers.filter(h => { if (!h || seen.has(h)) return true; seen.add(h); return false })
  if (dupHeaders.length) return { headers: [], rows: [], error: `Encabezados inválidos/duplicados: ${dupHeaders.filter(Boolean).join(', ')}` }
  const rows = records.slice(1).map((cols, idx) => {
    const obj = { __row: idx + 2 }
    headers.forEach((h, i) => { obj[h] = String(cols[i] ?? '').trim() })
    return obj
  })
  return { headers, rows, delimiter }
}

export function parseImport(raw, maxRows = 400) {
  const parsed = parseCsv(raw)
  if (parsed.error) return parsed
  if (parsed.rows.length > maxRows) return { ...parsed, rows: [], error: `Máximo ${maxRows} filas por importación; recibidas ${parsed.rows.length}` }
  return parsed
}

export function parseImportNumber(value, { integer = false, min = null } = {}) {
  if (value == null || String(value).trim() === '') return { value: null }
  let s = String(value).trim().replace(/\s/g, '').replace(/\$/g, '')
  // Chile/LatAm: 1.234,56. Also accept 1234.56 and 1234,56.
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  const n = Number(s)
  if (!Number.isFinite(n)) return { error: `Número inválido: ${value}` }
  if (integer && !Number.isInteger(n)) return { error: `Se requiere entero: ${value}` }
  if (min != null && n < min) return { error: `Valor menor al mínimo (${min}): ${value}` }
  return { value: n }
}

export function validateHttpUrl(value, label = 'URL') {
  if (value == null || String(value).trim() === '') return { value: null }
  try {
    const u = new URL(String(value).trim())
    if (!['http:', 'https:'].includes(u.protocol)) return { error: `${label}: solo se permite http/https` }
    return { value: u.toString() }
  } catch {
    return { error: `${label}: URL inválida` }
  }
}
