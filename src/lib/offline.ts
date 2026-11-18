'use client'
/* Dhun — offline track registry (IndexedDB) + service-worker download bridge.
 *
 * The service worker (public/sw.js) owns the Cache Storage audio cache; this module
 * keeps the metadata registry in IndexedDB ('dhun-offline' v1, store 'tracks',
 * keyPath 'trackId', index 'cachedAt') and drives downloads via postMessage.
 *
 * SW message flow for a download:
 *   page -> SW : { type: 'OFFLINE_CACHE', url, trackId }
 *   SW  -> page: OFFLINE_PROGRESS* → OFFLINE_DONE | OFFLINE_ERROR   (filter by trackId)
 *
 * NOTE: the SW 'message' listener is registered BEFORE posting OFFLINE_CACHE —
 * otherwise early OFFLINE_PROGRESS messages would be lost (race).
 */

export interface OfflineTrack {
  trackId: string
  source: 'yt' | 'au' | 'jm'
  title: string
  artist: string
  artwork: string | null
  duration: number
  url: string
  size: number
  cachedAt: number
  /** Set when the audio bytes came from a Smart-Match alternative (Audius/Jamendo). */
  matchedVia?: 'audius' | 'jamendo'
}

export interface AddOfflineItem {
  id: string
  title: string
  artist: string
  artwork?: string | null
  duration?: number
}

export type AddOfflineResult = { ok: true; size: number } | { ok: false; error: string }

const DB_NAME = 'dhun-offline'
const DB_VERSION = 1
const STORE = 'tracks'
const DOWNLOAD_TIMEOUT_MS = 8 * 60 * 1000 // 8 minutes
const DELETE_TIMEOUT_MS = 3000 // fallback resolve for OFFLINE_DELETE ack
const SW_READY_TIMEOUT_MS = 5000 // don't hang forever when no SW exists

/** Resolve the same-origin audio URL for a track. */
export function audioUrlFor(id: string, source?: string, jamendoKey?: string): string {
  if (source === 'au') return `/api/audius/stream/${id}`
  if (source === 'jm') return `/api/jamendo/stream/${id}${jamendoKey ? `?key=${encodeURIComponent(jamendoKey)}` : ''}`
  return `/api/audio/${id}`
}

/* ------------------------- IndexedDB helpers ------------------------- */

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('idb-error'))
  })
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      reject(new Error('no-idb'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'trackId' })
        store.createIndex('cachedAt', 'cachedAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('idb-open-failed'))
    req.onblocked = () => reject(new Error('idb-blocked'))
  })
}

async function withDb<T>(fn: (db: IDBDatabase) => Promise<T> | T): Promise<T> {
  const db = await openDb()
  try {
    return await fn(db)
  } finally {
    try {
      db.close()
    } catch {}
  }
}

async function idbAll(): Promise<OfflineTrack[]> {
  return withDb(async (db) => {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE)
    return (await reqToPromise(store.getAll() as IDBRequest<OfflineTrack[]>)) || []
  })
}

async function idbGet(trackId: string): Promise<OfflineTrack | undefined> {
  return withDb(async (db) => {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE)
    return await reqToPromise(store.get(trackId) as IDBRequest<OfflineTrack | undefined>)
  })
}

async function idbPut(record: OfflineTrack): Promise<void> {
  return withDb(async (db) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
    await reqToPromise(store.put(record))
  })
}

async function idbDelete(trackId: string): Promise<void> {
  return withDb(async (db) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
    await reqToPromise(store.delete(trackId))
  })
}

async function idbClear(): Promise<void> {
  return withDb(async (db) => {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
    await reqToPromise(store.clear())
  })
}

function delay(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms))
}

