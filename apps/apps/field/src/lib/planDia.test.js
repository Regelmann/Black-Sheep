import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  scoreClientePlan,
  buildPlanDia,
  orderStopsByRoute,
  buildStockIndex,
} from './planDia.js'

const stock = [
  { sku_canon: 'SKU-POLLO', producto_nombre: 'POLLO ENTERO', stock_total: 200, es_foco_mes: true },
  { sku_canon: 'SKU-VACIO', producto_nombre: 'PRODUCTO SIN STOCK', stock_total: 0 },
]
const focos = [{ foco: 'Pollo' }]
const idx = buildStockIndex(stock)

describe('score comercial (stock + foco)', () => {
  it('con stock de foco scorea mucho más que sin stock', () => {
    const good = scoreClientePlan(
      {
        cliente_key: 'g',
        dias_sin_comprar: 20,
        venta_mensual: 400000,
        sku_detalle: 'POLLO ENTERO||||150000||||||REPOSICION|0|SKU-POLLO',
      },
      { stockIndex: idx, focos }
    )
    const bad = scoreClientePlan(
      {
        cliente_key: 'b',
        dias_sin_comprar: 30,
        venta_mensual: 500000,
        riesgo_score: 80,
        sku_detalle: 'PRODUCTO FANTASMA||||200000||||||REPOSICION|0|SKU-NOEXISTE',
      },
      { stockIndex: idx, focos }
    )
    assert.ok(good.score > bad.score + 15, `good=${good.score} bad=${bad.score}`)
    assert.ok(good.vendibleHits.length >= 1)
    assert.ok(bad.sinStock)
    assert.ok(bad.score <= 18, `sin stock techo, got ${bad.score}`)
  })

  it('parts incluyen vendible y foco', () => {
    const sc = scoreClientePlan(
      {
        cliente_key: 'g',
        dias_sin_comprar: 15,
        venta_mensual: 300000,
        sku_detalle: 'POLLO ENTERO||||100000||||||REPOSICION|0|SKU-POLLO',
      },
      { stockIndex: idx, focos }
    )
    assert.ok(sc.parts.vendible >= 60)
    assert.ok(sc.parts.foco >= 50)
    assert.ok(sc.reasons.some((r) => /Vendible|Foco/i.test(r)))
  })

  it('plan excluye clientes sin stock de su mix', () => {
    const plan = buildPlanDia(
      [
        {
          cliente_key: 'good',
          nombre_cliente: 'Con stock',
          dias_sin_comprar: 18,
          venta_mensual: 300000,
          lat: -33.401,
          lng: -70.601,
          sku_detalle: 'POLLO ENTERO||||120000||||||REPOSICION|0|SKU-POLLO',
        },
        {
          cliente_key: 'bad',
          nombre_cliente: 'Sin stock',
          dias_sin_comprar: 40,
          venta_mensual: 500000,
          riesgo_score: 90,
          lat: -33.402,
          lng: -70.602,
          sku_detalle: 'COSA RARA||||200000||||||REPOSICION|0|SKU-ZZZ',
        },
      ],
      {
        stock,
        focos,
        minScore: 15,
        excludeSinStock: true,
        origin: { lat: -33.4, lng: -70.6 },
      }
    )
    const keys = plan.stops.map((s) => s.cliente_key)
    assert.deepEqual(keys, ['good'])
  })
})

describe('ruta', () => {
  it('primera = más cercana a GPS', () => {
    const ordered = orderStopsByRoute(
      [
        { cliente_key: 'far', score: 99, coords: { lat: -33.5, lng: -70.7 } },
        { cliente_key: 'near', score: 40, coords: { lat: -33.401, lng: -70.601 } },
      ],
      { lat: -33.4, lng: -70.6 }
    )
    assert.equal(ordered[0].cliente_key, 'near')
  })
})
