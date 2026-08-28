/**
 * geo.js — la distancia que decide si un check-in vale
 *
 * POR QUÉ IMPORTA
 * `haversineM` alimenta la verificación de visitas: si el vendedor está a
 * más de X metros del cliente, el check-in queda marcado como sospechoso.
 * Un error de escala acá (metros por kilómetros, radianes por grados)
 * no rompe nada visible — simplemente empieza a aprobar check-ins falsos
 * o a rechazar visitas legítimas, en silencio y para siempre.
 *
 * 314 líneas sin tests hasta acá.
 *
 * Las distancias de referencia son de pares de coordenadas reales de
 * Santiago, calculadas con la fórmula del gran círculo. La tolerancia es
 * de 1%: haversine asume una esfera perfecta y el valor "verdadero"
 * (elipsoide WGS84) difiere en ese orden.
 */
import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  haversineM, formatDist, formatEta, accuracyLabel, isNearClient,
  geoErrorMessage, getPositionPrecise,
} from './geo.js'

/* Puntos reales de la zona donde opera la app. */
const PLAZA_ARMAS = [-33.4372, -70.6506]
const MONEDA = [-33.4429, -70.6539]        // ~700 m de Plaza de Armas
const MAIPU = [-33.5110, -70.7580]         // ~13 km

describe('haversineM · escala y casos límite', () => {
  test('mismo punto = 0', () => {
    assert.equal(haversineM(...PLAZA_ARMAS, ...PLAZA_ARMAS), 0)
  })

  test('distancia corta urbana (~700 m)', () => {
    const d = haversineM(...PLAZA_ARMAS, ...MONEDA)
    assert.ok(d > 690 && d < 720, `dio ${Math.round(d)} m, se esperaba ~705`)
  })

  test('distancia media (~13 km)', () => {
    const d = haversineM(...PLAZA_ARMAS, ...MAIPU)
    assert.ok(d > 12500 && d < 13500, `dio ${Math.round(d)} m, se esperaba ~13 km`)
  })

  test('un grado de latitud son ~111 km', () => {
    // Referencia independiente de Santiago: si alguien cambia el radio
    // de la Tierra o mezcla grados con radianes, esto lo caza.
    const d = haversineM(0, 0, 1, 0)
    assert.ok(Math.abs(d - 111195) < 1200, `un grado dio ${Math.round(d)} m`)
  })

  test('es simétrica', () => {
    const ida = haversineM(...PLAZA_ARMAS, ...MAIPU)
    const vuelta = haversineM(...MAIPU, ...PLAZA_ARMAS)
    assert.ok(Math.abs(ida - vuelta) < 0.001)
  })

  test('devuelve null si falta cualquier coordenada', () => {
    // Un cliente sin geo cargada. Devolver 0 sería peor que null: 0 es
    // "estás encima del local" y aprobaría el check-in.
    assert.equal(haversineM(null, -70.6, -33.4, -70.6), null)
    assert.equal(haversineM(-33.4, undefined, -33.4, -70.6), null)
    assert.equal(haversineM(-33.4, -70.6, NaN, -70.6), null)
    assert.equal(haversineM('', -70.6, -33.4, -70.6), null)
  })

  test('la cadena vacía no es la coordenada 0', () => {
    // EL BUG QUE ENCONTRÓ ESTE ARCHIVO. `isNaN(Number(v))` no alcanza:
    // Number('') es 0, no NaN. Una columna vacía de Supabase pasaba el
    // filtro (los llamadores sólo miran `!= null`) y se medía contra la
    // coordenada 0,0 — Golfo de Guinea, ~3.700 km de Santiago. No
    // explotaba nada: devolvía una distancia enorme pero plausible, y el
    // check-in legítimo quedaba rechazado por "lejos del cliente".
    for (const basura of ['', '   ', [], false, {}, Infinity, 'abc']) {
      assert.equal(haversineM(-33.4372, -70.6506, basura, -70.65), null,
        `${JSON.stringify(basura)} no es una coordenada`)
    }
  })

  test('el 0 legítimo sigue midiendo', () => {
    // Ecuador y Greenwich son coordenadas reales: el arreglo de arriba no
    // puede tirarlas junto con la basura.
    assert.ok(haversineM(0, 0, 1, 0) > 111000)
    assert.ok(haversineM('0', '0', '1', '0') > 111000)
  })

  test('acepta coordenadas en string (vienen así de Supabase)', () => {
    const num = haversineM(...PLAZA_ARMAS, ...MONEDA)
    const str = haversineM('-33.4372', '-70.6506', '-33.4429', '-70.6539')
    assert.ok(Math.abs(num - str) < 0.001, 'un lat/lng en texto debe medir igual')
  })
})

