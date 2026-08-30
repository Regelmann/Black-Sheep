/**
 * MOVER UNA COMUNA ENTERA, SABIENDO CUÁNTO SE MUEVE
 *
 * Macul cambió de zona tres veces en tres días, y cada vez hizo falta
 * editar código y correr SQL a mano. El administrador tiene que poder
 * hacerlo solo.
 *
 * El detalle que lo hacía inútil: cambiar la zona de una comuna en
 * Admin escribía `zonas_comunas`, pero Ruta.jsx filtra los pines por
 * `prospectos.zona`, y la maestra comuna→zona sólo decide para los
 * prospectos que NO tienen zona. Marcar "Macul → Zona Sur" dejaba a sus
 * 387 prospectos exactamente donde estaban, sin ningún aviso.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  simularReasignacion,
  aplicarReasignacion,
  textoConfirmacion,
  simularTraspaso,
  aplicarTraspaso,
  textoTraspaso,
} from './reasignarComuna.js'

/**
 * Doble de Supabase. `filas` son los prospectos de la comuna buscada.
 * Registra las escrituras para poder afirmar sobre ellas.
 */
function fakeSupabase(filas, { errorSelect = null, errorUpdate = null, errorUpsert = null } = {}) {
  const escrituras = { update: null, upsert: null, filtros: {} }
  return {
    escrituras,
    from(tabla) {
      if (tabla === 'prospectos') {
        return {
          select() {
            return {
              ilike(col, val) {
                escrituras.filtros.select = { col, val }
                return Promise.resolve(
                  errorSelect ? { data: null, error: { message: errorSelect } }
                    : { data: filas, error: null },
                )
              },
            }
          },
          update(patch) {
            escrituras.update = patch
            return {
              ilike(col, val) {
                escrituras.filtros.update = { col, val }
                return {
                  neq(c2, v2) {
                    escrituras.filtros.neq = { col: c2, val: v2 }
                    return Promise.resolve(
                      errorUpdate ? { error: { message: errorUpdate } } : { error: null },
                    )
                  },
                }
              },
            }
          },
        }
      }
      // zonas_comunas
      return {
        upsert(row, opts) {
          escrituras.upsert = { row, opts }
          return Promise.resolve(
            errorUpsert ? { error: { message: errorUpsert } } : { error: null },
          )
        },
      }
    },
  }
}

/* Macul: 387 prospectos, la mayoría en la zona equivocada. */
const MACUL = [
  ...Array(300).fill({ zona: 'NOR-ORIENTE' }),
  ...Array(80).fill({ zona: 'NOR-PONIENTE' }),
  ...Array(7).fill({ zona: 'ZONA SUR' }),
]

describe('simular antes de tocar nada', () => {
  test('cuenta cuántos se mueven de verdad', async () => {
    const db = fakeSupabase(MACUL)
    const r = await simularReasignacion(db, 'Macul', 'ZONA SUR')
    assert.equal(r.ok, true)
    assert.equal(r.total, 387)
    assert.equal(r.aMover, 380, 'los 7 que ya están en Zona Sur no cuentan')
  })

  test('dice de qué zonas salen', async () => {
    const r = await simularReasignacion(fakeSupabase(MACUL), 'Macul', 'ZONA SUR')
    assert.equal(r.porZona['NOR-ORIENTE'], 300)
    assert.equal(r.porZona['NOR-PONIENTE'], 80)
  })

  test('no escribe nada', async () => {
    const db = fakeSupabase(MACUL)
    await simularReasignacion(db, 'Macul', 'ZONA SUR')
    assert.equal(db.escrituras.update, null)
    assert.equal(db.escrituras.upsert, null)
  })

  test('los prospectos sin zona también cuentan como movibles', async () => {
    const db = fakeSupabase([{ zona: null }, { zona: '' }, { zona: 'ZONA SUR' }])
    const r = await simularReasignacion(db, 'Macul', 'ZONA SUR')
    assert.equal(r.aMover, 2)
    assert.equal(r.porZona['(sin zona)'], 2)
  })

  test('compara zonas normalizadas', async () => {
    // 'zona sur' en minúscula es la misma zona: no debe contarse.
    const db = fakeSupabase([{ zona: 'zona sur' }, { zona: ' ZONA SUR ' }])
    const r = await simularReasignacion(db, 'Macul', 'ZONA SUR')
    assert.equal(r.aMover, 0)
  })

  test('sin comuna no hace nada', async () => {
    const r = await simularReasignacion(fakeSupabase([]), '', 'ZONA SUR')
    assert.equal(r.ok, false)
  })

  test('un error de la base no se traga', async () => {
    const db = fakeSupabase([], { errorSelect: 'permiso denegado' })
    const r = await simularReasignacion(db, 'Macul', 'ZONA SUR')
    assert.equal(r.ok, false)
    assert.match(r.error, /permiso/)
  })
})

