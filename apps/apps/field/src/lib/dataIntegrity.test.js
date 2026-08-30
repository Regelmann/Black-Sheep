import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assessDataIntegrity } from './dataIntegrity.js'
import { assessDataHealth } from './dataHealth.js'

describe('dataIntegrity', () => {
  it('blocks empty cartera', () => {
    const r = assessDataIntegrity({ cartera: [] })
    assert.equal(r.canRecommend, false)
    assert.ok(r.issues.some((i) => i.code === 'NO_CARTERA'))
  })

  it('allows healthy cartera with mix and stock', () => {
    const cartera = Array.from({ length: 20 }, (_, i) => ({
      cliente_key: `c${i}`,
      dias_sin_comprar: 10 + i,
      venta_mtd: 100000,
      sku_detalle: 'POLLO ENTERO||||50000||||||REPOSICION|0|SKU-P',
    }))
    const stock = [{ sku_canon: 'SKU-P', producto_nombre: 'POLLO ENTERO', stock_total: 50 }]
    const r = assessDataIntegrity({
      cartera,
      stock,
      focos: [{ foco: 'Pollo' }],
      meta: { meta_mensual: 5000000 },
      dataAsOf: new Date().toISOString(),
    })
    assert.equal(r.canRecommend, true)
    assert.ok(r.score >= 70)
  })

  it('blocks all-zero stock', () => {
    const r = assessDataIntegrity({
      cartera: Array.from({ length: 12 }, (_, i) => ({
        cliente_key: `c${i}`,
        sku_detalle: 'X||||1||||||REPOSICION|0|SKU',
      })),
      stock: [{ sku_canon: 'A', stock_total: 0 }],
    })
    assert.equal(r.canRecommend, false)
    assert.ok(r.issues.some((i) => i.code === 'STOCK_CERO'))
  })
})

describe('dataHealth', () => {
  it('returns paused when integrity blocks', () => {
    const h = assessDataHealth({ cartera: [] })
    assert.equal(h.status, 'paused')
    assert.equal(h.canRecommend, false)
  })

  it('healthy when chain is coherent', () => {
    const cartera = Array.from({ length: 15 }, (_, i) => ({
      cliente_key: `c${i}`,
      dias_sin_comprar: 12,
      venta_mtd: 80000,
      sku_detalle: 'POLLO ENTERO||||40000||||||REPOSICION|0|SKUPOLLO',
    }))
    const stock = [
      { sku_canon: 'SKUPOLLO', producto_nombre: 'POLLO ENTERO', stock_total: 100, es_foco_mes: true },
    ]
    const h = assessDataHealth({
      cartera,
      stock,
      focos: [{ foco: 'Pollo' }],
      meta: { meta_mensual: 1e7 },
      dataAsOf: new Date().toISOString(),
    })
    assert.ok(h.health >= 60)
    assert.notEqual(h.status, 'paused')
  })
})
