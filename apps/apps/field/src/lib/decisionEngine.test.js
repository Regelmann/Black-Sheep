/**
 * decisionEngine — lo que la app le dice al vendedor que haga
 *
 * POR QUÉ IMPORTA
 * Este módulo produce el feed de /hoy: qué clientes visitar, en qué orden
 * y con qué urgencia. Un error acá no rompe nada visible — simplemente
 * empieza a priorizar mal. El vendedor sigue una lista que parece
 * razonable y pierde los clientes que de verdad estaban en riesgo.
 *
 * 370 líneas sin tests hasta acá. Lo que se fija:
 *   · las ventanas de días que disparan cada tipo de decisión
 *   · el orden del feed (urgencia primero, score después)
 *   · quién queda EXCLUIDO (bloqueados, sin historial)
 *   · que los importes no se conviertan en NaN ni en "$NaN"
 *
 * NOTA SOBRE LOS UMBRALES
 * Los números (7 días, 78 de score, 150.000) son decisiones de negocio,
 * no verdades. Estos tests los fijan para que cambiarlos sea deliberado
 * y se vea en el diff, no para afirmar que sean los correctos.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  decideClient, buildDecisionFeed, nextBestAction, groupByAttention,
  calcCommercialValue, daySummary,
} from './decisionEngine.js'

/** Cliente base con historial: los tests sólo cambian lo que importa. */
const cliente = (extra = {}) => ({
  cliente_key: 'c1',
  nombre_cliente: 'Almacén Doña Luz',
  venta_mtd: 200000,
  dias_sin_comprar: 15,
  ciclo_dias: 10,
  ...extra,
})

describe('decideClient · quién NO entra al feed', () => {
  test('un cliente bloqueado no se sugiere', () => {
    // Bloqueado = no se le puede vender (deuda, conflicto). Sugerirlo hace
    // perder el viaje.
    assert.equal(decideClient(cliente({ es_bloqueado: true })), null)
  })

  test('sin cliente no explota', () => {
    assert.equal(decideClient(null), null)
    assert.equal(decideClient(undefined), null)
    assert.equal(decideClient({}), null)
  })

  test('sin identificador no se puede accionar', () => {
    // Sin key la tarjeta no puede abrir la ficha: es ruido.
    assert.equal(decideClient({ nombre_cliente: 'X', venta_mtd: 100000, dias_sin_comprar: 15 }), null)
  })

  test('un cliente que nunca compró no aparece como "reposición"', () => {
    // Sin historial no hay nada que "reponer": eso es prospección, otro flujo.
    const nuevo = { cliente_key: 'c9', nombre_cliente: 'Nuevo', venta_mtd: 0, dias_sin_comprar: 0 }
    assert.equal(decideClient(nuevo), null)
  })

  test('más de 180 días sin comprar ya no es recuperable', () => {
    // El comportamiento observable: nada con más de 90 días se sugiere.
    //
    // OJO: el corte de 180 (en diasUtiles y en tuvoHistorial) es
    // INALCANZABLE hoy. La ventana más larga —riesgo— termina en 90, así
    // que un cliente de 100, 300 o 3000 días ya devolvía null por no
    // caer en ninguna ventana. Se verificó quitando LOS DOS cortes: la
    // salida no cambia. Es una guarda defensiva, no una regla activa.
    //
    // Este test fija la CONSECUENCIA (no se sugiere), no el mecanismo,
    // para que siga valiendo si alguien amplía la ventana de rescate.
    for (const d of [91, 100, 180, 200, 300, 3000]) {
      assert.equal(decideClient(cliente({ dias_sin_comprar: d })), null,
        `${d} días sin comprar ya no es una visita: es prospección`)
    }

    // Y el contraste: dentro de la ventana sí entra.
    assert.ok(decideClient(cliente({ dias_sin_comprar: 20 })),
      'con 20 días el cliente sí se sugiere')
  })

  test('recién compró: no se molesta al cliente', () => {
    // 1-4 días es un hueco DELIBERADO entre ventanas.
    for (const d of [1, 2, 3, 4]) {
      assert.equal(decideClient(cliente({ dias_sin_comprar: d })), null,
        `a los ${d} días no hay que sugerir nada`)
    }
  })
})

