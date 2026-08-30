/**
 * IDEMPOTENCIA DE LA COLA OFFLINE — el reintento no puede duplicar datos
 *
 * EL ESCENARIO QUE ESTO CUBRE
 * El vendedor guarda un pedido sin señal. La app lo encola. Al volver la
 * red, el insert SÍ llega a Postgres pero la respuesta se pierde en el
 * camino (túnel, ascensor, cambio de antena). Desde la app eso es
 * indistinguible de un fallo: marca el item como fallido y lo reintenta.
 * Sin protección, el segundo intento inserta una fila más.
 *
 * Un pedido duplicado es un despacho duplicado. Es plata, y no se ve en
 * la demo: pasa en terreno con mala señal, que es donde vive esta app.
 *
 * LAS TRES PIEZAS DE LA DEFENSA
 *   1. enqueueAction() genera un client_op_id (UUID) estable por acción,
 *      que sobrevive a los reintentos.            → ya existía
 *   2. sql/27_IDEMPOTENCIA.sql crea índices únicos parciales sobre esa
 *      columna en checkins, pedidos y notas.      → ya existía
 *   3. Los handlers mandan ese id y tratan 23505 (unique_violation) como
 *      ÉXITO, porque el dato YA está en la base.  → SOLO handleCheckin
 *
 * Faltaba el eslabón 3 en handleNota, handlePedido y handleNoVenta: la
 * columna viajaba en NULL, el índice único nunca se disparaba y el
 * reintento duplicaba. Estos tests ejercitan los handlers REALES contra
 * un doble de Supabase que cuenta filas, no un handler de mentira.
 *
 * NOTA SOBRE LA MIGRACIÓN: si sql/27 no está aplicada, la columna
 * client_op_id no existe y Postgres responde PGRST204/42703. Los
 * handlers deben degradar (reintentar sin la columna) en vez de romper
 * el envío. Eso también se prueba acá.
 */
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerSupabaseForTests } from './supabase.js'
import {
  handleNota, handlePedido, handleNoVenta, handleCheckin,
} from './syncHandlers.js'

/* ── doble de Supabase ────────────────────────────────────────────────
   Simula una tabla con índice único parcial sobre client_op_id: si llega
   dos veces el mismo id no nulo, responde 23505 como lo haría Postgres. */
function crearBase({ sinColumnaOpId = false, fallaRed = false } = {}) {
  const filas = { checkins: [], pedidos: [], notas_cliente: [], visitas: [] }
  const vistos = new Set()

  const client = {
    from(tabla) {
      return {
        insert(row) {
          const r = Array.isArray(row) ? row[0] : row
          const ejecutar = () => {
            if (fallaRed) {
              return { data: null, error: { code: '08006', message: 'network error' } }
            }
            // La migración no corrió: la columna no existe en el esquema.
            if (sinColumnaOpId && r && r.client_op_id !== undefined) {
              return {
                data: null,
                error: {
                  code: 'PGRST204',
                  message: "Could not find the 'client_op_id' column of '" + tabla + "' in the schema cache",
                },
              }
            }
            const id = r && r.client_op_id
            if (id) {
              const clave = tabla + ':' + id
              if (vistos.has(clave)) {
                return {
                  data: null,
                  error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                }
              }
              vistos.add(clave)
            }
            filas[tabla].push(r)
            return { data: [{ id: 'row-' + filas[tabla].length }], error: null }
          }
          const res = ejecutar()
          // .insert() se puede await directo o encadenar .select()
          return Object.assign(Promise.resolve(res), {
            select: () => Promise.resolve(res),
          })
        },
        update() {
          return { eq: () => Promise.resolve({ data: null, error: null }) }
        },
      }
    },
  }
  return { client, filas }
}

/** Un item de cola como el que arma enqueueAction(). */
const itemCola = (type, payload, opId = 'op-fijo-123') => ({
  id: opId, client_op_id: opId, type, payload, attempts: 0,
})

let base
beforeEach(() => {
  base = crearBase()
  registerSupabaseForTests(base.client)
})

