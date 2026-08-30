import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dondeIr,
  valorPunto,
  urgenciaPunto,
  costoDistancia,
  textoDistancia,
  textoPesos,
  tituloDondeIr,
} from './dondeIr.js'
import { haversineM } from './geo.js'
import { perfilRol } from './miDia.js'

const TERRENO = perfilRol('ejecutivo')
const KAM = perfilRol('KAM')
const TELE = perfilRol('televenta')

// Plaza de Armas de Santiago como origen.
const YO = { lat: -33.4372, lng: -70.6506 }

/** Punto a ~N metros al norte del origen. 1 grado de lat ≈ 111.320 m */
function aMetros(m, extra = {}) {
  return { lat: YO.lat + m / 111320, lng: YO.lng, ...extra }
}

test('valorPunto: cliente usa venta_mensual', () => {
  const v = valorPunto({ _tipo: 'cliente', venta_mensual: 800000, venta_mtd: 10 })
  assert.equal(v.clp, 800000)
  assert.equal(v.base, 'venta_mensual')
})

test('valorPunto: cliente sin mensual cae a MTD', () => {
  const v = valorPunto({ _tipo: 'cliente', venta_mtd: 120000 })
  assert.equal(v.clp, 120000)
  assert.equal(v.base, 'venta_mtd')
})

test('valorPunto: el potencial de un prospecto se descuenta al 30%', () => {
  const v = valorPunto({ _tipo: 'prospecto', potencial: 1000000 })
  assert.equal(v.clp, 300000)
  assert.equal(v.base, 'potencial')
})

test('valorPunto: una promesa no le gana a una venta real del mismo monto', () => {
  const pros = valorPunto({ _tipo: 'prospecto', potencial: 500000 })
  const cli = valorPunto({ _tipo: 'cliente', venta_mensual: 500000 })
  assert.ok(pros.clp < cli.clp)
})

test('valorPunto: sin datos devuelve 0 y lo dice', () => {
  const v = valorPunto({ _tipo: 'cliente' })
  assert.equal(v.clp, 0)
  assert.equal(v.base, 'sin_dato')
})

test('urgencia: el atraso se mide contra el ciclo propio, no contra un umbral fijo', () => {
  // 20 días es normal para quien compra cada 30, y grave para quien compra cada 7.
  const mensual = urgenciaPunto({ _tipo: 'cliente', dias_sin_comprar: 20, ciclo_dias: 30 })
  const semanal = urgenciaPunto({ _tipo: 'cliente', dias_sin_comprar: 20, ciclo_dias: 7 })
  assert.ok(semanal.u > mensual.u)
  assert.equal(semanal.u, 1)
  assert.ok(mensual.u < 0.5)
})

test('urgencia: dos ciclos de atraso satura en 1', () => {
  assert.equal(urgenciaPunto({ _tipo: 'cliente', dias_sin_comprar: 60, ciclo_dias: 10 }).u, 1)
  assert.equal(urgenciaPunto({ _tipo: 'cliente', dias_sin_comprar: 600, ciclo_dias: 10 }).u, 1)
})

test('urgencia: un fugado es máxima urgencia', () => {
  assert.equal(urgenciaPunto({ _tipo: 'cliente', estado_fuga: 'FUGADO' }).u, 1)
})

test('urgencia: un prospecto nunca es urgente — no hay nada perdiéndose', () => {
  const p = urgenciaPunto({ _tipo: 'prospecto', potencial: 9000000 })
  assert.ok(p.u < 0.5)
})

test('urgencia: el motivo nombra el ciclo real para que el vendedor pueda discutirlo', () => {
  const u = urgenciaPunto({ _tipo: 'cliente', dias_sin_comprar: 24, ciclo_dias: 8 })
  assert.match(u.motivo, /24 días/)
  assert.match(u.motivo, /cada 8/)
})

test('costoDistancia: crece sublineal — 4 km cuesta el doble que 1 km, no 4 veces', () => {
  const c1 = costoDistancia(1000, TERRENO)
  const c4 = costoDistancia(4000, TERRENO)
  assert.equal(c1, 2)
  assert.equal(c4, 3)
})

test('costoDistancia: para KAM y televenta la distancia no cuenta', () => {
  assert.equal(costoDistancia(30000, KAM), 1)
  assert.equal(costoDistancia(30000, TELE), 1)
})

test('EL BUG QUE MOTIVÓ EL MÓDULO: la esquina barata ya no le gana al cliente grande', () => {
  const esquina = aMetros(80, {
    _tipo: 'cliente', cliente_key: 'esquina', nombre_cliente: 'Almacén de la esquina',
    venta_mensual: 30000, dias_sin_comprar: 30, ciclo_dias: 15,
  })
  const grande = aMetros(600, {
    _tipo: 'cliente', cliente_key: 'grande', nombre_cliente: 'Supermercado grande',
    venta_mensual: 800000, dias_sin_comprar: 45, ciclo_dias: 15,
  })
  const { lista } = dondeIr({
    items: [esquina, grande], myPos: YO, perfil: TERRENO, distancia: haversineM,
  })
  assert.equal(lista[0].cliente_key, 'grande')
})

