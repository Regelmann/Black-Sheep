/**
 * EL HUECO ENTRE LOS DOS FILTROS
 *
 * Un prospecto se trae de la base con
 *
 *     .eq('zona', zonaActiva)          ← el campo `zona` de la fila
 *
 * y después se decide si se muestra con prospectoVisible(), que da
 * prioridad a la COMUNA sobre ese mismo campo.
 *
 * Los dos criterios normalmente coinciden. Cuando no, el prospecto
 * desaparece para todo el mundo:
 *
 *   fila: zona='NOR-ORIENTE', comuna='MAIPU'
 *   zonas_comunas: MAIPU → ZONA SUR
 *
 *   · el vendedor de NOR-ORIENTE  → la consulta SÍ lo trae (zona
 *     coincide), pero prospectoVisible lo descarta: su comuna es de
 *     otra zona;
 *   · el vendedor de ZONA SUR     → prospectoVisible lo aceptaría,
 *     pero la consulta nunca lo trae: filtra por zona='ZONA SUR' y la
 *     fila dice NOR-ORIENTE.
 *
 * Nadie lo ve, y no hay ningún error en pantalla: simplemente falta.
 *
 * Estos tests fijan que la regla de precedencia siga siendo la que
 * creemos, y documentan el agujero para que sql/32 lo mida contra la
 * base real.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { prospectoVisible } from './zonas.js'

/* Índice comuna→zona como el que devuelve cargarIndiceZonas(). */
const INDICE = {
  'MAIPU': 'ZONA SUR',
  'LAS CONDES': 'NOR-ORIENTE',
  'NUNOA': 'NOR-PONIENTE',
}

describe('cuando comuna y zona se contradicen', () => {
  const contradictorio = {
    cliente_key: 'P1',
    zona: 'NOR-ORIENTE',   // lo que dice la fila
    comuna: 'MAIPU',       // ...pero Maipú es Zona Sur
  }

  test('el vendedor de la zona que dice la FILA no lo ve', () => {
    const r = prospectoVisible(contradictorio, 'NOR-ORIENTE', null, INDICE)
    assert.equal(r.visible, false,
      'la comuna manda sobre el campo zona: Maipú no es Nor-Oriente')
    assert.equal(r.motivo, 'otra_zona')
  })

  test('y el de la zona que dice la COMUNA tampoco, porque no se lo traen', () => {
    // prospectoVisible sí lo aceptaría...
    const r = prospectoVisible(contradictorio, 'ZONA SUR', null, INDICE)
    assert.equal(r.visible, true)
    // ...pero la consulta hace .eq('zona','ZONA SUR') y esta fila dice
    // NOR-ORIENTE, así que nunca llega hasta acá. El hueco está en la
    // combinación de los dos filtros, no en ninguno por separado.
    assert.notEqual(contradictorio.zona, 'ZONA SUR',
      'si algún día la consulta filtrara por comuna, este hueco se cierra')
  })

  test('la asignación explícita lo rescata', () => {
    // Es la única salida hoy: si el prospecto tiene ejecutivo_id, se
    // muestra pase lo que pase con la geografía.
    const r = prospectoVisible(
      { ...contradictorio, ejecutivo_id: 'u1' }, 'NOR-ORIENTE', 'u1', INDICE,
    )
    assert.equal(r.visible, true)
    assert.equal(r.motivo, 'asignado')
  })
})

describe('cuando coinciden, todo funciona', () => {
  test('comuna y zona de acuerdo → visible', () => {
    const p = { zona: 'ZONA SUR', comuna: 'MAIPU' }
    assert.equal(prospectoVisible(p, 'ZONA SUR', null, INDICE).visible, true)
  })

  test('comuna de otra zona → no visible', () => {
    const p = { zona: 'ZONA SUR', comuna: 'LAS CONDES' }
    assert.equal(prospectoVisible(p, 'ZONA SUR', null, INDICE).visible, false)
  })
})

describe('comuna desconocida: se muestra marcado, no se pierde', () => {
  test('una comuna que no está en el índice usa la zona de la fila', () => {
    const p = { zona: 'NOR-ORIENTE', comuna: 'PICHILEMU' }
    const r = prospectoVisible(p, 'NOR-ORIENTE', null, INDICE)
    assert.equal(r.visible, true)
    assert.equal(r.motivo, 'sin_mapear',
      'tiene que quedar marcado para que se vea que falta mapear la comuna')
  })

  test('sin comuna ni zona no desaparece', () => {
    const r = prospectoVisible({ cliente_key: 'X' }, 'ZONA SUR', null, INDICE)
    assert.equal(r.visible, true)
    assert.equal(r.motivo, 'sin_datos')
  })
})