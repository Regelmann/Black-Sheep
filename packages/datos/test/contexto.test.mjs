import test from 'node:test'
import assert from 'node:assert/strict'
import { contextoDeSesion } from '../contexto.js'

function tokenCon(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.firma`
}

test('usa tenant_id y rol emitidos en los claims', () => {
  const session = {
    access_token: tokenCon({
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'vendedor@empresa.cl',
      tenant_id: '22222222-2222-2222-2222-222222222222',
      rol: 'ejecutivo',
    }),
    user: { id: '11111111-1111-1111-1111-111111111111', email: 'vendedor@empresa.cl' },
  }

  assert.deepEqual(contextoDeSesion(session), {
    usuarioId: '11111111-1111-1111-1111-111111111111',
    email: 'vendedor@empresa.cl',
    tenantId: '22222222-2222-2222-2222-222222222222',
    rol: 'ejecutivo',
    rolPlataforma: null,
    esSuperadmin: false,
  })
})

test('mantiene compatibilidad con app_metadata', () => {
  const session = {
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'admin@empresa.cl',
      app_metadata: {
        tenant_id: '22222222-2222-2222-2222-222222222222',
        rol: 'tenant_admin',
        rol_plataforma: 'superadmin',
      },
    },
  }

  assert.equal(contextoDeSesion(session).tenantId, '22222222-2222-2222-2222-222222222222')
  assert.equal(contextoDeSesion(session).rol, 'tenant_admin')
  assert.equal(contextoDeSesion(session).esSuperadmin, true)
})

test('una sesión vacía no inventa tenant', () => {
  assert.equal(contextoDeSesion(null).tenantId, null)
  assert.equal(contextoDeSesion(null).esSuperadmin, false)
})
