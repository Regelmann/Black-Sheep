/**
 * seguridad.js · tests
 *
 * Cada test existe porque la versión sin test ya se comportó mal:
 *   · el rol se comparaba sin normalizar ('GERENTE' no era admin)
 *   · el token de la URL llegaba crudo al RPC
 *   · los console.error imprimían el JWT de la sesión
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  esAdmin,
  puedeVerZona,
  puedeOperarSobre,
  esTokenCatalogo,
  tokenCatalogoSeguro,
  sesionExpirada,
  escaparHtml,
  textoSeguro,
  redactar,
} from './seguridad.js'

describe('esAdmin · el rol decide', () => {
  test('admin / gerente / superadmin lo son', () => {
    for (const rol of ['admin', 'gerente', 'superadmin']) {
      assert.equal(esAdmin({ rol }), true, rol)
    }
  })

  test('mayúsculas y espacios del ETL no cambian el resultado', () => {
    // `ejecutivos.rol` llegó como 'GERENTE' de una carga. Comparado sin
    // normalizar, un gerente quedaba como ejecutivo y perdía su panel.
    assert.equal(esAdmin({ rol: 'GERENTE' }), true)
    assert.equal(esAdmin({ rol: ' Admin ' }), true)
    assert.equal(esAdmin({ rol: 'SuperAdmin' }), true)
  })

  test('ejecutivo, rol vacío y null NO son admin', () => {
    assert.equal(esAdmin({ rol: 'ejecutivo' }), false)
    assert.equal(esAdmin({ rol: '' }), false)
    assert.equal(esAdmin({}), false)
    assert.equal(esAdmin(null), false)
    assert.equal(esAdmin(undefined), false)
  })

  test('esSuperAdmin explícito manda (no rompe a quien ya lo usa)', () => {
    assert.equal(esAdmin({ rol: 'ejecutivo', esSuperAdmin: true }), true)
  })
})

describe('puedeVerZona · aislamiento entre ejecutivos', () => {
  const eje = { id: 'e1', rol: 'ejecutivo', zona: 'NOR-ORIENTE' }

  test('un ejecutivo ve su zona y no la de su par', () => {
    assert.equal(puedeVerZona(eje, 'NOR-ORIENTE', 'NOR-ORIENTE'), true)
    assert.equal(puedeVerZona(eje, 'NOR-ORIENTE', 'ZONA SUR'), false)
  })

  test('comparación sin distinguir mayúsculas ni espacios', () => {
    assert.equal(puedeVerZona(eje, 'NOR-ORIENTE', 'nor-oriente'), true)
  })

  test('sin zona no se ve nada (nunca un "sí" por defecto)', () => {
    assert.equal(puedeVerZona(eje, null, 'ZONA SUR'), false)
    assert.equal(puedeVerZona(eje, 'NOR-ORIENTE', ''), false)
  })

  test('un admin ve todas las zonas', () => {
    assert.equal(puedeVerZona({ rol: 'gerente' }, 'ZONA SUR', 'NOR-PONIENTE'), true)
  })
})

describe('puedeOperarSobre · nadie escribe a nombre de otro', () => {
  test('el autor puede; un tercero no', () => {
    const eje = { id: 'e1', rol: 'ejecutivo' }
    assert.equal(puedeOperarSobre(eje, 'e1'), true)
    assert.equal(puedeOperarSobre(eje, 'e2'), false)
  })

  test('un admin puede operar sobre cualquiera', () => {
    assert.equal(puedeOperarSobre({ id: 'a1', rol: 'admin' }, 'e2'), true)
  })

  test('sin id de dueño, no se autoriza', () => {
    assert.equal(puedeOperarSobre({ id: 'e1', rol: 'ejecutivo' }, null), false)
  })
})

describe('esTokenCatalogo · la URL no es confiable', () => {
  test('un token real pasa', () => {
    assert.equal(esTokenCatalogo('827641c8f9bec7c995ee4a39224866fa4c21'), true)
    assert.equal(esTokenCatalogo('A'.repeat(24).toLowerCase()), true)
  })

  test('lo que NO es un token se rechaza', () => {
    for (const t of [
      '', ' ', null, undefined, 42, {}, [],
      '../../etc/passwd',                // path traversal
      "1' or '1'='1",                    // inyección
      '%20%27%20or%20%271%27%3D%271',    // inyección URL-encoded
      'abc',                             // demasiado corto
      'z'.repeat(36),                    // no es hex
      'a'.repeat(65),                    // demasiado largo
    ]) {
      assert.equal(esTokenCatalogo(t), false, String(t))
    }
  })

  test('tokenCatalogoSeguro normaliza y nunca devuelve la entrada cruda', () => {
    assert.equal(tokenCatalogoSeguro(' 827641C8F9BEC7C995EE4A39224866FA4C21 '), '827641c8f9bec7c995ee4a39224866fa4c21')
    assert.equal(tokenCatalogoSeguro('no-es-un-token'), null)
    assert.equal(tokenCatalogoSeguro(null), null)
  })
})

describe('sesionExpirada · el teléfono se pierde', () => {
  const ahora = 1_800_000_000

  test('sin sesión se considera expirada', () => {
    assert.equal(sesionExpirada(null, ahora), true)
    assert.equal(sesionExpirada(undefined, ahora), true)
  })

  test('sesión vigente no expiró', () => {
    assert.equal(sesionExpirada({ expires_at: ahora + 3600 }, ahora), false)
  })

  test('sesión vencida sí expiró', () => {
    assert.equal(sesionExpirada({ expires_at: ahora - 1 }, ahora), true)
  })

  test('sin dato de expiración NO se cierra la sesión (no inventar)', () => {
    // Cerrar sesión por un dato faltante deja a un vendedor tirado en
    // la calle. Ante la duda, se sigue.
    assert.equal(sesionExpirada({ expires_at: 0 }, ahora), false)
    assert.equal(sesionExpirada({}, ahora), false)
  })
})

describe('escaparHtml · antes de insertar texto', () => {
  test('los cinco caracteres peligrosos', () => {
    assert.equal(escaparHtml('<script>'), '&lt;script&gt;')
    assert.equal(escaparHtml('a & b'), 'a &amp; b')
    assert.equal(escaparHtml(`"'x`), '&quot;&#39;x')
  })

  test('null y undefined no revientan', () => {
    assert.equal(escaparHtml(null), '')
    assert.equal(escaparHtml(undefined), '')
  })
})

describe('textoSeguro · log injection', () => {
  test('un salto de línea no puede falsificar una línea del log', () => {
    const s = textoSeguro('Cliente A\n[admin] sesión abierta')
    assert.equal(s.includes('\n'), false)
  })

  test('recorta al máximo', () => {
    assert.ok(textoSeguro('x'.repeat(500), 50).length <= 51)
  })
})

describe('redactar · la consola no es un lugar seguro', () => {
  test('las claves sensibles salen enmascaradas', () => {
    const r = redactar({
      password: 'secreto',
      access_token: 'abc',
      'api-key': 'xyz',
      Authorization: 'Bearer 1',
      service_key: 'k',
      nombre: 'Juan',
    })
    assert.equal(r.password, '***')
    assert.equal(r.access_token, '***')
    assert.equal(r['api-key'], '***')
    assert.equal(r.Authorization, '***')
    assert.equal(r.service_key, '***')
    assert.equal(r.nombre, 'Juan') // lo que no es sensible pasa
  })

  test('un JWT pegado como string también se oculta', () => {
    // Los errores de Supabase traen el token en headers/config.
    assert.equal(redactar({ config: { token: 'eyJhbGciOiJIUzI1NiJ9.zzzz' } }).config.token, '***')
    assert.equal(redactar('eyJhbGciOiJIUzI1NiJ9.zzzz'), '***JWT***')
  })

  test('objetos anidados y arrays se recorren', () => {
    const r = redactar({ a: { b: { password: 'x' } }, lista: [{ token: 'y' }, 2] })
    assert.equal(r.a.b.password, '***')
    assert.equal(r.lista[0].token, '***')
    assert.equal(r.lista[1], 2)
  })

  test('un objeto cíclico no cuelga la app en el camino del error', () => {
    const o = { password: 'x' }
    o.self = o
    const r = redactar(o)
    assert.equal(r.password, '***')
    assert.ok(r.self === '[profundo]' || typeof r.self === 'object')
  })

  test('errores se convierten en texto corto', () => {
    const r = redactar({ causa: new Error('falló la query\ncon salto') })
    assert.equal(r.causa.includes('\n'), false)
  })
})