describe('isNearClient · el umbral del check-in', () => {
  test('adentro del radio', () => {
    assert.equal(isNearClient(...PLAZA_ARMAS, ...MONEDA, 800), true)
  })

  test('afuera del radio', () => {
    assert.equal(isNearClient(...PLAZA_ARMAS, ...MONEDA, 500), false)
  })

  test('sin coordenadas NO está cerca', () => {
    // El caso peligroso: si haversineM devuelve null y el código lo
    // tratara como 0, un cliente sin geo aprobaría cualquier check-in.
    assert.equal(isNearClient(null, null, ...MONEDA), false)
    assert.equal(isNearClient(...PLAZA_ARMAS, null, null), false)
  })

  test('el radio por defecto son 150 m', () => {
    // ~705 m: fuera del default. Fija el valor para que un cambio de
    // umbral sea deliberado y no accidental.
    assert.equal(isNearClient(...PLAZA_ARMAS, ...MONEDA), false)
  })
})

describe('formatDist · lo que lee el vendedor', () => {
  test('bajo 1 km va en metros redondos', () => {
    assert.equal(formatDist(0), '0 m')
    assert.equal(formatDist(45.6), '46 m')
    assert.equal(formatDist(999), '999 m')
  })

  test('sobre 1 km va en km con un decimal', () => {
    assert.equal(formatDist(1000), '1.0 km')
    assert.equal(formatDist(9999), '10.0 km')
  })

  test('sobre 10 km sin decimales', () => {
    assert.equal(formatDist(10000), '10 km')
    assert.equal(formatDist(13400), '13 km')
  })

  test('sin dato muestra guion, no NaN', () => {
    assert.equal(formatDist(null), '—')
    assert.equal(formatDist(undefined), '—')
    assert.equal(formatDist(NaN), '—')
  })
})

describe('formatEta', () => {
  test('mínimo 1 minuto: nunca "0 min"', () => {
    assert.equal(formatEta(10), '~1 min')
  })

  test('minutos bajo la hora', () => {
    // 25 km/h de velocidad urbana asumida.
    assert.equal(formatEta(5000), '~12 min')
  })

  test('sobre una hora usa formato h/m', () => {
    assert.equal(formatEta(30000), '~1h 12m')
    assert.equal(formatEta(25000), '~1h')
  })

  test('sin dato devuelve null (la UI decide qué poner)', () => {
    assert.equal(formatEta(null), null)
    assert.equal(formatEta(NaN), null)
  })
})

describe('accuracyLabel · qué tan confiable es la posición', () => {
  const casos = [
    [10, 'good'], [30, 'good'],
    [31, 'ok'], [80, 'ok'],
    [81, 'warn'], [200, 'warn'],
    [201, 'bad'], [5000, 'bad'],
  ]
  for (const [acc, level] of casos) {
    test(`${acc} m → ${level}`, () => {
      assert.equal(accuracyLabel(acc).level, level)
    })
  }

  test('sin precisión es "bad", no "good"', () => {
    // Fallar hacia el lado seguro: sin dato de precisión no se puede
    // afirmar que el check-in sea confiable.
    assert.equal(accuracyLabel(null).level, 'bad')
    assert.equal(accuracyLabel(NaN).level, 'bad')
  })

  test('siempre trae texto para mostrar', () => {
    for (const v of [null, 10, 100, 9999]) {
      assert.equal(typeof accuracyLabel(v).text, 'string')
      assert.ok(accuracyLabel(v).text.length > 0)
    }
  })
})

describe('geoErrorMessage · el vendedor tiene que saber qué hacer', () => {
  test('cada código conocido da un mensaje accionable', () => {
    for (const code of ['denied', 'unavailable', 'timeout', 'insecure', 'no_geo']) {
      const msg = geoErrorMessage(code)
      assert.equal(typeof msg, 'string')
      assert.ok(msg.length > 10, `"${code}" da un mensaje demasiado corto: ${msg}`)
    }
  })

  test('un código desconocido no rompe la UI', () => {
    const msg = geoErrorMessage('algo_que_no_existe')
    assert.equal(typeof msg, 'string')
    assert.ok(msg.length > 0)
  })
})

