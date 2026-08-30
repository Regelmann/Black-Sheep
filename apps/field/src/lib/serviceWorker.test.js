/**
 * El service worker es la única pieza capaz de dejar la app en blanco
 * SIN que aparezca un solo error en el servidor: el fallo ocurre entero
 * dentro del navegador, sirviendo un HTML viejo que apunta a módulos que
 * ya no existen.
 *
 * Pasó en desarrollo y podía pasar igual en producción después de un
 * deploy. Estos tests fijan las dos condiciones que lo evitan.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(import.meta.dirname, '..', '..')
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8')

describe('service worker · no puede dejar la pantalla en blanco', () => {
  // 1 · En desarrollo el SW compite con el HMR de Vite: cachea módulos
  //     servidos con ?t=<timestamp> y ante cualquier fallo momentáneo
  //     devuelve una combinación de HTML y módulos que no encaja.
  test('sólo se registra en producción', () => {
    const main = leer('src/main.jsx')
    const reg = main.match(/serviceWorker\.register\([^)]*\)/)
    assert.ok(reg, 'debe existir el registro del SW')

    // El registro tiene que estar dentro de una guarda de producción.
    const antes = main.slice(0, main.indexOf(reg[0]))
    assert.ok(
      /import\.meta\.env\.PROD/.test(antes),
      'el registro del SW debe estar detrás de import.meta.env.PROD'
    )
  })

  // 2 · Un SW instalado en una sesión previa sigue interceptando aunque
  //     hoy ya no lo registremos. Hay que desregistrarlo activamente.
  test('en desarrollo desregistra un SW que haya quedado de antes', () => {
    const main = leer('src/main.jsx')
    assert.ok(
      /getRegistrations\(\)/.test(main) && /\.unregister\(\)/.test(main),
      'dev debe desregistrar los SW previos, o el viejo sigue sirviendo caché'
    )
  })

  // 3 · El HTML NO puede servirse desde caché primero. Es el índice que
  //     apunta a los bundles con hash: si queda viejo tras un deploy,
  //     pide /assets/index-VIEJO.js, que ya no existe → pantalla en blanco.
  //     El handler es ÚNICO (doble respondWith deja muerto al segundo).
  test('la navegación va a la red primero', () => {
    const sw = leer('public/sw.js')

    assert.ok(
      /req\.mode === 'navigate'/.test(sw),
      'el SW debe distinguir las peticiones de navegación del resto'
    )

    // Un solo addEventListener('fetch'): dos respondWith deja al segundo
    // anulado y se pierde la estrategia de navegación. Se busca el handler
    // real (self.addEventListener), no las menciones en comentarios.
    const fetches = sw.match(/self\.addEventListener\('fetch'/g) || []
    assert.equal(
      fetches.length, 1,
      'debe haber un ÚNICO handler de fetch — doble respondWith es un bug'
    )

    // En el bloque de navegación, fetch() tiene que venir antes que
    // caches.open: la caché es el respaldo, no la fuente.
    const bloque = sw.slice(sw.indexOf("req.mode === 'navigate'"))
    const posFetch = bloque.indexOf('fetch(req)')
    const posCache = bloque.indexOf('caches.open(HTML_CACHE)')
    assert.ok(posFetch !== -1, 'la navegación debe intentar la red')
    assert.ok(
      posFetch < posCache,
      'la navegación debe ir a la RED primero y usar la caché sólo como respaldo'
    )
  })

  // 4 · Los datos jamás se cachean: precios o stock viejos mostrados como
  //     actuales son peor que no mostrar nada.
  test('nunca cachea respuestas de Supabase', () => {
    const sw = leer('public/sw.js')
    assert.ok(
      /hostname\.includes\('supabase'\)/.test(sw),
      'las respuestas de Supabase deben quedar fuera del SW'
    )
  })

  // 5 · Al cambiar la estrategia hay que subir la versión, o el navegador
  //     con el SW viejo instalado nunca recibe el arreglo. Hay dos caches:
  //     la de shell (inmutable) y la de HTML (navegación) — ambas versionadas.
  test('la caché está versionada', () => {
    const sw = leer('public/sw.js')
    for (const nombre of ['SHELL_CACHE', 'HTML_CACHE']) {
      const m = sw.match(new RegExp(`const ${nombre}\\s*=\\s*'([\\w-]+)'`))
      assert.ok(m, `debe existir la constante ${nombre} versionada`)
      assert.ok(
        /v\d+$/.test(m[1]),
        `${nombre} = ${m[1]}: debe terminar en vN para poder invalidar la anterior`
      )
    }
  })
})