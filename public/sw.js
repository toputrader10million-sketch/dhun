/* Dhun PWA Service Worker
 * Strategy:
 *  - Precache app shell ('/' + icons + manifest) on install
 *    (v5: shell is precached so a cold start with zero network still paints the app)
 *  - Cache-first: /_next/static/*, /icons/* (immutable, content-hashed build assets)
 *  - Network-first WITHOUT timeout (offline-only fallback): /api/* cacheable, navigations
 *    (A timeout fallback would serve stale HTML during slow dev/prod compiles)
 *  - Never cache: /api/streams (fresh best-effort attempts), cross-origin artwork/thumbnails
 *  - Audio (/api/audio/*, /api/audius/stream/*): served from the explicit offline audio
 *    cache when present. Caching is EXPLICIT only (via OFFLINE_CACHE messages) — the fetch
 *    handler never auto-caches audio. Range requests other than 'bytes=0-' (mid-file seeks)
 *    bypass the SW entirely so the media element talks to the network untouched.
 *  - Navigation: network-first, fallback to cached shell only when the network fails
 *
 * Message protocol (page -> SW via postMessage to the controlling worker):
 *  { type: 'OFFLINE_CACHE',  url, trackId }  stream-download audio into AUDIO_CACHE
 *  { type: 'OFFLINE_DELETE', url }           delete one cached audio entry
 *  { type: 'OFFLINE_CLEAR' }                 delete every entry in AUDIO_CACHE
 * Message protocol (SW -> page, broadcast to all window clients):
 *  { type: 'OFFLINE_PROGRESS', trackId, loaded, total }   total = null when unknown
 *  { type: 'OFFLINE_DONE', trackId, size, alreadyCached? }
 *  { type: 'OFFLINE_ERROR', trackId, error }              error = HTTP status | 'too-large' | message
 *  { type: 'OFFLINE_DELETED', url }
 *  { type: 'OFFLINE_CLEARED' }
 */
const VERSION = 'dhun-v5'
const SHELL_CACHE = `${VERSION}-shell`
const STATIC_CACHE = `${VERSION}-static`
const API_CACHE = `${VERSION}-api`
const AUDIO_CACHE = `${VERSION}-audio` // starts with VERSION → survives activate cleanup

// Dev servers serve non-hashed, frequently-changing bundles under stable URLs.
// Static assets must be network-first there or the app would run stale code.
const IS_DEV_HOST =
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1' ||
  self.location.hostname.endsWith('.localhost')

const PRECACHE_URLS = [
  '/', // app shell — enables true offline cold-start (first paint without network)
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
]

const API_CACHEABLE = ['/api/home', '/api/search', '/api/suggestions', '/api/lyrics', '/api/artwork', '/api/favorites', '/api/playlists', '/api/history', '/api/instances']

const MAX_AUDIO_BYTES = 150 * 1024 * 1024 // hard cap: never cache audio >150MB
const PROGRESS_EVERY_BYTES = 256 * 1024 // emit progress at least every 256KB…
const PROGRESS_EVERY_PERCENT = 5 // …or every 5% when total size is known
const inFlightAudio = new Set() // per-trackId dedupe of concurrent downloads

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

async function broadcast(message) {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    for (const client of clients) client.postMessage(message)
  } catch {}
}

/* ---------------- Offline audio cache (explicit, message-driven) ---------------- */

async function handleOfflineCache(trackId, url) {
  if (inFlightAudio.has(trackId)) return // dedupe: one download per trackId at a time
  inFlightAudio.add(trackId)
  try {
    const cache = await caches.open(AUDIO_CACHE)
    const existing = await cache.match(url)
    if (existing) {
      await broadcast({ type: 'OFFLINE_DONE', trackId, size: 0, alreadyCached: true })
      return
    }

    const res = await fetch(url, { cache: 'reload' })
    if (!res.ok) {
      // Surface the API's machine-readable reason when present (e.g.
      // 'youtube-download-blocked') so the UI can explain honestly.
      let reason = String(res.status)
      try {
        const data = await res.json()
        if (data && typeof data.reason === 'string') reason = data.reason
      } catch {}
      await broadcast({ type: 'OFFLINE_ERROR', trackId, error: reason })
      return
    }

    const contentType = res.headers.get('content-type') || 'audio/mp4'
    const totalHeader = res.headers.get('content-length')
    const total = totalHeader ? Number(totalHeader) : null

    let blob
    if (res.body) {
      // Stream-read with progress ticks (every 256KB, or every 5% when total is known).
      const reader = res.body.getReader()
      const chunks = []
      let loaded = 0
      let nextBytes = PROGRESS_EVERY_BYTES
      let nextPercent = PROGRESS_EVERY_PERCENT
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.byteLength
        if (loaded > MAX_AUDIO_BYTES) {
          try {
            await reader.cancel()
          } catch {}
          await broadcast({ type: 'OFFLINE_ERROR', trackId, error: 'too-large' })
          return
        }
        const percent = total ? (loaded / total) * 100 : 0
        if (loaded >= nextBytes || (total && percent >= nextPercent)) {
          nextBytes = loaded + PROGRESS_EVERY_BYTES
          nextPercent = percent + PROGRESS_EVERY_PERCENT
          await broadcast({ type: 'OFFLINE_PROGRESS', trackId, loaded, total })
        }
      }
      blob = new Blob(chunks, { type: contentType })
    } else {
      // No streaming body available — blob fallback without progress.
      blob = await res.blob()
      if (blob.size > MAX_AUDIO_BYTES) {
        await broadcast({ type: 'OFFLINE_ERROR', trackId, error: 'too-large' })
        return
      }
      await broadcast({ type: 'OFFLINE_PROGRESS', trackId, loaded: blob.size, total: blob.size })
    }

    await cache.put(
      new Request(url),
      new Response(blob, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(blob.size),
          'Accept-Ranges': 'bytes',
        },
      })
    )
    await broadcast({ type: 'OFFLINE_DONE', trackId, size: blob.size })
  } catch (err) {
    await broadcast({ type: 'OFFLINE_ERROR', trackId, error: (err && err.message) || 'download-failed' })
  } finally {
    inFlightAudio.delete(trackId)
  }
}

