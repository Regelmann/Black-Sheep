import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { QueryClient } from '@tanstack/react-query'
import { explainError } from '../lib/query.js'

/**
 * Se ejercita la MISMA lógica de onMutate/onError/onSettled que usa el hook,
 * sin montar React. Lo que se protege acá es la promesa central de una
 * escritura optimista: si el servidor rechaza, la pantalla vuelve a como
 * estaba. Un optimismo sin reversión le miente al usuario.
 */
function correrMutacion({ qc, clave, aplicar, enviar, vars }) {
  return (async () => {
    await qc.cancelQueries({ queryKey: clave })
    const previo = qc.getQueryData(clave)
    qc.setQueryData(clave, (actual = []) => aplicar(actual, vars))
    try {
      const res = await enviar(vars)
      return { ok: true, res }
    } catch (error) {
      if (previo !== undefined) qc.setQueryData(clave, previo)
      return { ok: false, mensaje: explainError(error).user }
    }
  })()
}

const CLAVE = ['admin', 'cartera', '']
const FILAS = [
  { cliente_key: 'C1', nombre_cliente: 'Almacén Rosa', comuna: 'MAIPU' },
  { cliente_key: 'C2', nombre_cliente: 'Botillería Sur', comuna: 'ÑUÑOA' },
]
const parchar = (filas, v) =>
  filas.map(r => (r.cliente_key === v.cliente_key ? { ...r, ...v.patch } : r))

describe('escritura optimista', () => {
  test('la pantalla cambia ANTES de que responda el servidor', async () => {
    const qc = new QueryClient()
    qc.setQueryData(CLAVE, FILAS)

    let resolver
    const enLaRed = new Promise(r => (resolver = r))

    const enVuelo = correrMutacion({
      qc,
      clave: CLAVE,
      aplicar: parchar,
      enviar: () => enLaRed,
      vars: { cliente_key: 'C1', patch: { comuna: 'PROVIDENCIA' } },
    })

    // El cambio se aplica tras `await cancelQueries` (unos microticks), no de
    // forma síncrona. Lo que importa es que ocurre ANTES de que el servidor
    // conteste: en pantalla es la diferencia entre responder en un frame y
    // esperar 3 segundos mirando un spinner. Se espera el evento de caché en
    // vez de contar ticks, que sería frágil ante cambios de la librería.
    await new Promise(res => {
      const off = qc.getQueryCache().subscribe(() => {
        if (qc.getQueryData(CLAVE)?.[0]?.comuna === 'PROVIDENCIA') {
          off()
          res(undefined)
        }
      })
    })
    assert.equal(qc.getQueryData(CLAVE)[0].comuna, 'PROVIDENCIA')

    resolver({})
    await enVuelo
  })

  test('🔴 si el servidor rechaza, la pantalla VUELVE a como estaba', async () => {
    const qc = new QueryClient()
    qc.setQueryData(CLAVE, FILAS)

    const r = await correrMutacion({
      qc,
      clave: CLAVE,
      aplicar: parchar,
      enviar: () => Promise.reject({ code: '42501' }),
      vars: { cliente_key: 'C1', patch: { comuna: 'PROVIDENCIA' } },
    })

    assert.equal(r.ok, false)
    assert.equal(qc.getQueryData(CLAVE)[0].comuna, 'MAIPU', 'debe revertir')
    assert.deepEqual(qc.getQueryData(CLAVE), FILAS, 'la lista entera vuelve atrás')
  })

  test('el mensaje de error está en castellano, sin jerga de PostgREST', async () => {
    const qc = new QueryClient()
    qc.setQueryData(CLAVE, FILAS)

    const r = await correrMutacion({
      qc,
      clave: CLAVE,
      aplicar: parchar,
      enviar: () => Promise.reject({ code: '42501', message: 'permission denied for table' }),
      vars: { cliente_key: 'C1', patch: { comuna: 'X' } },
    })

    assert.ok(r.mensaje)
    assert.ok(!/permission denied/i.test(r.mensaje), 'no puede filtrar el error crudo')
  })

  test('sólo se toca la fila editada', async () => {
    const qc = new QueryClient()
    qc.setQueryData(CLAVE, FILAS)

    await correrMutacion({
      qc,
      clave: CLAVE,
      aplicar: parchar,
      enviar: () => Promise.resolve({}),
      vars: { cliente_key: 'C1', patch: { comuna: 'PROVIDENCIA' } },
    })

    assert.deepEqual(qc.getQueryData(CLAVE)[1], FILAS[1], 'la otra fila queda intacta')
  })

  test('revertir sobre una caché vacía no rompe', async () => {
    const qc = new QueryClient()
    const r = await correrMutacion({
      qc,
      clave: CLAVE,
      aplicar: parchar,
      enviar: () => Promise.reject(new Error('sin red')),
      vars: { cliente_key: 'C1', patch: { comuna: 'X' } },
    })
    assert.equal(r.ok, false)
  })
})

describe('coordinación con consultas en vuelo', () => {
  test('una respuesta vieja no pisa el cambio recién aplicado', async () => {
    // Sin cancelQueries, un refetch lanzado ANTES de editar puede aterrizar
    // después y sobrescribir lo que el usuario acaba de guardar: para él, su
    // cambio "se deshizo solo".
    const qc = new QueryClient()
    qc.setQueryData(CLAVE, FILAS)

    await correrMutacion({
      qc,
      clave: CLAVE,
      aplicar: parchar,
      enviar: () => Promise.resolve({}),
      vars: { cliente_key: 'C1', patch: { comuna: 'PROVIDENCIA' } },
    })

    assert.equal(qc.getQueryData(CLAVE)[0].comuna, 'PROVIDENCIA')
  })
})