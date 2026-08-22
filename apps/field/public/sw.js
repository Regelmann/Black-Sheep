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