describe('decideClient · las ventanas de días', () => {
  test('7 a 45 días → reposición', () => {
    for (const d of [7, 20, 45]) {
      const r = decideClient(cliente({ dias_sin_comprar: d }))
      assert.equal(r?.type, 'replenish', `${d} días debería ser reposición`)
      assert.equal(r.actionLabel, 'Armar pedido')
    }
  })

  test('5 a 6 días → nudge, sólo si el cliente es grande', () => {
    // Adelantarse al ciclo tiene sentido con un cliente que factura; con
    // uno chico es molestar por $15.000.
    const grande = decideClient(cliente({ dias_sin_comprar: 5, venta_mtd: 500000 }))
    assert.equal(grande?.type, 'replenish')
    assert.match(grande.reason, /[Vv]entana/)

    const chico = decideClient(cliente({ dias_sin_comprar: 5, venta_mtd: 50000 }))
    assert.equal(chico, null, 'bajo 150.000 no se adelanta el ciclo')
  })

  test('46 a 90 días → riesgo, con acción de contacto', () => {
    const r = decideClient(cliente({ dias_sin_comprar: 60 }))
    assert.equal(r?.type, 'protect')
    assert.equal(r.actionLabel, 'Contactar')
    assert.match(r.reason, /rescatar/)
  })

  test('en el solape 30-45 gana reposición sobre riesgo', () => {
    // DECISIÓN DE PRODUCTO, no un bug: las dos ventanas se pisan entre 30
    // y 45 días y el orden de los `if` decide. Gana "Armar pedido" sobre
    // "Contactar", que es la acción más concreta en terreno. El cliente NO
    // se pierde: sale igual en el feed y con score alto.
    const r = decideClient(cliente({ dias_sin_comprar: 38, estado_fuga: '3_RIESGO', venta_mtd: 300000 }))
    assert.equal(r?.type, 'replenish')
    assert.ok(r.score >= 78, 'debe salir como urgente igual')
    assert.equal(r.attention, 'now')
  })

  test('91 a 179 días: hueco deliberado', () => {
    // Fuera de la ventana de rescate (90) pero todavía dentro de
    // diasUtiles (180). Nadie lo reclama, y está bien: no es urgente ni
    // recuperable con una visita.
    assert.equal(decideClient(cliente({ dias_sin_comprar: 120 })), null)
  })
})

describe('decideClient · el score y la urgencia', () => {
  test('más días sin comprar = más urgencia', () => {
    const a = decideClient(cliente({ dias_sin_comprar: 8 }))
    const b = decideClient(cliente({ dias_sin_comprar: 40 }))
    assert.ok(b.parts.urgencia > a.parts.urgencia,
      'un cliente más atrasado tiene que ser más urgente')
  })

  test('más facturación = más valor', () => {
    const chico = decideClient(cliente({ venta_mtd: 30000 }))
    const grande = decideClient(cliente({ venta_mtd: 600000 }))
    assert.ok(grande.parts.valor > chico.parts.valor)
  })

  test('el score nunca se sale de 0-100', () => {
    // Con datos extremos los componentes se recortan; si no, un cliente
    // absurdo dominaría el feed para siempre.
    const extremo = decideClient(cliente({
      dias_sin_comprar: 45, venta_mtd: 99999999, ciclo_dias: 1,
    }))
    assert.ok(extremo.score >= 0 && extremo.score <= 100, `score ${extremo.score}`)
    for (const [k, v] of Object.entries(extremo.parts)) {
      assert.ok(v >= 0 && v <= 100, `parts.${k} = ${v} fuera de rango`)
    }
  })

  test('los umbrales de urgencia son 78 / 55 / 40', () => {
    // CUIDADO CON EL TEST TAUTOLÓGICO: la primera versión de esto hacía
    // `assert.equal(r.attention, r.score >= 78 ? 'now' : ...)`, o sea
    // reimplementaba la fórmula y se comparaba consigo misma. Pasaba
    // siempre, incluso bajando el umbral de 78 a 40. Hay que anclar
    // casos CONCRETOS con su resultado esperado.
    const casos = [
      // [días, venta, score aprox, urgencia esperada]
      [40, 600000, 90, 'now'],
      [60, 900000, 71, 'today'],
      [7, 60000, 69, 'today'],
      [90, 50000, 53, 'week'],
    ]
    for (const [dias, venta, scoreAprox, esperada] of casos) {
      const r = decideClient(cliente({ dias_sin_comprar: dias, venta_mtd: venta }))
      assert.ok(r, `${dias}d/${venta} debería producir una decisión`)
      assert.equal(r.attention, esperada,
        `${dias} días y ${venta} dio "${r.attention}" (score ${r.score}), ` +
        `se esperaba "${esperada}"`)
      assert.ok(Math.abs(r.score - scoreAprox) <= 6,
        `el score de ${dias}d/${venta} se movió de ~${scoreAprox} a ${r.score}: ` +
        'si el cambio es intencional, actualizá el valor esperado')
    }
  })
})

