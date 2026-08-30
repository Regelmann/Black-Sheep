/**
 * MI DÍA · "¿a quién le vendo QUÉ, a qué PRECIO y por qué AHORA?"
 *
 * decisionEngine ya resolvía el a-quién y el por-qué-ahora. Estos tests
 * cubren las dos mitades que faltaban y que son las que el vendedor
 * tenía que averiguar solo: qué ofrecerle y a cuánto.
 *
 * Casos que importan de verdad acá:
 *  · el precio que se muestra tiene que ser el que ESE cliente pagó,
 *    no el de lista, porque si el vendedor llega con otro número pierde
 *    credibilidad en la puerta;
 *  · un producto sin stock se marca, no se esconde;
 *  · un KAM no hace visitas y el motor tiene que saberlo.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  productosSugeridos,
  montoSugerido,
  perfilRol,
  ritmoCliente,
  cicloEstimado,
  armarMiDia,
} from './miDia.js'

// sku_detalle real: "nombre|promUd|udMtd|promClp|clpMtd|ultima|cicloDias"
const hace = d => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)

const CLIENTE = {
  cliente_key: 'ALM-1', nombre_cliente: 'Almacén Test',
  venta_mtd: 400000, dias_sin_comprar: 18, ciclo_dias: 10,
  sku_detalle: [
    { nombre: 'Arroz Grado 2 1kg', promUd: 20, udMtd: 2, promClp: 24000, clpMtd: 2400, ultima: hace(25), cicloDias: 10 },
    { nombre: 'Aceite Maravilla 900ml', promUd: 10, udMtd: 0, promClp: 19000, clpMtd: 0, ultima: hace(30), cicloDias: 12 },
    { nombre: 'Fideos Spaghetti 400g', promUd: 30, udMtd: 28, promClp: 12000, clpMtd: 11000, ultima: hace(2), cicloDias: 14 },
  ],
}

const STOCK = [
  { sku_canon: 'ARZ-G2', producto_nombre: 'Arroz Grado 2 1kg', stock_operativo: 120, precio_unidad: 1300 },
  { sku_canon: 'ACE-900', producto_nombre: 'Aceite Maravilla 900ml', stock_operativo: 0, precio_unidad: 2100 },
]

describe('qué ofrecerle', () => {
  test('sugiere primero lo que se le está acabando', () => {
    const p = productosSugeridos(CLIENTE, STOCK)
    assert.ok(p.length > 0, 'un cliente con histórico siempre tiene algo que ofrecerle')
    assert.ok(['se_le_acaba', 'reponer'].includes(p[0].motivo),
      `el primero debería ser reposición, fue "${p[0].motivo}": el vendedor ` +
      'necesita abrir por lo urgente, no por lo que más factura')
  })

  test('no repite el mismo producto', () => {
    const p = productosSugeridos(CLIENTE, STOCK, 6)
    const nombres = p.map(x => x.nombre.toUpperCase())
    assert.equal(new Set(nombres).size, nombres.length)
  })

  test('respeta el límite', () => {
    assert.ok(productosSugeridos(CLIENTE, STOCK, 2).length <= 2)
  })

  test('un cliente sin histórico no inventa productos', () => {
    assert.deepEqual(productosSugeridos({ cliente_key: 'X' }, STOCK), [])
    assert.deepEqual(productosSugeridos(null, STOCK), [])
  })

  test('completa con el mix habitual si no hay nada por reponer', () => {
    // Todo comprado recién: no hay urgencia, pero igual hay qué ofrecer.
    const alDia = {
      cliente_key: 'C', sku_detalle: [
        { nombre: 'Fideos Spaghetti 400g', promUd: 30, udMtd: 30, promClp: 12000, clpMtd: 12000, ultima: hace(1), cicloDias: 14 },
      ],
    }
    const p = productosSugeridos(alDia, STOCK)
    assert.ok(p.length > 0, 'sin urgencias la pantalla no puede quedar vacía')
    assert.equal(p[0].motivo, 'habitual')
  })
})

describe('a qué precio', () => {
  test('usa el precio que ese cliente pagó, no el de lista', () => {
    // Arroz: promClp 24000 / promUd 20 = 1200 el suyo. Lista: 1300.
    const arroz = productosSugeridos(CLIENTE, STOCK, 6).find(p => /Arroz/.test(p.nombre))
    assert.ok(arroz)
    assert.equal(arroz.precio, 1200,
      'mostró el precio de lista en vez del histórico del cliente: si el ' +
      'vendedor llega con otro número pierde credibilidad en la puerta')
    assert.equal(arroz.precioEsDelCliente, true)
  })

  test('si no hay histórico cae al precio de lista y lo dice', () => {
    const sinPrecio = {
      cliente_key: 'C',
      sku_detalle: [{ nombre: 'Arroz Grado 2 1kg', ultima: hace(40), cicloDias: 10 }],
    }
    const p = productosSugeridos(sinPrecio, STOCK)[0]
    assert.equal(p.precio, 1300, 'debería caer al precio de lista de bodega')
    assert.equal(p.precioEsDelCliente, false,
      'la UI tiene que poder distinguir un precio propio de uno de lista')
  })

  test('sin ningún precio devuelve null en vez de cero', () => {
    // Un 0 se renderiza como "$0" y parece que el producto es gratis.
    const p = productosSugeridos(
      { cliente_key: 'C', sku_detalle: [{ nombre: 'Producto Desconocido XYZ', ultima: hace(40), cicloDias: 10 }] },
      [],
    )[0]
    assert.equal(p.precio, null)
  })
})

describe('stock', () => {
  test('marca lo que no hay en bodega en vez de esconderlo', () => {
    // El aceite tiene stock 0 pero el cliente lo compra: el vendedor
    // necesita saber que lo va a pedir y no hay.
    const aceite = productosSugeridos(CLIENTE, STOCK, 6).find(p => /Aceite/.test(p.nombre))
    assert.ok(aceite, 'un producto sin stock no se oculta: se marca')
    assert.equal(aceite.hayStock, false)
    assert.equal(aceite.unidadesEnBodega, 0)
  })

  test('con stock disponible lo confirma', () => {
    const arroz = productosSugeridos(CLIENTE, STOCK, 6).find(p => /Arroz/.test(p.nombre))
    assert.equal(arroz.hayStock, true)
    assert.equal(arroz.unidadesEnBodega, 120)
  })

  test('sin datos de bodega dice "no sé", no "no hay"', () => {
    // null y false son cosas distintas: una es ignorancia, la otra es
    // una afirmación. Mostrar "sin stock" porque no cargó la tabla es
    // hacer perder una venta.
    const p = productosSugeridos(CLIENTE, [])
    for (const x of p) assert.equal(x.hayStock, null)
  })
})

describe('cuánta plata hay en juego', () => {
  test('suma precio por cantidad', () => {
    assert.equal(montoSugerido([
      { precio: 1200, cantidad: 18 },
      { precio: 2000, cantidad: 10 },
    ]), 41600)
  })

  test('una línea sin precio no rompe el total', () => {
    assert.equal(montoSugerido([{ precio: null, cantidad: 5 }, { precio: 100, cantidad: 2 }]), 200)
  })

  test('sin líneas es 0', () => {
    assert.equal(montoSugerido([]), 0)
  })
})

describe('el motor conoce el rol', () => {
  test('terreno mide visitas y usa distancia', () => {
    const p = perfilRol('vendedor')
    assert.equal(p.rol, 'TERRENO')
    assert.equal(p.usaVisitas, true)
    assert.equal(p.usaDistancia, true)
  })

  test('un KAM no hace visitas de terreno', () => {
    // Medir a un KAM con "8 visitas" es pedirle algo que su trabajo no
    // incluye, y le ensucia la pantalla con un número que nunca va a mover.
    const p = perfilRol('KAM')
    assert.equal(p.rol, 'KAM')
    assert.equal(p.usaVisitas, false)
    assert.equal(p.usaDistancia, false)
    assert.ok(!p.metricas.includes('visitas'))
  })

  test('televenta trabaja por llamada, no por kilómetro', () => {
    const p = perfilRol('televenta')
    assert.equal(p.rol, 'TELEVENTA')
    assert.equal(p.usaDistancia, false)
    assert.equal(p.unidadDeTrabajo, 'llamada')
  })

  test('un rol desconocido cae a terreno', () => {
    // Es el caso mayoritario y el conservador: mejor mostrarle métricas
    // de más a un KAM mal configurado que dejar a un vendedor sin ruta.
    for (const r of ['', null, undefined, 'cualquier_cosa']) {
      assert.equal(perfilRol(r).rol, 'TERRENO')
    }
  })
})

describe('días sin comprar contra SU ciclo', () => {
  test('un cliente atrasado lo dice con su ciclo', () => {
    const r = ritmoCliente(CLIENTE)
    assert.equal(r.dias, 18)
    assert.equal(r.ciclo, 10)
    assert.equal(r.atraso, 8)
    assert.match(r.texto, /18.*10/s)
  })

  test('18 días es normal para quien compra cada 20', () => {
    // El mismo número de días es urgente o irrelevante según el cliente.
    // Un umbral fijo trata igual al que compra semanal y al mensual.
    const r = ritmoCliente({ dias_sin_comprar: 18, ciclo_dias: 20 })
    assert.equal(r.atraso, -2)
  })

  test('sin ciclo conocido no inventa atraso', () => {
    const r = ritmoCliente({ dias_sin_comprar: 18 })
    assert.equal(r.ciclo, null)
    assert.equal(r.atraso, null)
  })

  test('sin fecha de última compra lo dice', () => {
    assert.equal(ritmoCliente({}).dias, null)
  })

  test('si falta ciclo_dias lo estima del histórico de SKUs', () => {
    // La columna no siempre viene cargada. Cada línea del sku_detalle
    // trae su propio cicloDias: la mediana es mejor que un umbral fijo.
    const sinColumna = {
      dias_sin_comprar: 18,
      sku_detalle: [
        { nombre: 'Arroz Grado 2 1kg', cicloDias: 10 },
        { nombre: 'Aceite Maravilla 900ml', cicloDias: 14 },
        { nombre: 'Fideos Spaghetti 400g', cicloDias: 30 },
      ],
    }
    assert.equal(cicloEstimado(sinColumna), 14)
    assert.equal(ritmoCliente(sinColumna).atraso, 4)
  })

  test('la columna manda sobre la estimación', () => {
    assert.equal(cicloEstimado({ ciclo_dias: 7, sku_detalle: [{ nombre: 'Arroz Grado 2 1kg', cicloDias: 30 }] }), 7)
  })

  test('sin nada devuelve 0, no un número inventado', () => {
    assert.equal(cicloEstimado({}), 0)
    assert.equal(cicloEstimado(null), 0)
  })
})

describe('la pantalla completa', () => {
  const DECISIONES = [
    { id: 'rep_ALM-1', type: 'replenish', attention: 'now', score: 80, clientId: 'ALM-1', title: 'Almacén Test', expectedValue: 100000 },
    { id: 'rep_ALM-2', type: 'replenish', attention: 'today', score: 60, clientId: 'ALM-2', title: 'Otro', expectedValue: 50000 },
    { id: 'rep_ALM-3', type: 'protect', attention: 'week', score: 45, clientId: 'ALM-3', title: 'Tercero', expectedValue: 30000 },
    { id: 'rep_ALM-4', type: 'replenish', attention: 'week', score: 42, clientId: 'ALM-4', title: 'Cuarto', expectedValue: 20000 },
    { id: 'rep_ALM-5', type: 'replenish', attention: 'week', score: 41, clientId: 'ALM-5', title: 'Quinto', expectedValue: 10000 },
  ]

  test('hay UNA mejor oportunidad, no una lista', () => {
    const d = armarMiDia({ decisiones: DECISIONES, cartera: [CLIENTE], stock: STOCK })
    assert.ok(d.mejor, 'la pantalla se encabeza con una sola')
    assert.equal(d.mejor.id, 'rep_ALM-1')
    assert.ok(!Array.isArray(d.mejor))
  })

  test('y 2-3 más abajo, no veinte', () => {
    const d = armarMiDia({ decisiones: DECISIONES, cartera: [CLIENTE], stock: STOCK })
    assert.ok(d.siguientes.length <= 3,
      'más de 3 y volvemos a la pantalla llena de tarjetas que el vendedor ' +
      'tiene que leer entera')
    assert.ok(!d.siguientes.some(x => x.id === d.mejor.id), 'la mejor no se repite abajo')
  })

  test('la mejor trae los productos y el monto pegados', () => {
    const d = armarMiDia({ decisiones: DECISIONES, cartera: [CLIENTE], stock: STOCK })
    assert.ok(d.mejor.productos.length > 0, 'sin el QUÉ vender no responde la pregunta')
    assert.ok(d.mejor.monto > 0)
    assert.equal(d.mejor.montoEsReal, true, 'con líneas reales el monto no es una estimación')
    assert.ok(d.mejor.ritmo.texto)
  })

  test('el monto real le gana a la estimación del motor', () => {
    // expectedValue es una fórmula sobre venta_mtd. Si tenemos líneas
    // con precio del cliente y stock, ese número es mejor.
    const d = armarMiDia({ decisiones: DECISIONES, cartera: [CLIENTE], stock: STOCK })
    assert.notEqual(d.mejor.monto, 100000, 'se quedó con el expectedValue del motor')
  })

  test('sin líneas cae al estimado del motor en vez de mostrar $0', () => {
    const d = armarMiDia({
      decisiones: [{ id: 'x', clientId: 'NO-EXISTE', title: 'Y', expectedValue: 77000 }],
      cartera: [], stock: STOCK,
    })
    assert.equal(d.mejor.monto, 77000)
    assert.equal(d.mejor.montoEsReal, false)
  })

  test('suma la plata sobre la mesa', () => {
    const d = armarMiDia({ decisiones: DECISIONES, cartera: [CLIENTE], stock: STOCK })
    const esperado = [d.mejor, ...d.siguientes].reduce((a, x) => a + x.monto, 0)
    assert.equal(d.montoTotal, esperado)
  })

  test('sin decisiones no explota', () => {
    const d = armarMiDia({ decisiones: [], cartera: [], stock: [] })
    assert.equal(d.mejor, null)
    assert.deepEqual(d.siguientes, [])
    assert.equal(d.montoTotal, 0)
  })

  test('sin argumentos tampoco', () => {
    assert.equal(armarMiDia().mejor, null)
  })

  test('respeta el orden que trae el motor', () => {
    // buildDecisionFeed ya ordenó por score CON el ajuste de memoria.
    // Reordenar acá tiraría abajo el circuito de aprendizaje.
    const d = armarMiDia({ decisiones: DECISIONES, cartera: [CLIENTE], stock: STOCK })
    assert.deepEqual(
      [d.mejor, ...d.siguientes].map(x => x.id),
      DECISIONES.slice(0, 4).map(x => x.id),
    )
  })

  test('el perfil de rol llega a cada tarjeta', () => {
    const d = armarMiDia({ decisiones: DECISIONES, cartera: [CLIENTE], stock: STOCK, rol: 'televenta' })
    assert.equal(d.perfil.rol, 'TELEVENTA')
    assert.equal(d.mejor.perfil.usaDistancia, false,
      'la tarjeta tiene que saber si mostrar distancia o no')
  })
})