import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, parseImport, parseImportNumber, validateHttpUrl } from './csv.js'

test('CSV soporta comas, comillas y saltos de línea', () => {
  const r = parseCsv('sku_canon,producto_nombre,resena\n001,"Salsa, BBQ","Línea uno\nLínea dos"')
  assert.equal(r.error, undefined); assert.equal(r.rows[0].producto_nombre, 'Salsa, BBQ'); assert.equal(r.rows[0].resena, 'Línea uno\nLínea dos')
})
test('CSV detecta punto y coma', () => {
  const r = parseCsv('sku_canon;producto_nombre\n001;Salsa')
  assert.equal(r.rows[0].producto_nombre, 'Salsa')
})
test('import bloquea más de 400 filas', () => {
  const raw = 'sku_canon\n' + Array.from({ length: 401 }, (_, i) => String(i)).join('\n')
  assert.match(parseImport(raw).error, /Máximo 400/)
})
test('números chilenos', () => {
  assert.equal(parseImportNumber('1.234,56').value, 1234.56); assert.equal(parseImportNumber('10,5').value, 10.5)
  assert.ok(parseImportNumber('abc').error)
})
test('URLs solo http/https', () => {
  assert.equal(validateHttpUrl('https://x.cl/f.pdf').error, undefined); assert.ok(validateHttpUrl('javascript:alert(1)').error)
})