/* ── getPositionPrecise: la escalera red → GPS → watch ─────────────────── */

function fingirGeolocation({ coarse, fine, watch } = {}) {
  const respuesta = (v, cb, errCb) => {
    if (!v) return errCb?.({ code: 3, message: 'timeout' })
    setTimeout(() => cb({ coords: v, timestamp: Date.now() }), 0)
  }
  return {
    getCurrentPosition(cb, errCb, opts) {
      respuesta(opts?.enableHighAccuracy ? fine : coarse, cb, errCb)
    },
    watchPosition(cb, errCb) {
      if (watch) setTimeout(() => cb({ coords: watch, timestamp: Date.now() }), 0)
      else setTimeout(() => errCb?.({ code: 2, message: 'unavailable' }), 0)
      return 1
    },
    clearWatch() {},
  }
}

const coords = (lat, lng, accuracy) => ({ latitude: lat, longitude: lng, accuracy })

describe('getPositionPrecise · elige la mejor posición disponible', () => {
  let navReal, winReal
  beforeEach(() => {
    navReal = globalThis.navigator
    winReal = globalThis.window
    Object.defineProperty(globalThis, 'window', {
      value: { isSecureContext: true }, configurable: true, writable: true,
    })
  })
  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: navReal, configurable: true, writable: true,
    })
    Object.defineProperty(globalThis, 'window', {
      value: winReal, configurable: true, writable: true,
    })
  })

  const conGeo = geo => Object.defineProperty(globalThis, 'navigator', {
    value: { geolocation: geo }, configurable: true, writable: true,
  })

  test('si la red ya es precisa, no enciende el GPS', async () => {
    // Ahorra batería y segundos: es la diferencia entre un check-in
    // inmediato y 20 s mirando una ruedita bajo techo.
    let usoGps = false
    const geo = fingirGeolocation({ coarse: coords(-33.44, -70.65, 40) })
    const orig = geo.getCurrentPosition
    geo.getCurrentPosition = function (cb, errCb, opts) {
      if (opts?.enableHighAccuracy) usoGps = true
      return orig.call(this, cb, errCb, opts)
    }
    conGeo(geo)

    const r = await getPositionPrecise({ targetAccM: 80, maxWaitMs: 300 })
    assert.equal(r.accuracy, 40)
    assert.equal(usoGps, false, 'no debía escalar al GPS teniendo red precisa')
  })

  test('si la red es mala, escala al GPS', async () => {
    conGeo(fingirGeolocation({
      coarse: coords(-33.44, -70.65, 500),
      fine: coords(-33.4401, -70.6501, 25),
    }))
    const r = await getPositionPrecise({ targetAccM: 80, maxWaitMs: 300 })
    assert.equal(r.accuracy, 25, 'debía quedarse con la lectura del GPS')
  })

  test('se queda con la MÁS precisa, no con la última', async () => {
    // El GPS puede volver peor que la red bajo techo. Quedarse con la
    // última lectura degradaría la posición.
    conGeo(fingirGeolocation({
      coarse: coords(-33.44, -70.65, 90),
      fine: coords(-33.50, -70.70, 400),
    }))
    const r = await getPositionPrecise({ targetAccM: 50, maxWaitMs: 200 })
    assert.equal(r.accuracy, 90, 'se quedó con la peor de las dos')
  })

  test('sin HTTPS avisa insecure en vez de fallar raro', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: { isSecureContext: false }, configurable: true, writable: true,
    })
    const r = await getPositionPrecise({ maxWaitMs: 100 })
    assert.equal(r.error, 'insecure')
    assert.equal(r.lat, null)
  })

  test('si todo falla devuelve un error, no una posición inventada', async () => {
    conGeo(fingirGeolocation({}))
    const r = await getPositionPrecise({ targetAccM: 80, maxWaitMs: 200 })
    assert.equal(r.lat, null, 'jamás inventar una coordenada')
    assert.ok(r.error, 'tiene que decir por qué falló')
  })

  test('sin API de geolocalización no lanza', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {}, configurable: true, writable: true,
    })
    const r = await getPositionPrecise({ maxWaitMs: 100 })
    assert.equal(r.lat, null)
    assert.ok(r.error)
  })
})