function swSupported(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

async function getActiveWorker(): Promise<ServiceWorker | null> {
  if (!swSupported()) return null
  // Prefer the worker that actually controls this page…
  if (navigator.serviceWorker.controller) return navigator.serviceWorker.controller
  // …otherwise wait briefly for activation (first-load / claim race).
  try {
    const reg = (await Promise.race([navigator.serviceWorker.ready, delay(SW_READY_TIMEOUT_MS)])) as
      | ServiceWorkerRegistration
      | null
    return reg?.active || null
  } catch {
    return null
  }
}

/* ------------------------------ Public API ------------------------------ */

/** All offline tracks, most-recently-cached first. Empty on any failure. */
export async function listOffline(): Promise<OfflineTrack[]> {
  try {
    const all = await idbAll()
    return all.sort((a, b) => b.cachedAt - a.cachedAt)
  } catch {
    return []
  }
}

export async function getOffline(trackId: string): Promise<OfflineTrack | undefined> {
  try {
    return await idbGet(trackId)
  } catch {
    return undefined
  }
}

export async function hasOffline(trackId: string): Promise<boolean> {
  return (await getOffline(trackId)) !== undefined
}

export async function sizeOfOffline(trackId: string): Promise<number> {
  return (await getOffline(trackId))?.size ?? 0
}

/**
 * Download a track into the SW audio cache and register its metadata.
 * Progress is forwarded via onProgress(loaded, total|null). The listener is
 * attached before the OFFLINE_CACHE message is posted (no race).
 *
 * `urlOverride` lets the caller supply an already-resolved same-origin proxy
 * URL (e.g. `/api/audio/<id>?upstream=…` from the client-assisted resolver);
 * when omitted, the plain audioUrlFor(id) route is used.
 */
export async function addOffline(
  item: AddOfflineItem,
  source: 'yt' | 'au' | 'jm',
  onProgress?: (loaded: number, total: number | null) => void,
  urlOverride?: string,
  matchedVia?: 'audius' | 'jamendo'
): Promise<AddOfflineResult> {
  if (typeof window === 'undefined') return { ok: false, error: 'no-window' }
  try {
    const worker = await getActiveWorker()
    if (!worker) return { ok: false, error: 'no-sw' }

    const trackId = item.id
    const url = urlOverride?.startsWith('/') ? urlOverride : audioUrlFor(trackId, source)

    // 1) Register the listener FIRST (progress/done/error race), 2) THEN post.
    const settled = new Promise<{ kind: 'done'; size: number } | { kind: 'error'; error: string }>(
      (resolve) => {
        const timer = setTimeout(() => {
          navigator.serviceWorker.removeEventListener('message', onMessage)
          resolve({ kind: 'error', error: 'timeout' })
        }, DOWNLOAD_TIMEOUT_MS)
        function onMessage(e: MessageEvent) {
          const data = e.data
          if (!data || data.trackId !== trackId) return
          if (data.type === 'OFFLINE_PROGRESS') {
            onProgress?.(Number(data.loaded) || 0, data.total != null ? Number(data.total) : null)
            return
          }
          clearTimeout(timer)
          navigator.serviceWorker.removeEventListener('message', onMessage)
          if (data.type === 'OFFLINE_DONE') resolve({ kind: 'done', size: Number(data.size) || 0 })
          else resolve({ kind: 'error', error: String(data.error ?? 'unknown') })
        }
        navigator.serviceWorker.addEventListener('message', onMessage)
      }
    )

    worker.postMessage({ type: 'OFFLINE_CACHE', url, trackId })
    const result = await settled

    if (result.kind === 'error') return { ok: false, error: result.error }

    await idbPut({
      trackId,
      source,
      matchedVia,
      title: item.title,
      artist: item.artist,
      artwork: item.artwork ?? null,
      duration: item.duration ?? 0,
      url,
      size: result.size,
      cachedAt: Date.now(),
    })
    return { ok: true, size: result.size }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Remove cache entry (via SW) + metadata row. Resolves even without a live SW. */
export async function removeOffline(trackId: string): Promise<void> {
  try {
    const meta = await getOffline(trackId)
    const url = meta?.url ?? audioUrlFor(trackId)
    if (swSupported()) {
      const worker = await getActiveWorker()
      if (worker) {
        const ack = new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            navigator.serviceWorker.removeEventListener('message', onMessage)
            resolve() // 3s fallback — don't block cleanup on the ack
          }, DELETE_TIMEOUT_MS)
          function onMessage(e: MessageEvent) {
            const data = e.data
            if (data && data.type === 'OFFLINE_DELETED' && data.url === url) {
              clearTimeout(timer)
              navigator.serviceWorker.removeEventListener('message', onMessage)
              resolve()
            }
          }
          navigator.serviceWorker.addEventListener('message', onMessage)
        })
        worker.postMessage({ type: 'OFFLINE_DELETE', url })
        await ack
      }
    }
  } catch {}
  try {
    await idbDelete(trackId)
  } catch {}
}

/** Clear the SW audio cache + the whole metadata store. */
export async function clearAllOffline(): Promise<void> {
  try {
    if (swSupported()) {
      const worker = await getActiveWorker()
      worker?.postMessage({ type: 'OFFLINE_CLEAR' })
    }
  } catch {}
  try {
    await idbClear()
  } catch {}
}

/** Total bytes occupied by downloaded tracks (metadata sum). */
export async function totalOfflineSize(): Promise<number> {
  const items = await listOffline()
  return items.reduce((sum, t) => sum + (t.size || 0), 0)
}