describe('el reintento no duplica (respuesta perdida en la red)', () => {
  // Cada caso corre el MISMO item dos veces, que es exactamente lo que
  // hace flushActionQueue cuando la primera respuesta no llegó.
  const casos = [
    {
      nombre: 'nota',
      tabla: 'notas_cliente',
      correr: () => handleNota(itemCola('nota', { cliente_key: 'c1', texto: 'ojo con el stock' })),
    },
    {
      nombre: 'pedido',
      tabla: 'pedidos',
      correr: () => handlePedido(itemCola('pedido', {
        ejecutivoId: 'e1', clienteKey: 'c1', nombreCliente: 'Almacén Luz',
        lineas: [{ sku: 'POLLO', cantidad: 2, precio: 1000 }],
      })),
    },
    {
      nombre: 'no_venta',
      tabla: 'notas_cliente',
      correr: () => handleNoVenta(itemCola('no_venta', {
        visita_id: 'v1', cliente_key: 'c1', nota: 'cerrado',
      })),
    },
    {
      nombre: 'checkin',
      tabla: 'checkins',
      correr: () => handleCheckin(itemCola('checkin', { visita_id: 'v1', cliente_key: 'c1' })),
    },
  ]

  for (const c of casos) {
    test(`${c.nombre}: dos intentos dejan UNA fila`, async () => {
      const primero = await c.correr()
      assert.equal(primero.ok, true, 'el primer intento debe subir')

      const segundo = await c.correr()
      assert.equal(segundo.ok, true,
        'el duplicado es ÉXITO: el dato ya está en la base. Devolver ' +
        'ok:false deja el item reintentando hasta agotarse y el banner ' +
        'de "pendiente" no se va nunca.')

      assert.equal(base.filas[c.tabla].length, 1,
        `se insertaron ${base.filas[c.tabla].length} filas en ${c.tabla}: ` +
        'el reintento duplicó el dato. Falta mandar client_op_id.')
    })

    test(`${c.nombre}: manda client_op_id`, async () => {
      await c.correr()
      const fila = base.filas[c.tabla][0]
      assert.ok(fila.client_op_id,
        `la fila insertada en ${c.tabla} no lleva client_op_id: el índice ` +
        'único de sql/27_IDEMPOTENCIA.sql nunca se dispara.')
    })
  }
})

describe('degrada si la migración sql/27 no está aplicada', () => {
  // Sin la columna, insertar client_op_id rompe el envío. Vale más
  // guardar el dato sin protección que perderlo.
  const casos = [
    ['nota', 'notas_cliente', () => handleNota(itemCola('nota', { cliente_key: 'c1', texto: 'x' }))],
    ['pedido', 'pedidos', () => handlePedido(itemCola('pedido', {
      ejecutivoId: 'e1', lineas: [{ sku: 'A', cantidad: 1, precio: 10 }],
    }))],
    ['no_venta', 'notas_cliente', () => handleNoVenta(itemCola('no_venta', { cliente_key: 'c1', nota: 'x' }))],
  ]

  for (const [nombre, tabla, correr] of casos) {
    test(`${nombre}: sin la columna, igual guarda`, async () => {
      base = crearBase({ sinColumnaOpId: true })
      registerSupabaseForTests(base.client)
      const r = await correr()
      assert.equal(r.ok, true,
        'con la migración pendiente el envío debe degradar, no fallar')
      assert.equal(base.filas[tabla].length, 1, 'el dato tiene que quedar guardado')
    })
  }
})

describe('un fallo de red no inventa filas', () => {
  test('pedido: error de red devuelve ok:false y no inserta', async () => {
    base = crearBase({ fallaRed: true })
    registerSupabaseForTests(base.client)
    const r = await handlePedido(itemCola('pedido', {
      ejecutivoId: 'e1', lineas: [{ sku: 'A', cantidad: 1, precio: 10 }],
    }))
    assert.equal(r.ok, false, 'ante red caída el item debe volver a la cola')
    assert.equal(base.filas.pedidos.length, 0)
  })

  test('pedido: ante un error NO de esquema no reintenta mutilando la fila', async () => {
    // handleCheckin ya documenta esta regla: "Ante RLS/red hay que
    // reintentar completo más tarde, no mutilar la fila". handlePedido
    // reintentaba con una fila mínima ante CUALQUIER error, así que un
    // fallo de red producía un segundo insert inmediato.
    let intentos = 0
    registerSupabaseForTests({
      from: () => ({
        insert: () => {
          intentos++
          const res = { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }
          return Object.assign(Promise.resolve(res), { select: () => Promise.resolve(res) })
        },
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }),
    })
    const r = await handlePedido(itemCola('pedido', {
      ejecutivoId: 'e1', lineas: [{ sku: 'A', cantidad: 1, precio: 10 }],
    }))
    assert.equal(r.ok, false)
    assert.equal(intentos, 1,
      `hubo ${intentos} inserts: ante un error de permisos hay que ` +
      'reintentar completo más tarde, no insertar una fila recortada.')
  })
})