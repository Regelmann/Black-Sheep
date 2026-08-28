/**
 * LOS 1.886 PROSPECTOS QUE LA APP NUNCA VE
 *
 * El diagnóstico contra la base real dio:
 *
 *     total 9886 · con_coords 9886 · sin_zona 0 · sin_comuna 0
 *     repetidos 0 · invisibles 1886
 *
 * Los datos están impecables. El problema es el techo del código:
 * Ruta.jsx corta con .limit(8000) y hay 9.886 con coordenadas, así que
 * 1.886 quedan afuera SIEMPRE.
 *
 * Lo grave no era el corte —un tope es razonable— sino que ninguna de
 * las tres consultas tenía ORDER BY. Sin orden explícito PostgREST
 * devuelve las filas como se le antoja al planner: cuáles 1.886 se
 * pierden podía cambiar entre dos cargas de la misma pantalla. Un
 * prospecto aparecía hoy y mañana no, sin que nadie tocara nada, y el
 * vendedor no tenía forma de saberlo.
 *
 * Con ORDER BY score lo que se pierde son los de menor puntaje: sigue
 * habiendo un corte, pero es predecible y se lleva lo que menos vale.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const fuente = fs.readFileSync(
  path.join(import.meta.dirname, 'Ruta.jsx'), 'utf8',
)

/** Cada cadena de consulta a `prospectos`, desde .from hasta el .limit. */
function consultasDeProspectos() {
  const out = []
  const re = /\.from\('prospectos'\)([\s\S]*?)\.limit\((\d+)\)/g
  let m
  while ((m = re.exec(fuente))) out.push({ cuerpo: m[1], limite: Number(m[2]) })
  return out
}

describe('el corte de prospectos no puede ser arbitrario', () => {
  test('hay tres consultas con tope', () => {
    // Si aparece una cuarta sin orden, este test la caza.
    assert.equal(consultasDeProspectos().length, 3)
  })

  for (const [i, q] of consultasDeProspectos().entries()) {
    test(`consulta ${i + 1} (limit ${q.limite}) ordena antes de cortar`, () => {
      assert.match(q.cuerpo, /\.order\(/,
        `sin ORDER BY, cuáles filas quedan fuera del limit(${q.limite}) lo ` +
        'decide el planner y puede cambiar entre dos cargas')
    })

    test(`consulta ${i + 1} ordena por score, no por cualquier cosa`, () => {
      // Ordenar por nombre o por id haría el corte estable pero absurdo:
      // se perderían prospectos buenos por empezar con Z.
      assert.match(q.cuerpo, /\.order\('score'/,
        'el criterio tiene que ser el valor del prospecto')
    })

    test(`consulta ${i + 1} pone los mejores primero`, () => {
      assert.match(q.cuerpo, /ascending:\s*false/,
        'ascending true dejaría afuera justo a los mejores')
    })

    test(`consulta ${i + 1} manda los sin score al final`, () => {
      // En Postgres los NULL van primero en DESC por defecto: sin
      // nullsFirst:false, los prospectos sin puntaje coparían el cupo y
      // desplazarían a los buenos.
      assert.match(q.cuerpo, /nullsFirst:\s*false/,
        'los NULL irían primero y se comerían el limit')
    })
  }
})

describe('el techo sigue existiendo y hay que saberlo', () => {
  test('el tope más alto es 8000', () => {
    const max = Math.max(...consultasDeProspectos().map(q => q.limite))
    assert.equal(max, 8000,
      'si alguien cambia el tope, que sea a conciencia: con 9.886 en la ' +
      'base, 8.000 deja 1.886 afuera')
  })

  test('está documentado por qué', () => {
    assert.match(fuente, /9\.?886|1\.?886/,
      'el comentario tiene que decir cuántos se pierden, si no el próximo ' +
      'que lea el código va a pensar que 8000 alcanza para todos')
  })
})