test('a igual valor y urgencia, gana el más cerca', () => {
  const cerca = aMetros(200, { _tipo: 'cliente', cliente_key: 'cerca', venta_mensual: 400000, dias_sin_comprar: 30, ciclo_dias: 15 })
  const lejos = aMetros(5000, { _tipo: 'cliente', cliente_key: 'lejos', venta_mensual: 400000, dias_sin_comprar: 30, ciclo_dias: 15 })
  const { lista } = dondeIr({ items: [lejos, cerca], myPos: YO, perfil: TERRENO, distancia: haversineM })
  assert.equal(lista[0].cliente_key, 'cerca')
})

test('a igual valor y distancia, gana el más atrasado', () => {
  const alDia = aMetros(300, { _tipo: 'cliente', cliente_key: 'aldia', venta_mensual: 400000, dias_sin_comprar: 3, ciclo_dias: 15 })
  const atrasado = aMetros(300, { _tipo: 'cliente', cliente_key: 'atrasado', venta_mensual: 400000, dias_sin_comprar: 40, ciclo_dias: 15 })
  const { lista } = dondeIr({ items: [alDia, atrasado], myPos: YO, perfil: TERRENO, distancia: haversineM })
  assert.equal(lista[0].cliente_key, 'atrasado')
})

test('lo que ya está en la ruta no se vuelve a recomendar', () => {
  const enRuta = aMetros(100, { _tipo: 'cliente', cliente_key: 'yaesta', venta_mensual: 9000000, dias_sin_comprar: 90, ciclo_dias: 10, _enRuta: true })
  const otro = aMetros(400, { _tipo: 'cliente', cliente_key: 'otro', venta_mensual: 100000, dias_sin_comprar: 20, ciclo_dias: 10 })
  const { lista } = dondeIr({ items: [enRuta, otro], myPos: YO, perfil: TERRENO, distancia: haversineM })
  assert.deepEqual(lista.map(x => x.cliente_key), ['otro'])
})

test('las paradas de la ruta tampoco entran como candidatas', () => {
  const parada = aMetros(100, { _tipo: 'ruta', cliente_key: 'parada', venta_mensual: 500000 })
  const { lista } = dondeIr({ items: [parada], myPos: YO, perfil: TERRENO, distancia: haversineM })
  assert.equal(lista.length, 0)
})

test('sin GPS todavía recomienda: ordena por valor por urgencia y lo avisa', () => {
  const chico = { _tipo: 'cliente', cliente_key: 'chico', lat: -33.4, lng: -70.6, venta_mensual: 50000, dias_sin_comprar: 40, ciclo_dias: 10 }
  const grande = { _tipo: 'cliente', cliente_key: 'grande', lat: -33.5, lng: -70.7, venta_mensual: 900000, dias_sin_comprar: 40, ciclo_dias: 10 }
  const r = dondeIr({ items: [chico, grande], myPos: null, perfil: TERRENO, distancia: haversineM })
  assert.equal(r.sinGps, true)
  assert.equal(r.lista[0].cliente_key, 'grande')
})

test('KAM: no se marca sinGps porque la distancia no le aplica', () => {
  const items = [{ _tipo: 'cliente', cliente_key: 'a', venta_mensual: 100000, dias_sin_comprar: 30, ciclo_dias: 10 }]
  const r = dondeIr({ items, myPos: null, perfil: KAM, distancia: haversineM })
  assert.equal(r.sinGps, false)
  assert.equal(r.lista.length, 1)
})

test('KAM: un cliente lejano y valioso le gana a uno cercano y chico', () => {
  const cercaChico = aMetros(100, { _tipo: 'cliente', cliente_key: 'cerca', venta_mensual: 50000, dias_sin_comprar: 30, ciclo_dias: 10 })
  const lejosGrande = aMetros(40000, { _tipo: 'cliente', cliente_key: 'lejos', venta_mensual: 900000, dias_sin_comprar: 30, ciclo_dias: 10 })
  const { lista } = dondeIr({ items: [cercaChico, lejosGrande], myPos: YO, perfil: KAM, distancia: haversineM })
  assert.equal(lista[0].cliente_key, 'lejos')
})

test('el radio descarta lo que está fuera, pero sólo si hay GPS', () => {
  const dentro = aMetros(500, { _tipo: 'cliente', cliente_key: 'dentro', venta_mensual: 100000, dias_sin_comprar: 30, ciclo_dias: 10 })
  const fuera = aMetros(9000, { _tipo: 'cliente', cliente_key: 'fuera', venta_mensual: 100000, dias_sin_comprar: 30, ciclo_dias: 10 })
  const con = dondeIr({ items: [dentro, fuera], myPos: YO, perfil: TERRENO, distancia: haversineM, radioM: 3000 })
  assert.deepEqual(con.lista.map(x => x.cliente_key), ['dentro'])
  const sin = dondeIr({ items: [dentro, fuera], myPos: null, perfil: TERRENO, distancia: haversineM, radioM: 3000 })
  assert.equal(sin.lista.length, 2)
})

