/**
 * Doble chequeo — validar antes, confirmar después.
 *
 * Cubre las dos pérdidas silenciosas que ya nos pasaron:
 *   · El outbox borraba items ante {ok:false} (objeto truthy).
 *   · Admin caía al INSERT cuando el SELECT previo fallaba → duplicado.
 *
 * En los dos casos el servidor "no dio error" y el dato quedó mal.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  validar, validarPedido, escribirYConfirmar, upsertSeguro,
  ESQUEMA_CHECKIN, ESQUEMA_NOTA,
} from './validate.js'

describe('validar · antes de escribir', () => {
  test('campo requerido ausente', () => {
    const v = validar({}, ESQUEMA_CHECKIN)
    assert.equal(v.valido, false)
    assert.ok(v.errores.some((e) => e.includes('visita_id')))
  })

  test('payload correcto pasa', () => {
    const v = validar(
      { visita_id: 'V1', hora_llegada: '2026-08-25T10:00:00Z', lat_real: -33.4, lng_real: -70.6 },
      ESQUEMA_CHECKIN
    )
    assert.equal(v.valido, true)
    assert.equal(v.valor.lat_real, -33.4)
  })

  test('coordenadas fuera de rango se rechazan', () => {
    // Un GPS mal leído mandaba lat 999 y quedaba guardado.
    const v = validar(
      { visita_id: 'V1', hora_llegada: 'x', lat_real: 999 },
      ESQUEMA_CHECKIN
    )
    assert.equal(v.valido, false)
  })

  test('string vacío cuenta como ausente', () => {
    assert.equal(validar({ visita_id: '   ', hora_llegada: 'x' }, ESQUEMA_CHECKIN).valido, false)
  })

  test('aplica el valor por defecto', () => {
    const v = validar({ cliente_key: 'C1', texto: 'hola' }, ESQUEMA_NOTA)
    assert.equal(v.valido, true)
    assert.equal(v.valor.tipo, 'otro')
  })

  test('texto que excede el máximo se rechaza', () => {
    const v = validar({ cliente_key: 'C1', texto: 'x'.repeat(2001) }, ESQUEMA_NOTA)
    assert.equal(v.valido, false)
  })
})

describe('validarPedido · líneas', () => {
  const base = { cliente_key: 'C1', lineas: [] }

  test('pedido sin líneas se rechaza', () => {
    assert.equal(validarPedido(base).valido, false)
  })

  test('cantidad 0 se rechaza — no es un pedido', () => {
    const v = validarPedido({ ...base, lineas: [{ sku_canon: 'A', cantidad: 0 }] })
    assert.equal(v.valido, false)
  })

  test('cantidad negativa se rechaza', () => {
    const v = validarPedido({ ...base, lineas: [{ sku_canon: 'A', cantidad: -5 }] })
    assert.equal(v.valido, false)
  })

  test('el error dice QUÉ línea falló', () => {
    const v = validarPedido({
      ...base,
      lineas: [{ sku_canon: 'A', cantidad: 2 }, { sku_canon: 'B', cantidad: 0 }],
    })
    assert.equal(v.valido, false)
    assert.ok(v.errores.some((e) => e.includes('línea 2')))
  })

  test('pedido válido normaliza los números', () => {
    const v = validarPedido({ ...base, lineas: [{ sku_canon: 'A', cantidad: '2,5' }] })
    assert.equal(v.valido, true)
    assert.equal(v.valor.lineas[0].cantidad, 2.5)
    assert.equal(v.valor.lineas[0].precio, 0, 'precio ausente → default 0')
  })
})

describe('escribirYConfirmar · el paso que falta en todos lados', () => {
  test('escritura OK y fila confirmada', async () => {
    const r = await escribirYConfirmar({
      escribir: async () => ({ data: { id: 1 } }),
      confirmar: async () => ({ data: [{ id: 1 }] }),
    })
    assert.equal(r.ok, true)
    assert.equal(r.confirmado, true)
  })

  test('🔴 "escribió sin error" pero la fila NO existe → FALLO', async () => {
    // El caso que causó la pérdida de check-ins.
    const r = await escribirYConfirmar({
      escribir: async () => ({ data: { id: 1 } }),
      confirmar: async () => ({ data: [] }),
    })
    assert.equal(r.ok, false, 'sin fila no hay éxito')
    assert.match(r.error, /No quedó guardado/)
  })

  test('no se pudo confirmar → tampoco es éxito', async () => {
    const r = await escribirYConfirmar({
      escribir: async () => ({ data: { id: 1 } }),
      confirmar: async () => { throw new Error('red caída') },
    })
    assert.equal(r.ok, false)
    assert.equal(r.confirmado, false)
    assert.match(r.error, /no pudimos confirmar/)
  })

  test('la fila existe pero con datos distintos → fallo', async () => {
    const r = await escribirYConfirmar({
      escribir: async () => ({ data: { id: 1 } }),
      confirmar: async () => ({ data: [{ id: 1, cantidad: 99 }] }),
      esperado: (f) => f.cantidad === 5,
    })
    assert.equal(r.ok, false)
    assert.match(r.error, /datos distintos/)
  })

  test('sin verificador se declara NO confirmado', async () => {
    const r = await escribirYConfirmar({ escribir: async () => ({ data: { id: 1 } }) })
    assert.equal(r.ok, true)
    assert.equal(r.confirmado, false, 'honesto: salió pero no se verificó')
  })

  test('error de escritura se reporta', async () => {
    const r = await escribirYConfirmar({
      escribir: async () => ({ error: { message: 'RLS' } }),
      confirmar: async () => ({ data: [{ id: 1 }] }),
    })
    assert.equal(r.ok, false)
    assert.match(r.error, /RLS/)
  })
})

describe('upsertSeguro · nunca adivina', () => {
  test('existe → actualiza', async () => {
    let accion = null
    const r = await upsertSeguro({
      buscar: async () => ({ data: [{ id: 7 }] }),
      insertar: async () => { accion = 'insert'; return { data: {} } },
      actualizar: async () => { accion = 'update'; return { data: {} } },
      confirmar: async () => ({ data: [{ id: 7 }] }),
    })
    assert.equal(accion, 'update')
    assert.equal(r.ok, true)
  })

  test('no existe → inserta', async () => {
    let accion = null
    await upsertSeguro({
      buscar: async () => ({ data: [] }),
      insertar: async () => { accion = 'insert'; return { data: {} } },
      actualizar: async () => { accion = 'update'; return { data: {} } },
      confirmar: async () => ({ data: [{ id: 9 }] }),
    })
    assert.equal(accion, 'insert')
  })

  test('🔴 si la búsqueda falla ABORTA — no inserta a ciegas', async () => {
    // El bug de Admin: SELECT fallaba → existing undefined → INSERT
    // → meta DUPLICADA en vez de actualizada.
    let accion = null
    const r = await upsertSeguro({
      buscar: async () => ({ error: { message: 'timeout' } }),
      insertar: async () => { accion = 'insert'; return { data: {} } },
      actualizar: async () => { accion = 'update'; return { data: {} } },
      confirmar: async () => ({ data: [{ id: 1 }] }),
    })
    assert.equal(accion, null, 'NO debe escribir nada')
    assert.equal(r.ok, false)
    assert.match(r.error, /abortó para no duplicar/)
  })
})

/* ============================================================
   ORDEN DEL CATÁLOGO
   La regla vive en SQL, pero se fija acá para que quede
   documentada y para poder verificar la respuesta del RPC.
   ============================================================ */