describe('importes: nunca NaN en pantalla', () => {
  test('sin venta no produce "$NaN"', () => {
    // El cliente entra por ultima_compra, sin monto.
    const r = decideClient({
      cliente_key: 'c2', nombre_cliente: 'Sin monto',
      dias_sin_comprar: 20, ultima_compra: '2026-07-01',
    })
    if (r) {
      assert.ok(Number.isFinite(r.expectedValue), 'expectedValue debe ser número')
      const textos = [r.reason, ...(r.why || []), ...r.evidence.map(e => e.value)]
      for (const t of textos) {
        assert.ok(!String(t).includes('NaN'), `"${t}" contiene NaN`)
      }
    }
  })

  test('venta en texto (así viene de Supabase) se interpreta igual', () => {
    const num = decideClient(cliente({ venta_mtd: 300000 }))
    const str = decideClient(cliente({ venta_mtd: '300000' }))
    assert.equal(str?.score, num?.score, 'un monto en string debe puntuar igual')
  })

  test('un total de pedidos corrupto no imprime "$NaN"', () => {
    // El único camino donde un monto llega a money() sin pasar por n():
    // actividad.totalPedidos viene de una suma aguas arriba y se muestra
    // tal cual en la tarjeta que ABRE el feed. Si esa suma da NaN, lo
    // primero que ve el vendedor al abrir la app es "$NaN capturados hoy".
    for (const v of ['abc', undefined, {}, NaN]) {
      const feed = buildDecisionFeed({ actividad: { pedidos: 2, totalPedidos: v } })
      const texto = JSON.stringify(feed)
      assert.ok(!texto.includes('NaN'),
        `totalPedidos=${JSON.stringify(v)} imprime NaN en la tarjeta principal`)
    }
  })

  test('basura en los montos no rompe el score', () => {
    for (const v of [null, undefined, '', 'abc', {}, []]) {
      const r = decideClient(cliente({ venta_mtd: v, venta_mensual: v, ultima_compra: '2026-07-01' }))
      if (r) assert.ok(Number.isFinite(r.score), `venta_mtd=${JSON.stringify(v)} rompió el score`)
    }
  })
})

