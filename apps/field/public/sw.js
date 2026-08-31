/* Black Sheep Field — shell offline.
 *
 * UN SOLO handler de fetch.
 *
 * ANTES había DOS `addEventListener('fetch')`. En un Service Worker sólo se
 * puede llamar `respondWith` UNA vez por evento, así que el segundo handler
 * (el de navegación, "siempre a red primero") quedaba ANULADO.
 *
 * Además la cache `bs-shell` acumulaba TODO el GET same-origin SIN tope.
 * Los chunks tienen hash y cambian en cada build: cada deploy sumaba
 * chunks viejos que jamás se sacaban.
 *
 * AHORA: un único handler que distingue por tipo de request:
 *   · Navegación → siempre red primero, fallback a un HTML cacheado.
 *                  El HTML NUNCA debe servirse del cache en primera instancia:
 *                  si no, un index.html viejo apunta a chunks con hash viejo
 *                  que ya no existen y la app queda en PANTALLA BLANCA.
 *   · Assets estáticos same-origin (hasheados / imagen / css / js) →
 *                  cache-first con tope de entradas.
 *   · API (supabase / googleapis) → se ignoran.
 *
 * v6: el archivo anterior no parseaba (SHELL indefinido, listeners sin
 * cerrar). El navegador rechazaba el SW o dejaba uno viejo instalado.
 */
const SHELL_CACHE = 'bs-shell-v6'
const HTML_CACHE  = 'bs-html-v3'
/* Topes de entradas: evitan que el cache crezca sin límite en el teléfono. */
const MAX_SHELL_ENTRIES = 40
const MAX_HTML_ENTRIES  = 6

const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/brand/logo-mark-192.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL).catch(() => { /* un asset faltante no puede impedir el SW */ }))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== HTML_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

/* Guarda en una cache respetando un tope de entradas (evicta las más viejas). */
async function cachePutBounded(cacheName, key, res, maxEntries) {
  const cache = await caches.open(cacheName)
  await cache.put(key, res)
  const keys = await cache.keys()
  if (keys.length > maxEntries) {
    // Las primeras claves de `keys()` son las más antiguas (orden de inserción).
    const sobrantes = keys.slice(0, keys.length - maxEntries)
    await Promise.all(sobrantes.map((k) => cache.delete(k)))
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request

  // `url` no estaba declarada: el archivo llegó con el comentario pero
  // sin la lógica. Sin esto el SW cachea respuestas de Supabase y el
  // vendedor ve datos de ayer creyendo que son de ahora — o peor, datos
  // de otro tenant.
  let url
  try { url = new URL(req.url) } catch { return }

  // La API y los mapas NUNCA se cachean: sus GET cambian a cada rato y
  // cachearlos mezclaría datos entre tenants.
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('google.com')
  ) return

  const esMismoOrigen = url.origin === self.location.origin
  // ── Navegación: red primero, fallback al HTML cacheado ──────────────
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone()
          // Sólo se cachea un HTML OK (no un 404/500) para no guardar errores.
          if (res.ok) cachePutBounded(HTML_CACHE, req, copia, MAX_HTML_ENTRIES)
          return res
        })
        .catch(() =>
          caches.open(HTML_CACHE)
            .then((c) => c.match(req))
            .then((r) => r || caches.open(SHELL_CACHE).then((c) => c.match('/index.html')))
        )
    )
    return
  }

  // ── Assets estáticos same-origin: cache-first con tope ──────────────
  if (esMismoOrigen) {
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req)
              .then((res) => {
                if (res.ok) {
                  const copy = res.clone()
                  cachePutBounded(SHELL_CACHE, req, copy, MAX_SHELL_ENTRIES)
                }
                return res
              })
              .catch(() => caches.match(req).then((r) => r || caches.match('/')))
        )
      )
    )
  }
  // De otro origen (no-same-origin que no sea API): dejarlo pasar sin cachear.
})

/* ── WEB PUSH ─────────────────────────────────────────────────────────────
 * Recibe mensajes de la Edge Function `notificar-catalogo` y muestra una
 * notificación. El `notificationclick` abre el catálogo (o el fondo que se
 * haya indicado en el payload). Todo esto NO toca el handler de fetch: son
 * eventos de tipo `push`/`notificationclick`, no peticiones.
 * ----------------------------------------------------------------------- */
self.addEventListener('push', (event) => {
  let datos = { title: 'Black Sheep', body: 'Tenés novedades en tu catálogo', url: '/' }
  if (event.data) {
    try {
      datos = { ...datos, ...event.data.json() }
    } catch {
      /* payload no-JSON: se usa el default */
    }
  }
  event.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: '/brand/logo-mark-192.png',
      badge: '/brand/logo-mark-192.png',
      vibrate: [80, 40, 80],
      data: { url: datos.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((lista) => {
        // Enfocar una pestaña ya abierta del mismo origen, o abrir la URL.
        for (const cl of lista) {
          if ('focus' in cl) return cl.focus()
        }
        return self.clients.openWindow(url)
      })
  )
})