test('un punto sin coordenadas se descarta cuando hay GPS, no rompe el orden', () => {
  const sinGeo = { _tipo: 'cliente', cliente_key: 'nogeo', venta_mensual: 900000, dias_sin_comprar: 40, ciclo_dias: 10 }
  const conGeo = aMetros(400, { _tipo: 'cliente', cliente_key: 'geo', venta_mensual: 100000, dias_sin_comprar: 40, ciclo_dias: 10 })
  const { lista } = dondeIr({ items: [sinGeo, conGeo], myPos: YO, perfil: TERRENO, distancia: haversineM })
  assert.deepEqual(lista.map(x => x.cliente_key), ['geo'])
})

test('un punto sin valor ni urgencia no se recomienda', () => {
  const vacio = aMetros(100, { _tipo: 'cliente', cliente_key: 'vacio', dias_sin_comprar: 0, ciclo_dias: 30 })
  const { lista } = dondeIr({ items: [vacio], myPos: YO, perfil: TERRENO, distancia: haversineM })
  assert.equal(lista.length, 0)
})

test('el límite recorta pero total informa cuántos calificaron', () => {
  const items = Array.from({ length: 20 }, (_, i) =>
    aMetros(100 * (i + 1), { _tipo: 'cliente', cliente_key: 'c' + i, venta_mensual: 100000, dias_sin_comprar: 30, ciclo_dias: 10 }))
  const r = dondeIr({ items, myPos: YO, perfil: TERRENO, distancia: haversineM, limite: 3 })
  assert.equal(r.lista.length, 3)
  assert.equal(r.total, 20)
})

test('cada recomendación explica por qué, con plata y con tiempo', () => {
  const c = aMetros(650, { _tipo: 'cliente', cliente_key: 'x', venta_mensual: 480000, dias_sin_comprar: 32, ciclo_dias: 12 })
  const { lista } = dondeIr({ items: [c], myPos: YO, perfil: TERRENO, distancia: haversineM })
  assert.match(lista[0]._porque, /\$480\.000\/mes/)
  assert.match(lista[0]._porque, /32 días/)
  assert.match(lista[0]._porque, /a 6\d\d m|a 0,7 km/)
})

test('la explicación de un KAM no menciona distancia', () => {
  const c = aMetros(5000, { _tipo: 'cliente', cliente_key: 'x', venta_mensual: 480000, dias_sin_comprar: 32, ciclo_dias: 12 })
  const { lista } = dondeIr({ items: [c], myPos: YO, perfil: KAM, distancia: haversineM })
  assert.doesNotMatch(lista[0]._porque, /km|\bm\b/)
})

test('el orden es estable ante empate: dos cargas iguales dan lo mismo', () => {
  const a = aMetros(300, { _tipo: 'cliente', cliente_key: 'a', nombre_cliente: 'Aaa', venta_mensual: 200000, dias_sin_comprar: 30, ciclo_dias: 10 })
  const b = aMetros(300, { _tipo: 'cliente', cliente_key: 'b', nombre_cliente: 'Bbb', venta_mensual: 200000, dias_sin_comprar: 30, ciclo_dias: 10 })
  const uno = dondeIr({ items: [a, b], myPos: YO, perfil: TERRENO, distancia: haversineM })
  const dos = dondeIr({ items: [b, a], myPos: YO, perfil: TERRENO, distancia: haversineM })
  assert.deepEqual(uno.lista.map(x => x.cliente_key), dos.lista.map(x => x.cliente_key))
})

test('lista vacía no rompe', () => {
  const r = dondeIr({ items: [], myPos: YO, perfil: TERRENO, distancia: haversineM })
  assert.deepEqual(r.lista, [])
  assert.equal(r.total, 0)
})

test('textoDistancia usa coma decimal chilena', () => {
  assert.equal(textoDistancia(850), '850 m')
  assert.equal(textoDistancia(1240), '1,2 km')
  assert.equal(textoDistancia(null), '')
})

test('textoPesos formatea en CLP y calla el cero', () => {
  assert.equal(textoPesos(1240000), '$1.240.000')
  assert.equal(textoPesos(0), '')
})

test('el título dice la verdad según rol y GPS', () => {
  assert.match(tituloDondeIr(TERRENO, false), /Dónde te conviene ir/)
  assert.match(tituloDondeIr(TERRENO, true), /activá GPS/)
  assert.match(tituloDondeIr(KAM, false), /contactar/)
  assert.match(tituloDondeIr(TELE, true), /contactar/)
})