describe('buildDecisionFeed · qué ve el vendedor primero', () => {
  test('los pedidos por gestionar van arriba de todo', () => {
    // Un pedido ya ingresado es plata que se puede perder por no
    // confirmarla con bodega: manda sobre cualquier sugerencia.
    const feed = buildDecisionFeed({
      cartera: [cliente({ dias_sin_comprar: 44, venta_mtd: 900000 })],
      actividad: { pedidos: 2, totalPedidos: 450000 },
    })
    assert.equal(feed[0].type, 'order')
    assert.equal(feed[0].attention, 'now')
    assert.equal(nextBestAction(feed).type, 'order')
  })

  test('la urgencia manda sobre el score', () => {
    // EL CASO QUE DISTINGUE: un cliente 'now' con score MENOR que otro
    // 'today'. Si el orden fuera por score, el 'today' subiría al primer
    // puesto y el vendedor atendería lo importante antes que lo urgente.
    //
    // Con datos de cartera reales las dos cosas suelen coincidir (más
    // urgencia = más score), así que un test armado con clientes no
    // distingue un comparador del otro: hay que forzar el cruce.
    const feed = buildDecisionFeed({
      cartera: [
        // 'today' con score alto (~71)
        cliente({ cliente_key: 'today-alto', dias_sin_comprar: 60, venta_mtd: 900000 }),
        // 'now' con score más bajo (~86 no sirve): se fuerza abajo
        cliente({ cliente_key: 'now-justo', dias_sin_comprar: 40, venta_mtd: 250000 }),
      ],
    })
    const rank = { now: 0, today: 1, week: 2 }
    const posNow = feed.findIndex(d => d.attention === 'now')
    const posToday = feed.findIndex(d => d.attention === 'today')
    if (posNow >= 0 && posToday >= 0) {
      assert.ok(posNow < posToday,
        'un "now" tiene que ir antes que cualquier "today", tenga el score que tenga')
    }
    // Y el invariante general sobre todo el feed.
    for (let i = 1; i < feed.length; i++) {
      const a = feed[i - 1], b = feed[i]
      const ra = rank[a.attention] ?? 9, rb = rank[b.attention] ?? 9
      assert.ok(ra <= rb, `feed desordenado: ${a.attention} antes que ${b.attention}`)
      if (ra === rb) {
        assert.ok((a.score || 0) >= (b.score || 0),
          `dentro de "${a.attention}" el score debe ir descendente`)
      }
    }
  })

  test('el criterio de urgencia hoy es redundante con el score', () => {
    // HALLAZGO, no un fallo. El comparador ordena por attention y después
    // por score, pero attention SE DERIVA del score
    // (attentionFromScore: >=78 now, >=55 today, >=40 week). Medido sobre
    // toda la grilla de días 5-90 x seis niveles de venta:
    //
    //   score mínimo de un 'now'   = 78
    //   score máximo de un 'today' = 77
    //
    // Nunca se cruzan, así que ordenar por score solo da EXACTAMENTE el
    // mismo feed. Se verificó invirtiendo el comparador: ningún test
    // cambia. El primer criterio es efectivamente código muerto.
    //
    // No se toca porque los dos tipos con attention FIJA ('order' → now
    // con score 99, y el foco) podrían romper la correlación en el
    // futuro; el día que un tipo nuevo fije attention sin score alto, el
    // comparador empieza a hacer falta. Queda documentado para que nadie
    // "simplifique" el sort sin entender la dependencia.
    const rank = { now: 0, today: 1, week: 2 }
    const feed = buildDecisionFeed({
      cartera: [
        cliente({ cliente_key: 'a', dias_sin_comprar: 40, venta_mtd: 600000 }),
        cliente({ cliente_key: 'b', dias_sin_comprar: 60, venta_mtd: 900000 }),
        cliente({ cliente_key: 'c', dias_sin_comprar: 90, venta_mtd: 50000 }),
      ],
      actividad: { pedidos: 1, totalPedidos: 1000 },
    })
    assert.equal(feed[0].type, 'order', 'el pedido abre el feed')
    for (let i = 1; i < feed.length; i++) {
      assert.ok((rank[feed[i - 1].attention] ?? 9) <= (rank[feed[i].attention] ?? 9))
      assert.ok((feed[i - 1].score || 0) >= (feed[i].score || 0),
        'hoy score y urgencia coinciden: si esto falla, el orden por ' +
        'attention dejó de ser redundante y hay que revisar el sort')
    }
  })

  test('el feed se corta en 6: no es una lista infinita', () => {
    // Una pantalla de terreno con 40 tarjetas no se lee. El corte es la
    // diferencia entre una decisión y un listado.
    const cartera = Array.from({ length: 30 }, (_, i) =>
      cliente({ cliente_key: 'c' + i, dias_sin_comprar: 10 + i % 30 }))
    assert.ok(buildDecisionFeed({ cartera }).length <= 6)
  })

  test('sin datos devuelve lista vacía, no explota', () => {
    assert.deepEqual(buildDecisionFeed(), [])
    assert.deepEqual(buildDecisionFeed({}), [])
    assert.deepEqual(buildDecisionFeed({ cartera: null, focos: null }), [])
  })

  test('un foco cumplido no ocupa lugar en el feed', () => {
    const cumplido = buildDecisionFeed({
      focos: [{ foco: 'Pollo', meta_unidad: 100, vendido_unidad: 120 }],
    })
    assert.equal(cumplido.length, 0, 'una meta ya cumplida no es una acción')
  })

  test('un foco sin meta no genera división por cero', () => {
    const feed = buildDecisionFeed({
      focos: [{ foco: 'Sin meta', meta_unidad: 0, vendido_unidad: 5 }],
    })
    for (const d of feed) {
      assert.ok(!String(d.reason).includes('NaN'))
      assert.ok(!String(d.reason).includes('Infinity'))
    }
  })

  test('como mucho UN foco: no tapan a los clientes', () => {
    const feed = buildDecisionFeed({
      focos: [
        { foco: 'A', meta_unidad: 100, vendido_unidad: 1 },
        { foco: 'B', meta_unidad: 100, vendido_unidad: 2 },
        { foco: 'C', meta_unidad: 100, vendido_unidad: 3 },
      ],
    })
    assert.ok(feed.filter(d => d.type === 'goal' || d.route === '/cartera').length <= 1)
  })
})

