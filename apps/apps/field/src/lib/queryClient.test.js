import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  valeLaPenaReintentar,
  politicaDeReintento,
  esperaDeReintento,
  crearQueryClient,
} from './queryClient.js'

describe('política de reintento · errores que NO se reintentan', () => {
  // Reintentar un 42703 no arregla el esquema: sólo demora el error tres
  // veces más y quema datos móviles. Es la clase de bug que explainError
  // existe para hacer visible, no para esconder tras reintentos.
  test('42703 (columna inexistente) no se reintenta', () => {
    assert.equal(valeLaPenaReintentar({ code: '42703' }), false)
  })

  test('42P01 (tabla inexistente) no se reintenta', () => {
    assert.equal(valeLaPenaReintentar({ code: '42P01' }), false)
  })

  test('42501 (RLS denegó) no se reintenta', () => {
    assert.equal(valeLaPenaReintentar({ code: '42501' }), false)
  })

  test('23505 (duplicado) no se reintenta', () => {
    assert.equal(valeLaPenaReintentar({ code: '23505' }), false)
  })

  test('HTTP 4xx no se reintenta', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      assert.equal(valeLaPenaReintentar({ status }), false, `status ${status}`)
    }
  })
})

describe('política de reintento · errores que SÍ se reintentan', () => {
  test('error de red sin código se reintenta', () => {
    assert.equal(valeLaPenaReintentar(new Error('Failed to fetch')), true)
  })

  test('HTTP 408 y 429 se reintentan: se destraban solos', () => {
    assert.equal(valeLaPenaReintentar({ status: 408 }), true)
    assert.equal(valeLaPenaReintentar({ status: 429 }), true)
  })

  test('HTTP 5xx se reintenta: el servidor puede recuperarse', () => {
    for (const status of [500, 502, 503]) {
      assert.equal(valeLaPenaReintentar({ status }), true, `status ${status}`)
    }
  })

  test('error nulo o indefinido se reintenta (no se puede descartar)', () => {
    assert.equal(valeLaPenaReintentar(null), true)
    assert.equal(valeLaPenaReintentar(undefined), true)
  })
})

describe('política de reintento · corte por número de intentos', () => {
  test('corta en 2 reintentos para errores transitorios', () => {
    const red = new Error('network')
    assert.equal(politicaDeReintento(0, red), true)
    assert.equal(politicaDeReintento(1, red), true)
    assert.equal(politicaDeReintento(2, red), false, 'no debe pasar de 2')
  })

  test('un error de esquema corta en el intento CERO', () => {
    assert.equal(politicaDeReintento(0, { code: '42703' }), false)
  })
})

describe('espera entre reintentos', () => {
  test('crece exponencialmente y tiene tope de 30 s', () => {
    assert.equal(esperaDeReintento(0), 1000)
    assert.equal(esperaDeReintento(1), 2000)
    assert.equal(esperaDeReintento(2), 4000)
    assert.equal(esperaDeReintento(99), 30_000, 'debe topar, no desbordar')
  })
})

describe('configuración del cliente', () => {
  test('las escrituras no se reintentan: para eso está el outbox', () => {
    const qc = crearQueryClient()
    assert.equal(qc.getDefaultOptions().mutations?.retry, false)
  })

  test('no refresca al recuperar foco, sí al recuperar red', () => {
    const qc = crearQueryClient()
    const q = qc.getDefaultOptions().queries
    assert.equal(q?.refetchOnWindowFocus, false, 'el foco cambia todo el tiempo en móvil')
    assert.equal(q?.refetchOnReconnect, true, 'recuperar señal SÍ amerita refrescar')
  })

  test('la caché sobrevive la jornada completa', () => {
    const qc = crearQueryClient()
    assert.ok(
      Number(qc.getDefaultOptions().queries?.gcTime) >= 12 * 60 * 60 * 1000,
      'sin señal hay que poder mostrar lo último conocido'
    )
  })

  test('offlineFirst: navigator.onLine miente demasiado seguido', () => {
    const qc = crearQueryClient()
    assert.equal(qc.getDefaultOptions().queries?.networkMode, 'offlineFirst')
  })
})