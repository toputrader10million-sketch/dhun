/* Dhun PWA Service Worker
 * Strategy:
 *  - Precache app shell ('/') + icons + manifest on install
 *  - Cache-first: /_next/static/*, /icons/* (immutable, content-hashed build assets)
 *  - Network-first WITHOUT timeout (offline-only fallback): /api/* cacheable, navigations
 *    (A timeout fallback would serve stale HTML during slow dev/prod compiles)
 *  - Never cache: /api/streams (fresh best-effort attempts), cross-origin artwork/thumbnails
 *  - Navigation: network-first, fallback to cached shell only when the network fails
 */
const VERSION = 'dhun-v2'
const SHELL_CACHE = `${VERSION}-shell`
const STATIC_CACHE = `${VERSION}-static`
const API_CACHE = `${VERSION}-api`

const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
]

const API_CACHEABLE = ['/api/home', '/api/search', '/api/suggestions', '/api/lyrics', '/api/artwork', '/api/favorites', '/api/playlists', '/api/history', '/api/instances']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: 'reload' }))))
      .catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

function isCacheableApi(url) {
  return API_CACHEABLE.some((p) => url.pathname.startsWith(p))
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.status === 200 && response.type === 'basic') {
    cache.put(request, response.clone())
  }
  return response
}

/** Network-first, falls back to cache ONLY when the network itself fails (offline). */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response && response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone())
    }
    return response
  } catch (err) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // thumbnails/artwork from CDNs — bypass

  if (url.pathname.startsWith('/api/streams')) return // never cache streams
  if (url.pathname.startsWith('/api/') && isCacheableApi(url)) {
    event.respondWith(
      networkFirst(request, API_CACHE).catch(() =>
        new Response(JSON.stringify({ offline: true, error: 'You are offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
    return
  }
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(async () => {
        const shell = await caches.open(SHELL_CACHE)
        return (await shell.match('/')) || new Response('Offline', { status: 503 })
      })
    )
  }
})