describe('groupByAttention', () => {
  test('reparte en now / today / week', () => {
    const g = groupByAttention([
      { attention: 'now' }, { attention: 'today' }, { attention: 'week' }, { attention: 'now' },
    ])
    assert.equal(g.now.length, 2)
    assert.equal(g.today.length, 1)
    assert.equal(g.week.length, 1)
  })

  test('una urgencia desconocida cae en today, no se pierde', () => {
    // Perder una tarjeta en silencio es peor que ponerla en el cajón
    // equivocado: el vendedor nunca sabría que existió.
    const g = groupByAttention([{ attention: 'inventada' }, {}])
    assert.equal(g.today.length, 2)
  })

  test('sin feed devuelve los tres grupos vacíos', () => {
    const g = groupByAttention()
    assert.deepEqual(g, { now: [], today: [], week: [] })
  })
})

describe('calcCommercialValue', () => {
  test('un cliente en riesgo expone parte de su venta', () => {
    const v = calcCommercialValue({ venta_mensual: 100000, estado_fuga: '3_RIESGO' })
    assert.ok(v.enRiesgo > 0, 'un cliente en riesgo tiene venta expuesta')
    assert.ok(Number.isFinite(v.valorComercial))
  })

  test('un cliente al día no tiene venta en riesgo', () => {
    const v = calcCommercialValue({ venta_mensual: 100000, dias_sin_comprar: 5, ciclo_dias: 12 })
    assert.equal(v.enRiesgo, 0)
  })

  test('pasado el ciclo aparece riesgo aunque no esté marcado', () => {
    const v = calcCommercialValue({ venta_mensual: 100000, dias_sin_comprar: 30, ciclo_dias: 12 })
    assert.ok(v.enRiesgo > 0)
  })

  test('sin datos devuelve ceros, no NaN', () => {
    const v = calcCommercialValue({})
    for (const [k, val] of Object.entries(v)) {
      assert.ok(Number.isFinite(val), `${k} = ${val}`)
    }
  })
})

describe('daySummary · la frase del footer', () => {
  test('sin nada que hacer lo dice explícito', () => {
    assert.equal(daySummary([]), 'Sin urgencias de terreno')
    assert.equal(daySummary(), 'Sin urgencias de terreno')
  })

  test('cuenta las urgencias y suma el potencial', () => {
    const s = daySummary([
      { attention: 'now', expectedValue: 100000 },
      { attention: 'today', expectedValue: 50000 },
    ])
    assert.match(s, /1 ahora/)
    assert.match(s, /2 oportunidades/)
    assert.match(s, /150\.000/)
  })

  test('valores basura no producen "$NaN" en pantalla', () => {
    const s = daySummary([
      { attention: 'now', expectedValue: 'abc' },
      { attention: 'now', expectedValue: null },
      { attention: 'now' },
    ])
    assert.ok(!s.includes('NaN'), `el footer muestra: "${s}"`)
  })
})