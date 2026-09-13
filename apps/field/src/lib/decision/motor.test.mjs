/**
 * Pruebas del motor · por qué existen
 *
 * El motor es puro: entra un cliente, sale una decisión. Eso lo hace
 * comprobable sin base de datos, sin navegador y sin señal — y es la
 * razón por la que se escribió puro.
 *
 * Lo que se prueba no es que "funcione", sino que las reglas de negocio
 * digan lo que el negocio necesita: que un cliente bloqueado nunca
 * aparezca, que el ciclo propio mande sobre un número fijo, y que un
 * cliente grande atrasado gane a uno chico igual de atrasado.
 *
 *   node --test src/lib/decision/motor.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideClient, buildDecisionFeed, nextBestAction } from './motor.js'

const cliente = (extra = {}) => ({
  cliente_key: '76000001-1',
  nombre: 'Hotel Bidasoa',
  dias_sin_comprar: 14,
  ciclo_dias: 9,
  venta_mtd: 300000,
  venta_mensual: 300000,
  ultima_compra: '2026-09-01',
  es_bloqueado: false,
  ...extra,
})

test('un cliente bloqueado nunca genera una decisión', () => {
  assert.equal(decideClient(cliente({ es_bloqueado: true })), null)
})

test('sin historial no se inventa una decisión', () => {
  const d = decideClient({ cliente_key: 'X', nombre: 'Nuevo',
    dias_sin_comprar: 0, venta_mtd: 0, venta_mensual: 0 })
  assert.equal(d, null)
})

test('atrasado sobre su ciclo · propone reponer con el porqué', () => {
  const d = decideClient(cliente())
  assert.equal(d.type, 'replenish')
  assert.equal(d.actionLabel, 'Armar pedido')
  assert.match(d.reason, /ciclo/)
  assert.ok(d.why.length >= 3, 'la decisión explica por qué')
  assert.ok(d.expectedValue > 0, 'dice cuánta plata hay en juego')
})

test('EL CICLO PROPIO MANDA sobre un número fijo', () => {
  // Mismos 20 días de atraso. Para quien compra cada 7 es grave; para
  // quien compra cada 30 es normal. Si el motor usara un umbral único,
  // los dos saldrían igual y el vendedor perdería el día.
  const rapido = decideClient(cliente({ dias_sin_comprar: 20, ciclo_dias: 7 }))
  const lento  = decideClient(cliente({ dias_sin_comprar: 20, ciclo_dias: 30 }))
  assert.ok(rapido.score > lento.score,
    `el de ciclo corto debe pesar más (${rapido.score} vs ${lento.score})`)
})

test('a igual atraso, el cliente que vale más se atiende primero', () => {
  const grande = decideClient(cliente({ venta_mtd: 900000, venta_mensual: 900000 }))
  const chico  = decideClient(cliente({ venta_mtd: 40000, venta_mensual: 40000 }))
  assert.ok(grande.score > chico.score,
    `${grande.score} debe superar a ${chico.score}`)
})

test('un cliente dormido se marca como rescate, no como reposición', () => {
  const d = decideClient(cliente({ dias_sin_comprar: 45, estado_fuga: 'en_fuga' }))
  assert.equal(d.type, 'protect')
  assert.equal(d.actionLabel, 'Contactar')
})

test('el feed ordena por urgencia y la primera acción es la de mayor score', () => {
  const feed = buildDecisionFeed({
    cartera: [
      cliente({ cliente_key: 'A', dias_sin_comprar: 8,  ciclo_dias: 7, venta_mtd: 100000 }),
      cliente({ cliente_key: 'B', dias_sin_comprar: 25, ciclo_dias: 7, venta_mtd: 800000 }),
      cliente({ cliente_key: 'C', dias_sin_comprar: 2,  ciclo_dias: 7, venta_mtd: 100000 }),
    ],
  })
  assert.ok(feed.length >= 2, 'el cliente al día no entra al feed')
  const primera = nextBestAction(feed)
  assert.equal(primera.clientId, 'B', 'primero el grande y muy atrasado')
  for (let i = 1; i < feed.length; i++) {
    assert.ok(feed[i - 1].score >= feed[i].score, 'el feed viene ordenado')
  }
})

test('toda decisión trae acción y evidencia · sin eso es una alerta inútil', () => {
  const feed = buildDecisionFeed({ cartera: [cliente(), cliente({ cliente_key: 'B', dias_sin_comprar: 40 })] })
  for (const d of feed) {
    assert.ok(d.actionLabel, `${d.id} sin acción`)
    assert.ok(Array.isArray(d.why) && d.why.length, `${d.id} sin porqué`)
    assert.ok(['now', 'today', 'week'].includes(d.attention), `${d.id} sin urgencia`)
  }
})
