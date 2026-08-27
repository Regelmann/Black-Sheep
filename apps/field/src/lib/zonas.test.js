/**
 * Zonas y visibilidad de prospectos.
 *
 * Dos fallos que motivaron estos tests:
 *
 * 1. El mapa cubría 33 de las 52 comunas de la RM. Como el filtro de
 *    Ruta hacía que la comuna mandara sobre todo, un prospecto en
 *    Pudahuel o Cerrillos desaparecía del mapa aunque tuviera zona y
 *    ejecutivo asignados en la base.
 * 2. Admin editaba la tabla `zonas_comunas` en Supabase, pero Ruta usaba
 *    una copia hardcodeada: reasignar una comuna no tenía efecto.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  ZONAS_COMUNAS,
  normComuna,
  zonaFromComuna,
  prospectoVisible,
  indiceDesdeFilas,
  cargarIndiceZonas,
} from './zonas.js'

/** Las 52 comunas de la Región Metropolitana. */
const COMUNAS_RM = [
  'CERRILLOS', 'CERRO NAVIA', 'CONCHALI', 'EL BOSQUE', 'ESTACION CENTRAL',
  'HUECHURABA', 'INDEPENDENCIA', 'LA CISTERNA', 'LA FLORIDA', 'LA GRANJA',
  'LA PINTANA', 'LA REINA', 'LAS CONDES', 'LO BARNECHEA', 'LO ESPEJO',
  'LO PRADO', 'MACUL', 'MAIPU', 'NUNOA', 'PEDRO AGUIRRE CERDA', 'PENALOLEN',
  'PROVIDENCIA', 'PUDAHUEL', 'QUILICURA', 'QUINTA NORMAL', 'RECOLETA',
  'RENCA', 'SAN JOAQUIN', 'SAN MIGUEL', 'SAN RAMON', 'SANTIAGO', 'VITACURA',
  'PUENTE ALTO', 'PIRQUE', 'SAN JOSE DE MAIPO', 'COLINA', 'LAMPA', 'TILTIL',
  'SAN BERNARDO', 'BUIN', 'CALERA DE TANGO', 'PAINE', 'MELIPILLA', 'ALHUE',
  'CURACAVI', 'MARIA PINTO', 'SAN PEDRO', 'TALAGANTE', 'EL MONTE',
  'ISLA DE MAIPO', 'PADRE HURTADO', 'PENAFLOR',
]

describe('cobertura del mapa de comunas', () => {
  test('las 52 comunas de la RM tienen zona', () => {
    const sinZona = COMUNAS_RM.filter(c => !zonaFromComuna(c))
    assert.deepEqual(sinZona, [], `sin zona: ${sinZona.join(', ')}`)
  })

  test('ninguna comuna aparece en dos zonas', () => {
    const visto = {}
    const dup = []
    for (const [zona, comunas] of Object.entries(ZONAS_COMUNAS)) {
      for (const c of comunas) {
        const k = normComuna(c)
        if (visto[k] && visto[k] !== zona) dup.push(`${k}: ${visto[k]} y ${zona}`)
        visto[k] = zona
      }
    }
    assert.deepEqual(dup, [], dup.join(' · '))
  })

  test('normComuna aguanta tildes, mayúsculas y espacios', () => {
    assert.equal(normComuna('  Ñuñoa '), 'NUNOA')
    assert.equal(normComuna('Estación  Central'), 'ESTACION CENTRAL')
    assert.equal(normComuna(null), '')
  })
})

