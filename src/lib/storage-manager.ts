'use client'
/* Dhun — Day 48: storage manager.
 *
 * Quota visibility + honest cache bookkeeping + LRU pressure valve:
 *  - navigator.storage.estimate() → usage/quota (browser-rounded, shown as ≈).
 *  - Cache Storage inventory: per-cache entry counts, lazily measured bytes.
 *  - Auto-evict: when usage pressure crosses the threshold, least-played
 *    offline tracks go first (lastPlayedAt, falling back to cachedAt), never
 *    touching manual favorites mid-session counts beyond what pressure needs.
 */
import { listOffline, removeOffline, type OfflineTrack } from '@/lib/offline'
import { useSettings } from '@/store/settings'
import { useOffline } from '@/store/offline'

export interface CacheInfo {
  name: string
  entries: number
  /** Undefined until measureCache() runs for this cache. */
  bytes?: number
}

export interface StorageSnapshot {
  usage: number
  quota: number
  supported: boolean
}

export async function estimateStorage(): Promise<StorageSnapshot> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      return {
        usage: est.usage ?? 0,
        quota: est.quota ?? 0,
        supported: true,
      }
    }
  } catch {
    /* fall through */
  }
  return { usage: 0, quota: 0, supported: false }
}

export async function listCaches(): Promise<CacheInfo[]> {
  try {
    if (typeof caches === 'undefined') return []
    const names = await caches.keys()
    const out: CacheInfo[] = []
    for (const name of names) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      out.push({ name, entries: keys.length })
    }
    return out
  } catch {
    return []
  }
}

/**
 * Sum actual bytes of a cache by reading every response body.
 * Guarded to maxEntries (bodies are streamed one at a time, never all held).
 */
export async function measureCache(name: string, maxEntries = 400): Promise<number> {
  try {
    if (typeof caches === 'undefined') return 0
    const cache = await caches.open(name)
    const keys = await cache.keys()
    let total = 0
    let count = 0
    for (const req of keys) {
      if (count++ >= maxEntries) break
      const res = await cache.match(req)
      if (!res) continue
      const lenHeader = Number(res.headers.get('content-length') ?? '0')
      if (lenHeader > 0) {
        total += lenHeader
      } else {
        try {
          const buf = await res.clone().arrayBuffer()
          total += buf.byteLength
        } catch {
          /* skip opaque/unreadable entry */
        }
      }
    }
    return total
  } catch {
    return 0
  }
}

export async function clearCacheByName(name: string): Promise<boolean> {
  try {
    return await caches.delete(name)
  } catch {
    return false
  }
}

/** Usage pressure 0..1 (0 when the browser hides the quota). */
export function pressureOf(snap: StorageSnapshot): number {
  if (!snap.supported || snap.quota <= 0) return 0
  return snap.usage / snap.quota
}

const EVICT_THRESHOLD = 0.8

/**
 * Day 48 — auto-evict: when storage usage crosses 80% of quota, remove
 * least-played offline tracks (lastPlayedAt ?? cachedAt ascending) until
 * pressure drops below the line. Only runs when the user opted in, and only
 * ever touches Dhun's own offline registry + audio cache.
 * Returns the number of tracks evicted (0 = nothing to do).
 */
export async function autoEvictIfNeeded(): Promise<number> {
  const settings = useSettings.getState()
  if (!settings.storageAutoEvict) return 0
  const snap = await estimateStorage()
  if (!snap.supported || pressureOf(snap) < EVICT_THRESHOLD) return 0

  const items: OfflineTrack[] = [...useOffline.getState().items].sort(
    (a, b) => (a.lastPlayedAt ?? a.cachedAt) - (b.lastPlayedAt ?? b.cachedAt)
  )
  let evicted = 0
  for (const item of items) {
    if (pressureOf(snap) < EVICT_THRESHOLD) break
    await removeOffline(item.trackId)
    evicted++
    // Re-measure optimistically: assume the freed bytes approximate the item.
    snap.usage = Math.max(0, snap.usage - (item.size || 0))
  }
  if (evicted > 0) await useOffline.getState().refresh()
  return evicted
}