describe('aplicar el cambio', () => {
  test('mueve los prospectos', async () => {
    const db = fakeSupabase(MACUL)
    const r = await aplicarReasignacion(db, 'Macul', 'ZONA SUR')
    assert.equal(r.ok, true)
    assert.equal(r.movidos, 380)
    assert.deepEqual(db.escrituras.update, { zona: 'ZONA SUR' })
  })

  test('sólo toca la comuna pedida', async () => {
    // Sin el filtro, un update de PostgREST alcanza a toda la tabla.
    const db = fakeSupabase(MACUL)
    await aplicarReasignacion(db, 'Macul', 'ZONA SUR')
    assert.equal(db.escrituras.filtros.update.col, 'comuna')
    assert.equal(db.escrituras.filtros.update.val, 'Macul')
  })

  test('no reescribe los que ya están en la zona destino', async () => {
    const db = fakeSupabase(MACUL)
    await aplicarReasignacion(db, 'Macul', 'ZONA SUR')
    assert.equal(db.escrituras.filtros.neq.col, 'zona')
    assert.equal(db.escrituras.filtros.neq.val, 'ZONA SUR')
  })

  test('deja el mapa de comunas alineado', async () => {
    const db = fakeSupabase(MACUL)
    await aplicarReasignacion(db, 'Macul', 'ZONA SUR')
    assert.deepEqual(db.escrituras.upsert.row, { comuna: 'MACUL', zona: 'ZONA SUR' })
  })

  test('si no hay nada que mover, no escribe prospectos', async () => {
    const db = fakeSupabase([{ zona: 'ZONA SUR' }])
    const r = await aplicarReasignacion(db, 'Macul', 'ZONA SUR')
    assert.equal(r.ok, true)
    assert.equal(r.sinCambios, true)
    assert.equal(db.escrituras.update, null)
  })

  test('si falla el update, el mapa queda como estaba', async () => {
    // Al revés dejaría el mapa diciendo una cosa y las filas otra: el
    // mismo desajuste que originó todo este problema.
    const db = fakeSupabase(MACUL, { errorUpdate: 'sin permiso' })
    const r = await aplicarReasignacion(db, 'Macul', 'ZONA SUR')
    assert.equal(r.ok, false)
    assert.equal(db.escrituras.upsert, null, 'no debe tocar zonas_comunas')
  })

  test('si falla sólo el mapa, avisa pero no miente', async () => {
    const db = fakeSupabase(MACUL, { errorUpsert: 'tabla ausente' })
    const r = await aplicarReasignacion(db, 'Macul', 'ZONA SUR')
    assert.equal(r.ok, true, 'los prospectos SÍ se movieron')
    assert.equal(r.movidos, 380)
    assert.match(r.avisoMapa, /mapa de comunas no se actualizó/)
  })

  test('normaliza la comuna al guardarla en el mapa', async () => {
    const db = fakeSupabase([{ zona: 'ZONA SUR' }, { zona: 'NOR-ORIENTE' }])
    await aplicarReasignacion(db, 'Ñuñoa', 'NOR-PONIENTE')
    assert.equal(db.escrituras.upsert.row.comuna, 'NUNOA')
  })
})

describe('el texto que ve el administrador', () => {
  test('dice cuántos y de dónde', () => {
    const sim = { ok: true, total: 387, aMover: 380, porZona: { 'NOR-ORIENTE': 300, 'NOR-PONIENTE': 80 } }
    const t = textoConfirmacion('Macul', 'ZONA SUR', sim)
    assert.match(t, /380 prospectos/)
    assert.match(t, /300 de NOR-ORIENTE/)
    assert.match(t, /dejan de verse en la zona anterior/i)
  })

  test('avisa cuando no hay nada que hacer', () => {
    const sim = { ok: true, total: 7, aMover: 0, porZona: { 'ZONA SUR': 7 } }
    assert.match(textoConfirmacion('Macul', 'ZONA SUR', sim), /ya están en ZONA SUR/)
  })

  test('avisa cuando la comuna está vacía', () => {
    const sim = { ok: true, total: 0, aMover: 0, porZona: {} }
    assert.match(textoConfirmacion('Alhué', 'ZONA SUR', sim), /No hay prospectos/)
  })
})

/* ═══════════════════════════════════════════════════════════════
   TRASPASO ENTRE EJECUTIVOS

   Cuando alguien renuncia o entra un vendedor nuevo hay que pasarle la
   cartera completa. El riesgo propio de este caso: los clientes viven
   en DOS tablas —`cartera` y `prospectos`— y las dos tienen
   `ejecutivo_id`. Mover una sola deja al vendedor con media cartera y
   sin ningún error a la vista.
   ═══════════════════════════════════════════════════════════════ */

