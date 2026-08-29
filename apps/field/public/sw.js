/* Black Sheep Field — shell offline.
 *
 * UN SOLO handler de fetch.
 *
 * ANTES había DOS `addEventListener('fetch')`. En un Service Worker sólo se
 * puede llamar `respondWith` UNA vez por evento, así que el segundo handler
 * (el de navegación, "siempre a red primero") quedaba ANULADO: respondía el
 * primero y el segundo sólo alcanzaba a escribir en `bs-html`, una cache que
 * el `activate` borraba. En la práctica la estrategia de HTML "network-first"
 * nunca gobernó y la cache de nav era efímera.
 *
 * Además la cache `bs-shell` acumulaba TODO el GET same-origin SIN tope de
 * entradas. Los chunks tienen hash y cambian en cada build: cada deploy
 * sumaba chunks viejos que jamás se sacaban, llenando un teléfono de poco
 * disco.
 *
 * AHORA: un único handler que distingue por tipo de request:
 *   · Navegación → siempre red primero, fallback a un HTML cacheado.
 *                  El HTML NUNCA debe servirse del cache en primera instancia:
 *                  si no, un index.html viejo apunta a chunks con hash viejo
 *                  que ya no existen y la app queda en PANTALLA BLANCA.
 *   · Assets estáticos same-origin (hasheados / imagen / css / js) →
 *                  cache-first con tope de entradas. Los hasheados son
 *                  inmutables, así que cachearlos "para siempre" es seguro.
 *   · API (supabase / googleapis) → se ignoran: la estrategia de red de las
 *                  consultas la decide TanStack (offlineFirst), acá no se
 *                  debe cachear un GET que puede cambiar por tenant.
 */
const SHELL_CACHE = 'bs-shell-v5'
const HTML_CACHE  = 'bs-html-v2'
const SHELL = ['/', '/index.html', '/manifest.json', '/brand/logo-mark-192.png', '/brand/logo-mark-512.png']

/* Topes de entradas: evitan que el cache crezca sin límite en el teléfono. */
const MAX_SHELL_ENTRIES = 40
const MAX_HTML_ENTRIES  = 6

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
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
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // No cachear la API por tenant ni los mapas de Google: los GET ahí cambian
  // y cachearlos mezcla datos de tenants distintos.
  if (url.hostname.includes('supabase') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) {
    return
  }

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
