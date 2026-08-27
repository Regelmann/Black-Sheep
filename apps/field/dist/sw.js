/* Black Sheep Field — shell offline */
const CACHE = 'bs-shell-v4'
const SHELL = ['/', '/index.html', '/manifest.json', '/brand/logo-mark-192.png', '/brand/logo-mark-512.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.hostname.includes('supabase') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) {
    return
  }
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone()
        if (res.ok && url.origin === self.location.origin) {
          caches.open(CACHE).then(c => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then(r => r || caches.match('/')))
  )
})


/**
 * NAVEGACIÓN: siempre a la red primero.
 *
 * Un index.html cacheado apunta a chunks con hash viejo. Cuando esos
 * chunks ya no existen en el servidor, el navegador no puede importarlos
 * y la app queda en PANTALLA BLANCA — sin error visible, porque el HTML
 * cargó bien.
 *
 * Los assets con hash sí se pueden cachear para siempre: su nombre
 * cambia en cada build. El HTML no.
 */
self.addEventListener('fetch', (event) => {
  const req = event.request
  const esNavegacion = req.mode === 'navigate'
  if (!esNavegacion) return                    // el resto lo maneja la lógica previa

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copia = res.clone()
        caches.open('bs-html').then((c) => c.put(req, copia)).catch(() => {})
        return res
      })
      // Sin red: recién ahí se sirve la copia guardada.
      .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
  )
})