/** Réplica del criterio de la función SQL. */
function ordenar(items) {
  return [...items].sort((a, b) =>
    a.grupo - b.grupo ||
    (a.grupo === 1
      ? String(b.ultima_compra || '').localeCompare(String(a.ultima_compra || ''))
      : 0) ||
    (a.grupo === 2 ? (b.prioridad || 0) - (a.prioridad || 0) : 0) ||
    String(a.rubro || '').localeCompare(String(b.rubro || ''), 'es') ||
    String(a.producto_nombre || '').localeCompare(String(b.producto_nombre || ''), 'es')
  )
}

describe('catálogo · orden comercial', () => {
  const items = [
    { producto_nombre: 'ZANAHORIA', rubro: 'VERDURA', grupo: 3 },
    { producto_nombre: 'ACEITE',    rubro: 'ABARROTE', grupo: 2, prioridad: 1 },
    { producto_nombre: 'PECHUGA',   rubro: 'POLLO',   grupo: 1, ultima_compra: '2026-08-20' },
    { producto_nombre: 'ALITAS',    rubro: 'POLLO',   grupo: 2, prioridad: 5 },
    { producto_nombre: 'ENTRAÑA',   rubro: 'CARNE',   grupo: 1, ultima_compra: '2026-08-24' },
  ]

  test('lo que ya compra va primero', () => {
    const r = ordenar(items)
    assert.equal(r[0].grupo, 1)
    assert.equal(r[1].grupo, 1)
  })

  test('dentro de "lo que compra", lo más reciente arriba', () => {
    const r = ordenar(items)
    assert.equal(r[0].producto_nombre, 'ENTRAÑA', 'compró el 24, va antes que el 20')
  })

  test('después vienen las sugerencias del rubro', () => {
    const r = ordenar(items)
    assert.equal(r[2].grupo, 2)
    assert.equal(r[3].grupo, 2)
  })

  test('el resto del catálogo va último', () => {
    const r = ordenar(items)
    assert.equal(r[r.length - 1].grupo, 3)
  })

  test('los grupos nunca se intercalan', () => {
    const r = ordenar(items)
    let prev = 0
    for (const it of r) {
      assert.ok(it.grupo >= prev, `grupo ${it.grupo} después de ${prev}`)
      prev = it.grupo
    }
  })

  test('dentro del mismo grupo: por rubro y luego alfabético', () => {
    const mismos = [
      { producto_nombre: 'PAPAS',   rubro: 'VERDURA',  grupo: 3 },
      { producto_nombre: 'ARROZ',   rubro: 'ABARROTE', grupo: 3 },
      { producto_nombre: 'ACEITE',  rubro: 'ABARROTE', grupo: 3 },
      { producto_nombre: 'CEBOLLA', rubro: 'VERDURA',  grupo: 3 },
    ]
    const r = ordenar(mismos)
    assert.deepEqual(r.map((x) => x.producto_nombre),
      ['ACEITE', 'ARROZ', 'CEBOLLA', 'PAPAS'],
      'ABARROTE completo y alfabético, después VERDURA')
  })

  test('el alfabético respeta acentos y Ñ del español', () => {
    const r = ordenar([
      { producto_nombre: 'ÑOQUIS', rubro: 'A', grupo: 1 },
      { producto_nombre: 'NUEZ',   rubro: 'A', grupo: 1 },
      { producto_nombre: 'ÁCIDO',  rubro: 'A', grupo: 1 },
    ])
    assert.deepEqual(r.map((x) => x.producto_nombre), ['ÁCIDO', 'NUEZ', 'ÑOQUIS'])
  })

  test('sin historial todo cae a grupo 3 y sale alfabético', () => {
    // Cliente nuevo: el catálogo no se rompe, sólo pierde personalización.
    const nuevos = [
      { producto_nombre: 'B', rubro: 'X', grupo: 3 },
      { producto_nombre: 'A', rubro: 'X', grupo: 3 },
    ]
    assert.deepEqual(ordenar(nuevos).map((x) => x.producto_nombre), ['A', 'B'])
  })
})
