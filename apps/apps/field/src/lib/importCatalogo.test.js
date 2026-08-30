import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCatalogoCsv, summarizeCatalogoImport } from './importCatalogo.js'

test('catálogo: valida números, URLs y duplicados antes de escribir', () => {
  const r = validateCatalogoCsv([
    'sku_canon,precio_unidad,imagen_url',
    'A,1.234,https://x.cl/a.jpg',
    'A,20,javascript:alert(1)',
  ].join('\n'))
  assert.equal(r.valid, false)
  assert.equal(r.issues.length, 1)
  assert.match(r.issues[0], /duplicado|solo se permite/i)
})

test('catálogo: resume SKU inexistente sin considerarlo error de escritura', () => {
  const r = validateCatalogoCsv('sku_canon,precio_unidad\nA,100\nB,200')
  const s = summarizeCatalogoImport(r, new Set(['A']))
  assert.equal(s.valid, 1)
  assert.equal(s.missing, 1)
  assert.equal(s.canApply, false)
})

test('catálogo: permite limpiar media con celda vacía', () => {
  const r = validateCatalogoCsv('sku_canon,imagen_url,ficha_url,resena\nA,,,')
  assert.equal(r.valid, true)
  assert.deepEqual(r.rows[0].__body, { imagen_url: null, ficha_url: null, resena: null })
})
