import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeVentas, summarizeCanales, summarizeClientes, buildCliente360 } from './metrics.js'

test('summarizeVentas calculates MTD and target compliance', () => {
  const r = summarizeVentas([{ venta_mtd: 80, meta_mtd: 100 }, { venta_mtd: 20, meta_mtd: 0 }])
  assert.equal(r.ventaMtd, 100)
  assert.equal(r.meta, 100)
  assert.equal(r.cumplimiento, 1)
})

test('summarizeCanales groups commercial rows', () => {
  const r = summarizeCanales([
    { canal: 'KAM', venta_mtd: 80, meta_mtd: 100 },
    { canal: 'KAM', venta_mtd: 20, meta_mtd: 0 },
    { canal: 'TELEVENTA', venta_mtd: 50, meta_mtd: 100 },
  ])
  assert.deepEqual(r.map(x => x.canal), ['KAM', 'TELEVENTA'])
  assert.equal(r[0].venta, 100)
  assert.equal(r[0].cumplimiento, 1)
})

test('summarizeClientes identifies risk and blocked customers', () => {
  const r = summarizeClientes([
    { venta_mtd: 10, estado_fuga: 'alto', dias_sin_comprar: 30, es_bloqueado: true },
    { venta_mtd: 20, estado_fuga: 'normal', dias_sin_comprar: 0, es_bloqueado: false },
  ])
  assert.equal(r.total, 2)
  assert.equal(r.altoRiesgo, 1)
  assert.equal(r.bloqueados, 1)
  assert.equal(r.sinCompra, 1)
})

test('buildCliente360 normalizes customer detail', () => {
  const r = buildCliente360({ cliente_key: 'ABC', nombre_cliente: 'Cliente ABC', venta_mtd: 740, venta_mensual: 1000, dias_sin_comprar: 12 }, [])
  assert.equal(r.id, 'ABC')
  assert.equal(r.nombre, 'Cliente ABC')
  assert.equal(r.variacion, -0.26)
  assert.equal(r.diasSinComprar, 12)
})