async function handleOfflineDelete(url) {
  try {
    const cache = await caches.open(AUDIO_CACHE)
    await cache.delete(url)
  } catch {}
  await broadcast({ type: 'OFFLINE_DELETED', url })
}

async function handleOfflineClear() {
  try {
    const cache = await caches.open(AUDIO_CACHE)
    const keys = await cache.keys()
    await Promise.all(keys.map((key) => cache.delete(key)))
  } catch {}
  await broadcast({ type: 'OFFLINE_CLEARED' })
}

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'OFFLINE_CACHE' && data.url && data.trackId) {
    event.waitUntil(handleOfflineCache(data.trackId, data.url))
  } else if (data.type === 'OFFLINE_DELETE' && data.url) {
    event.waitUntil(handleOfflineDelete(data.url))
  } else if (data.type === 'OFFLINE_CLEAR') {
    event.waitUntil(handleOfflineClear())
  }
})

/* ---------------- Audio fetch handling ---------------- */

/*
 * Offline audio serving:
 *  - 'bytes=0-' (or no range): serve the cached full response when present.
 *  - Any OTHER range (mid-track seek): if a cached copy exists, slice the
 *    cached blob server-side (206) — offline-safe seeking. Otherwise pass the
 *    ranged request straight to the network (native behavior when online).
 *  - Cache miss → plain network passthrough. NO auto-caching here.
 */
function parseRange(range, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!m) return null
  const [, a, b] = m
  if (a === '' && b === '') return null
  let start = 0
  let end = 0
  if (a === '') {
    // suffix range: bytes=-N → last N bytes
    const n = Math.min(Number(b), size)
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number(a)
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1)
  }
  if (!Number.isFinite(start) || start > end || start >= size) return null
  return { start, end }
}

async function serveAudio(request) {
  try {
    const audio = await caches.open(AUDIO_CACHE)
    const hit = await audio.match(request.url)
    if (hit) {
      const range = request.headers.get('range')
      if (!range || range === 'bytes=0-') return hit
      // Offline-safe seeking: slice the cached blob instead of hitting the net.
      try {
        const size = Number(hit.headers.get('content-length')) || (await hit.clone().blob()).size
        const part = parseRange(range, size)
        if (part) {
          const blob = await hit.blob()
          const slice = blob.slice(part.start, part.end + 1)
          return new Response(slice, {
            status: 206,
            headers: {
              'Content-Type': hit.headers.get('content-type') || 'audio/mp4',
              'Content-Length': String(slice.size),
              'Content-Range': `bytes ${part.start}-${part.end}/${size}`,
              'Accept-Ranges': 'bytes',
            },
          })
        }
      } catch {}
      return hit // fall back to full response rather than fail
    }
    // Cache miss → plain network passthrough. NO auto-caching here (explicit only).
    return await fetch(request)
  } catch {
    try {
      return await fetch(request)
    } catch {
      return new Response('Audio unavailable', {
        status: 504,
        headers: { 'Content-Type': 'text/plain' },
      })
    }
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // thumbnails/artwork from CDNs — bypass

  // Offline audio: cache-first when explicitly downloaded; ranged seeks are
  // sliced from the cached blob (offline-safe) or passed through when uncached.
  if (url.pathname.startsWith('/api/audio/') || url.pathname.startsWith('/api/audius/stream/')) {
    event.respondWith(serveAudio(request))
    return
  }

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
    if (IS_DEV_HOST) {
      // Dev: stable chunk URLs change content — network-first, cache only as offline fallback.
      event.respondWith(networkFirst(request, STATIC_CACHE).catch(() => caches.match(request)))
      return
    }
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