/** Doble con dos tablas independientes y sus escrituras registradas. */
function fakeDosTablas(porTabla, fallos = {}) {
  const escrituras = []
  return {
    escrituras,
    from(tabla) {
      return {
        select() {
          return {
            eq(col, val) {
              if (fallos[`select:${tabla}`]) {
                return Promise.resolve({ data: null, error: { message: fallos[`select:${tabla}`] } })
              }
              const n = porTabla[tabla] ?? 0
              return Promise.resolve({
                data: Array.from({ length: n }, (_, i) => ({ cliente_key: `${tabla}-${i}` })),
                error: null,
                _filtro: { col, val },
              })
            },
          }
        },
        update(patch) {
          return {
            eq(col, val) {
              if (fallos[`update:${tabla}`]) {
                return Promise.resolve({ error: { message: fallos[`update:${tabla}`] } })
              }
              escrituras.push({ tabla, patch, filtro: { col, val } })
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }
}

describe('simular el traspaso', () => {
  test('cuenta las dos tablas por separado', async () => {
    const db = fakeDosTablas({ cartera: 263, prospectos: 1200 })
    const r = await simularTraspaso(db, 'u1', 'u2')
    assert.equal(r.ok, true)
    assert.equal(r.cartera, 263)
    assert.equal(r.prospectos, 1200)
    assert.equal(r.total, 1463)
  })

  test('no escribe nada', async () => {
    const db = fakeDosTablas({ cartera: 10, prospectos: 5 })
    await simularTraspaso(db, 'u1', 'u2')
    assert.deepEqual(db.escrituras, [])
  })

  test('rechaza traspasar a uno mismo', async () => {
    const r = await simularTraspaso(fakeDosTablas({}), 'u1', 'u1')
    assert.equal(r.ok, false)
    assert.match(r.error, /mismo ejecutivo/)
  })

  test('rechaza si falta un ejecutivo', async () => {
    assert.equal((await simularTraspaso(fakeDosTablas({}), '', 'u2')).ok, false)
    assert.equal((await simularTraspaso(fakeDosTablas({}), 'u1', '')).ok, false)
  })

  test('un error de la base no se traga', async () => {
    const db = fakeDosTablas({ cartera: 5 }, { 'select:prospectos': 'sin permiso' })
    const r = await simularTraspaso(db, 'u1', 'u2')
    assert.equal(r.ok, false)
    assert.match(r.error, /permiso/)
  })
})

describe('aplicar el traspaso', () => {
  test('escribe en las DOS tablas', async () => {
    const db = fakeDosTablas({ cartera: 263, prospectos: 1200 })
    const r = await aplicarTraspaso(db, 'u1', 'u2')
    assert.equal(r.ok, true)
    assert.equal(r.movidos, 1463)
    assert.deepEqual(db.escrituras.map(e => e.tabla).sort(), ['cartera', 'prospectos'])
  })

  test('reasigna al ejecutivo nuevo filtrando por el viejo', async () => {
    const db = fakeDosTablas({ cartera: 3, prospectos: 0 })
    await aplicarTraspaso(db, 'u1', 'u2')
    const e = db.escrituras[0]
    assert.deepEqual(e.patch, { ejecutivo_id: 'u2' })
    assert.deepEqual(e.filtro, { col: 'ejecutivo_id', val: 'u1' })
  })

  test('no toca una tabla donde el ejecutivo no tiene nada', async () => {
    const db = fakeDosTablas({ cartera: 0, prospectos: 40 })
    await aplicarTraspaso(db, 'u1', 'u2')
    assert.deepEqual(db.escrituras.map(e => e.tabla), ['prospectos'])
  })

  test('sin clientes no escribe', async () => {
    const db = fakeDosTablas({ cartera: 0, prospectos: 0 })
    const r = await aplicarTraspaso(db, 'u1', 'u2')
    assert.equal(r.sinCambios, true)
    assert.deepEqual(db.escrituras, [])
  })

  test('si falla la segunda tabla, dice qué alcanzó a moverse', async () => {
    // No hay transacción posible desde el cliente: en vez de fingir que
    // fue todo o nada, se informa el estado real.
    const db = fakeDosTablas({ cartera: 263, prospectos: 1200 }, { 'update:prospectos': 'timeout' })
    const r = await aplicarTraspaso(db, 'u1', 'u2')
    assert.equal(r.ok, false)
    assert.equal(r.movidos, 263, 'la cartera sí se movió')
    assert.match(r.error, /prospectos/)
  })
})

describe('el texto del traspaso', () => {
  test('detalla las dos tablas', () => {
    const t = textoTraspaso('Sebastián', 'Pedro', { ok: true, cartera: 263, prospectos: 1200, total: 1463 })
    assert.match(t, /263 de cartera/)
    assert.match(t, /1200 prospectos/)
    assert.match(t, /Sebastián deja de verlos/)
  })

  test('omite la tabla vacía', () => {
    const t = textoTraspaso('Ana', 'Luis', { ok: true, cartera: 0, prospectos: 12, total: 12 })
    assert.doesNotMatch(t, /0 de cartera/)
    assert.match(t, /12 prospectos/)
  })

  test('avisa cuando no hay nada', () => {
    const t = textoTraspaso('Ana', 'Luis', { ok: true, cartera: 0, prospectos: 0, total: 0 })
    assert.match(t, /no tiene clientes asignados/)
  })
})