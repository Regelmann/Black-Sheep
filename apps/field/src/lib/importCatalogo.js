import { parseImport, parseImportNumber, validateHttpUrl } from './csv.js'

const NUM_FIELDS = ['precio_unidad', 'precio_caja', 'precio_kilo', 'stock_operativo']
const URL_FIELDS = ['imagen_url', 'ficha_url']

export function validateCatalogoCsv(raw, maxRows = 400) {
  const parsed = parseImport(raw, maxRows)
  if (parsed.error) return { ...parsed, valid: false, rows: [], issues: [] }
  const rows = parsed.rows || []
  if (!rows.length) return { ...parsed, valid: false, rows: [], issues: ['CSV vacío'] }

  const skuKey = ['sku_canon', 'sku', 'codigo'].find(k => k in rows[0])
  if (!skuKey) return { ...parsed, valid: false, rows: [], issues: ['Falta columna sku_canon'] }

  const issues = []
  const seen = new Set()
  const normalized = rows.map((r, index) => {
    const rowNo = Number(r.__row || index + 2)
    const sku = String(r[skuKey] || '').trim()
    const rowIssues = []
    if (!sku) rowIssues.push('SKU vacío')
    if (sku && seen.has(sku)) rowIssues.push('SKU duplicado en CSV')
    if (sku) seen.add(sku)

    const body = {}
    if (r.producto_nombre?.trim()) body.producto_nombre = r.producto_nombre.trim()
    if (r.marca?.trim()) body.marca = r.marca.trim()
    if ('resena' in r) body.resena = r.resena?.trim() || null

    for (const field of URL_FIELDS) {
      if (!(field in r)) continue
      const result = validateHttpUrl(r[field], field)
      if (result.error) rowIssues.push(result.error)
      else body[field] = result.value
    }

    for (const field of NUM_FIELDS) {
      if (!(field in r) || String(r[field]).trim() === '') continue
      const result = parseImportNumber(r[field], { min: 0 })
      if (result.error) rowIssues.push(result.error)
      else body[field] = result.value
    }

    if (r.estado_stock?.trim()) body.estado_stock = r.estado_stock.trim()
    if (!Object.keys(body).length && !rowIssues.length) rowIssues.push('Sin campos para actualizar')
    if (rowIssues.length) issues.push(`Fila ${rowNo}${sku ? ` · ${sku}` : ''}: ${rowIssues.join(' · ')}`)
    return { ...r, __sku: sku, __body: body, __issues: rowIssues, __rowNo: rowNo }
  })

  return {
    ...parsed,
    valid: issues.length === 0,
    rows: normalized,
    skuKey,
    issues,
  }
}

export function summarizeCatalogoImport(validation, existingSkus = new Set()) {
  const rows = validation?.rows || []
  let invalid = 0, missing = 0, unchangedUnknown = 0
  const validRows = []
  for (const row of rows) {
    if (row.__issues?.length) { invalid++; continue }
    if (!existingSkus.has(row.__sku)) { missing++; continue }
    validRows.push(row)
  }
  return {
    total: rows.length,
    valid: validRows.length,
    invalid,
    missing,
    unchangedUnknown,
    canApply: rows.length > 0 && invalid === 0 && missing === 0,
    rows: validRows,
  }
}
