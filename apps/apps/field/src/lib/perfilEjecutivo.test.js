/**
 * Un fallo de red no puede degradar a un gerente a vendedor.
 *
 * App.jsx hacía `.then(({ data }) => ...)` sin mirar `error`. supabase-js
 * no lanza: ante RLS o red devuelve { data: null, error }. El código leía
 * data = null como "usuario sin fila en ejecutivos" y armaba un perfil con
 * esSuperAdmin: false.
 *
 * El gerente entraba sin /gerencia ni /admin, sin ningún aviso. Los
 * botones no estaban y no había forma de distinguirlo de "no tenés
 * permiso".
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { perfilDesdeFila, resolverPerfil } from './perfilEjecutivo.js'

const USUARIO = { id: 'u-1', email: 'ana@keyfoods.cl' }

describe('perfil del ejecutivo', () => {
  test('un gerente queda con permisos elevados', () => {
    const p = perfilDesdeFila({ id: 'u-1', nombre: 'Ana', zona: 'COSTA', rol: 'gerente' }, USUARIO)
    assert.equal(p.esSuperAdmin, true)
    assert.equal(p.zona, 'COSTA')
  })

  test('superadmin y admin también', () => {
    for (const rol of ['superadmin', 'admin', 'GERENTE', 'Admin']) {
      assert.equal(perfilDesdeFila({ id: 'u-1', rol }, USUARIO).esSuperAdmin, true, rol)
    }
  })

  test('un vendedor no tiene permisos elevados', () => {
    assert.equal(perfilDesdeFila({ id: 'u-1', rol: 'ejecutivo' }, USUARIO).esSuperAdmin, false)
  })

  test('sin fila se arma el perfil mínimo desde el email', () => {
    const p = perfilDesdeFila(null, USUARIO)
    assert.equal(p.esSuperAdmin, false)
    assert.equal(p.nombre, 'ana@keyfoods.cl')
  })
})

describe('resolverPerfil · un error de lectura no degrada a nadie', () => {
  test('lectura correcta devuelve el perfil', () => {
    const { perfil, error } = resolverPerfil(
      { data: { id: 'u-1', rol: 'gerente' }, error: null },
      USUARIO,
    )
    assert.equal(error, null)
    assert.equal(perfil.esSuperAdmin, true)
  })

  // El caso del bug.
  test('un error de red NO produce un perfil de vendedor', () => {
    const { perfil, error } = resolverPerfil(
      { data: null, error: { message: 'Failed to fetch' } },
      USUARIO,
    )
    assert.equal(
      perfil,
      null,
      'devolver un perfil acá es exactamente el bug: el gerente pierde /gerencia sin enterarse',
    )
    assert.match(error, /perfil|fetch/i, 'tiene que haber algo que mostrar')
  })

  test('un fallo de RLS tampoco degrada', () => {
    const { perfil } = resolverPerfil(
      { data: null, error: { message: 'new row violates row-level security' } },
      USUARIO,
    )
    assert.equal(perfil, null)
  })

  test('data null SIN error sí es "no tiene fila"', () => {
    const { perfil, error } = resolverPerfil({ data: null, error: null }, USUARIO)
    assert.equal(error, null)
    assert.ok(perfil, 'sin error, la ausencia de fila es un dato real')
    assert.equal(perfil.esSuperAdmin, false)
  })

  test('una respuesta vacía no rompe', () => {
    const r = resolverPerfil(undefined, USUARIO)
    assert.ok(r.perfil || r.error === null)
  })
})