describe('prospectoVisible · la asignación manda sobre la geografía', () => {
  const UID = 'eje-1'

  test('un prospecto asignado se muestra aunque la comuna sea de otra zona', () => {
    const r = prospectoVisible(
      { comuna: 'LAS CONDES', zona: 'NOR-ORIENTE', ejecutivo_id: UID },
      'ZONA SUR',
      UID,
    )
    assert.equal(r.visible, true)
    assert.equal(r.motivo, 'asignado')
  })

  test('las comunas que antes se perdían ahora se ven, cada una en su zona', () => {
    // Las 19 que faltaban desaparecían del mapa aunque tuvieran zona
    // y ejecutivo en la base. Ahora cada una resuelve a su zona real.
    const esperado = {
      CERRILLOS: 'ZONA SUR',
      'LA GRANJA': 'ZONA SUR',
      'LO ESPEJO': 'ZONA SUR',
      BUIN: 'ZONA SUR',
      TALAGANTE: 'ZONA SUR',
      MELIPILLA: 'ZONA SUR',
      PUDAHUEL: 'NOR-PONIENTE',
      'LO PRADO': 'NOR-PONIENTE',
      TILTIL: 'NOR-PONIENTE',
      CURACAVI: 'NOR-PONIENTE',
      'SAN JOSE DE MAIPO': 'NOR-ORIENTE',
    }
    for (const [comuna, zona] of Object.entries(esperado)) {
      const r = prospectoVisible({ comuna, zona }, zona)
      assert.equal(r.visible, true, `${comuna} quedó oculta en ${zona}`)
      assert.equal(r.motivo, 'comuna')
    }
  })

  test('un prospecto de otra zona sigue oculto', () => {
    const r = prospectoVisible({ comuna: 'LAS CONDES', zona: 'NOR-ORIENTE' }, 'ZONA SUR')
    assert.equal(r.visible, false)
    assert.equal(r.motivo, 'otra_zona')
  })

  test('comuna desconocida se muestra marcada, no se pierde', () => {
    const r = prospectoVisible({ comuna: 'COMUNA NUEVA', zona: 'ZONA SUR' }, 'ZONA SUR')
    assert.equal(r.visible, true)
    assert.equal(r.motivo, 'sin_mapear', 'debe avisar que hay que mapearla en Admin')
  })

  test('sin comuna vale la zona de la fila', () => {
    assert.equal(prospectoVisible({ comuna: '', zona: 'ZONA SUR' }, 'ZONA SUR').visible, true)
    assert.equal(prospectoVisible({ comuna: '', zona: 'NOR-ORIENTE' }, 'ZONA SUR').visible, false)
  })

  test('sin comuna ni zona se muestra, no se descarta', () => {
    const r = prospectoVisible({}, 'ZONA SUR')
    assert.equal(r.visible, true)
    assert.equal(r.motivo, 'sin_datos')
  })

  test('entradas nulas no rompen', () => {
    for (const p of [null, undefined, {}, { comuna: null, zona: null }]) {
      assert.doesNotThrow(() => prospectoVisible(p, 'ZONA SUR', null))
    }
    assert.equal(prospectoVisible({ comuna: 'MAIPU' }, '').visible, true, 'sin zona no se filtra')
  })
})

describe('índice vivo desde la tabla zonas_comunas', () => {
  test('lo que Admin edita cambia dónde se ve el prospecto', () => {
    const idx = { PUDAHUEL: 'NOR-PONIENTE' }
    const p = { comuna: 'PUDAHUEL', zona: 'ZONA SUR' }
    assert.equal(prospectoVisible(p, 'ZONA SUR', null, idx).visible, false)
    assert.equal(prospectoVisible(p, 'NOR-PONIENTE', null, idx).visible, true)
  })

  test('indiceDesdeFilas normaliza y descarta filas incompletas', () => {
    const idx = indiceDesdeFilas([
      { comuna: 'Ñuñoa', zona: 'zona sur' },
      { comuna: '', zona: 'ZONA SUR' },
      { comuna: 'MAIPU', zona: null },
    ])
    assert.deepEqual(idx, { NUNOA: 'ZONA SUR' })
  })

  test('sin filas devuelve null para poder caer al respaldo', () => {
    assert.equal(indiceDesdeFilas([]), null)
    assert.equal(indiceDesdeFilas(null), null)
    assert.equal(indiceDesdeFilas([{ comuna: '', zona: '' }]), null)
  })

  const fakeSupabase = (data, error) => ({
    from: () => ({ select: () => ({ limit: async () => ({ data, error }) }) }),
  })

  test('la tabla manda cuando responde', async () => {
    const r = await cargarIndiceZonas(fakeSupabase([{ comuna: 'PUDAHUEL', zona: 'NOR-PONIENTE' }], null))
    assert.equal(r.fuente, 'db')
    assert.equal(r.indice.PUDAHUEL, 'NOR-PONIENTE')
  })

  test('un error de RLS o red cae al respaldo, nunca deja el mapa sin zonas', async () => {
    // supabase-js NO lanza: devuelve { data, error }. Hay que mirar error.
    for (const cli of [fakeSupabase(null, { message: 'RLS' }), fakeSupabase([], null), null]) {
      const r = await cargarIndiceZonas(cli)
      assert.equal(r.fuente, 'codigo')
      assert.ok(Object.keys(r.indice).length > 40, 'el respaldo debe traer las 52 comunas')
    }
  })

  test('si el cliente lanza, igual devuelve el respaldo', async () => {
    const roto = { from: () => { throw new Error('boom') } }
    const r = await cargarIndiceZonas(roto)
    assert.equal(r.fuente, 'codigo')
  })
})
