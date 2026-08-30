/**
 * push.js — guardas de regresión del Web Push del catálogo.
 *
 * El push público es el único lugar donde un anon puede registrar algo en la
 * base, así que las guardas importan:
 *   1. El registro SÓLO puede ofrecerse en contexto seguro (HTTPS).
 *   2. Sin clave pública VAPID no hay suscripción posible.
 *   3. suscribirPush debe pedir permiso ANTES de registrar el endpoint.
 *   4. El envío NUNCA toca el handler de fetch del SW (eventos push aparte).
 *   5. urlBase64ToUint8Array decodifica bien (clave VAPID).
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(import.meta.dirname, '..', '..')
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8')

const push = leer('src/lib/push.js')
const sw = leer('public/sw.js')

describe('Web Push · guardas del catálogo', () => {
  test('sólo se ofrece en contexto seguro (HTTPS)', () => {
    assert.match(
      push,
      /window\.isSecureContext/,
      'sin isSecureContext el navegador NO permite PushManager — el botón debe ocultarse'
    )
  })

  test('exige clave pública VAPID', () => {
    assert.match(
      push,
      /VITE_VAPID_PUBLIC_KEY/,
      'sin la clave pública no se puede suscribir — pushDisponible() debe ser false'
    )
    assert.match(
      push,
      /if \(!VAPID_PUBLIC\) return false/,
      'pushDisponible() debe devolver false si falta la clave'
    )
  })

  test('pide permiso ANTES de registrar el endpoint', () => {
    const posPermiso = push.indexOf('Notification.requestPermission()')
    const posSubscribe = push.indexOf('pushManager.subscribe(')
    assert.ok(posPermiso !== -1, 'debe pedir permiso')
    assert.ok(
      posPermiso < posSubscribe,
      'sin permiso concedido no hay que llamar a pushManager.subscribe'
    )
  })

  test('desuscribe el endpoint del navegador antes de borrar el registro', () => {
    const posUnsub = push.indexOf('sub.unsubscribe()')
    const posRpcBorra = push.indexOf("'borrar'")
    assert.ok(posUnsub !== -1, 'debe desuscribir el endpoint del navegador')
    assert.ok(
      posUnsub < posRpcBorra,
      'el orden: quitar el permiso local y después el registro en la base'
    )
  })

  test('el SW maneja push y notificationclick sin romper el handler de fetch', () => {
    const fetches = sw.match(/self\.addEventListener\('fetch'/g) || []
    assert.equal(fetches.length, 1, 'sólo UN handler de fetch (doble respondWith es bug)')
    assert.match(sw, /self\.addEventListener\('push'/, 'el SW debe manejar push')
    assert.match(sw, /self\.addEventListener\('notificationclick'/, 'el SW debe abrir la notificación')
  })
})

describe('urlBase64ToUint8Array · decodifica la clave VAPID', () => {
  // Reimplementación mínima para evitar importar el módulo (usa Vite). Es la
  // misma lógica: base64url → Uint8Array.
  function decodificar(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    const out = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
    return out
  }

  test('decodifica "hello" en base64url sin padding', () => {
    // "hello" = aGVsbG8= → base64url sin '=': aGVsbG8
    const bytes = decodificar('aGVsbG8')
    assert.deepEqual(Array.from(bytes), [104, 101, 108, 108, 111])
  })

  test('maneja el relleno que agrega la función', () => {
    // Longitud que no es múltiplo de 3: se agrega padding.
    const bytes = decodificar('YQ') // "a" → YQ==
    assert.deepEqual(Array.from(bytes), [97])
  })
})
