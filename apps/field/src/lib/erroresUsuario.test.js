/**
 * El caso que originó esto: una captura de producción donde la app,
 * al guardar un pedido de $577.600 sin señal, mostró al vendedor
 *
 *     TypeError: Failed to fetch
 *
 * debajo del total. Nadie parado en la puerta de un local sabe qué
 * hacer con eso, y parece que se perdió el pedido cuando en realidad
 * quedó encolado.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeDeError, esFalloDeRed } from './erroresUsuario.js'

describe('nunca mostrar jerga técnica', () => {
  const CRUDOS = [
    new TypeError('Failed to fetch'),
    new Error('NetworkError when attempting to fetch resource.'),
    { message: 'duplicate key value violates unique constraint "pedidos_pkey"' },
    { message: 'new row violates row-level security policy for table "pedidos"' },
    { message: 'column pedidos.foo does not exist' },
    { message: 'canceling statement due to statement timeout' },
    new Error('Cannot read properties of undefined (reading "id")'),
  ]

  for (const err of CRUDOS) {
    test(`"${String(err.message).slice(0, 40)}" se traduce`, () => {
      const m = mensajeDeError(err)
      assert.ok(m.length > 0, 'siempre tiene que haber algo que mostrar')
      assert.ok(!/TypeError|NetworkError|undefined|null|violates|constraint|statement|properties of/i.test(m),
        `el mensaje todavía tiene jerga: "${m}"`)
      assert.ok(!/[a-z]+_[a-z]+/i.test(m), `se filtró un nombre de columna/tabla: "${m}"`)
    })
  }
})

describe('sin señal · el mensaje depende de si se encoló', () => {
  const red = new TypeError('Failed to fetch')

  test('si quedó en la cola, se lo dice: no perdió nada', () => {
    // Esta es la diferencia entre que el vendedor confíe en la app o
    // que cargue el pedido dos veces.
    const m = mensajeDeError(red, { encolado: true })
    assert.match(m, /se envía|se enví/i)
    assert.ok(!/volvé a intentar/i.test(m), 'no tiene que reintentar: ya está guardado')
  })

  test('si NO se encoló, le pide reintentar', () => {
    const m = mensajeDeError(red, { encolado: false })
    assert.match(m, /intentar|conexión/i)
  })

  test('detecta las variantes de fallo de red de cada navegador', () => {
    for (const t of ['Failed to fetch', 'NetworkError when attempting to fetch resource',
      'Network request failed', 'Load failed', 'ECONNREFUSED']) {
      assert.equal(esFalloDeRed({ message: t }), true, t)
    }
  })

  test('un error de permisos no es falta de señal', () => {
    // Decirle "revisá la conexión" a alguien con un problema de RLS lo
    // manda a buscar señal media hora.
    assert.equal(esFalloDeRed({ message: 'permission denied for table pedidos' }), false)
    assert.match(mensajeDeError({ message: 'permission denied for table pedidos' }), /permiso/i)
  })
})

describe('casos que ya estaban bien', () => {
  test('un mensaje nuestro en castellano pasa tal cual', () => {
    assert.equal(mensajeDeError({ message: 'No se pudo abrir el PDF' }), 'No se pudo abrir el PDF')
  })

  test('sin error no hay mensaje', () => {
    assert.equal(mensajeDeError(null), '')
    assert.equal(mensajeDeError(undefined), '')
  })

  test('un objeto raro no imprime [object Object]', () => {
    // String(objeto) da "[object Object]" y ya nos pasó en producción.
    const m = mensajeDeError({ codigo: 500 })
    assert.ok(!/\[object/.test(m), m)
    assert.ok(m.length > 0)
  })

  test('el duplicado se lee como éxito, no como falla', () => {
    // La cola offline reintenta: un 23505 significa que la primera vez
    // sí funcionó. Asustar al vendedor con "error" sería mentirle.
    assert.match(mensajeDeError({ message: 'duplicate key value' }), /ya estaba guardado/i)
  })
})