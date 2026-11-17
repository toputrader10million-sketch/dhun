// Piped instance layer — instance rotation, timeouts, in-memory cache, item parsing.
// Server-side only. Do NOT import from client components.
import net from 'node:net'
import type { MusicItem } from '@/lib/types'

// Node's undici Happy-Eyeballs defaults to a 250ms per-attempt connect timeout;
// some Piped instances take ~270ms to accept IPv4 connections, causing
// "fetch failed / AggregateError". Raise the attempt window for this process.
try {
  const netAny = net as unknown as {
    setDefaultAutoSelectFamilyAttemptTimeout?: (ms: number) => void
  }
  if (typeof netAny.setDefaultAutoSelectFamilyAttemptTimeout === 'function') {
    netAny.setDefaultAutoSelectFamilyAttemptTimeout(2000)
  }
} catch {
  /* non-fatal: older runtimes without the API */
}

export const PIPED_INSTANCES: string[] = [
  'https://api.piped.private.coffee',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.ducks.party',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.reallyaweso.me',
]

// ---------- cache (global singleton survives HMR) ----------
interface CacheEntry {
  data: unknown
  expires: number
}

const globalForCache = globalThis as unknown as {
  __dhunPipedCache?: Map<string, CacheEntry>
}

const cacheStore: Map<string, CacheEntry> =
  globalForCache.__dhunPipedCache ?? new Map<string, CacheEntry>()
globalForCache.__dhunPipedCache = cacheStore

export function cacheGet<T>(key: string): T | undefined {
  const entry = cacheStore.get(key)
  if (!entry) return undefined
  if (entry.expires < Date.now()) {
    cacheStore.delete(key)
    return undefined
  }
  return entry.data as T
}

export function cacheSet(key: string, data: unknown, ttlMs = 10 * 60 * 1000): void {
  // basic size guard to avoid unbounded growth
  if (cacheStore.size > 500) {
    const now = Date.now()
    for (const [k, v] of cacheStore) {
      if (v.expires < now) cacheStore.delete(k)
    }
    if (cacheStore.size > 500) {
      // drop oldest inserted keys
      const firstKeys = [...cacheStore.keys()].slice(0, cacheStore.size - 500)
      for (const k of firstKeys) cacheStore.delete(k)
    }
  }
  cacheStore.set(key, { data, expires: Date.now() + ttlMs })
}

// ---------- instance rotation ----------
const globalForInstance = globalThis as unknown as {
  __dhunPreferredInstance?: number
}

let preferredInstance: number = globalForInstance.__dhunPreferredInstance ?? 0

function markHealthy(index: number) {
  preferredInstance = index
  globalForInstance.__dhunPreferredInstance = index
}

export function getPreferredInstance(): string {
  return PIPED_INSTANCES[preferredInstance] ?? PIPED_INSTANCES[0]
}

/** Fetch a Piped API path, trying instances in order starting from the last healthy one. */
export async function fetchPiped<T>(path: string, timeoutMs = 6000): Promise<T> {
  const errors: unknown[] = []
  const order = [
    preferredInstance,
    ...PIPED_INSTANCES.map((_, i) => i).filter((i) => i !== preferredInstance),
  ]
  for (const idx of order) {
    const base = PIPED_INSTANCES[idx]
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${base}${path}`, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) {
        errors.push(new Error(`${base}${path} → HTTP ${res.status}`))
        continue
      }
      const data = (await res.json()) as T
      markHealthy(idx)
      return data
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)))
    } finally {
      clearTimeout(timer)
    }
  }
  throw new AggregateError(
    errors.filter((e) => e instanceof Error),
    `All ${PIPED_INSTANCES.length} Piped instances failed for ${path}`
  )
}

// ---------- item parsing ----------
function extractId(it: Record<string, unknown>): string {
  if (typeof it.id === 'string' && it.id) return it.id
  const url = typeof it.url === 'string' ? it.url : ''
  const m = url.match(/[?&]v=([^&]+)/)
  if (m) return m[1]
  // playlist/album style urls: /playlist?list=ID
  const list = url.match(/[?&]list=([^&]+)/)
  if (list) return list[1]
  return url.replace(/^\//, '')
}

function toDuration(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    if (Number.isFinite(n)) return Math.round(n)
  }
  return 0
}

const YT_VIDEO_ID_RE = /^[\w-]{11}$/

/**
 * Direct YouTube CDN thumbnail — never goes through an instance's image proxy
 * (those proxies are rate-limited/dead, which broke artwork across the app).
 * hqdefault.jpg always exists for a valid video id.
 */
function ytThumbUrl(id: string): string | null {
  return YT_VIDEO_ID_RE.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

/** Map any Piped item (stream/playlist/channel) to a MusicItem, gracefully. */
export function parseStreamItem(it: Record<string, unknown>): MusicItem {
  const title = typeof it.title === 'string' ? it.title : typeof it.name === 'string' ? it.name : 'Unknown'
  const artist =
    (typeof it.uploaderName === 'string' && it.uploaderName) ||
    (typeof it.uploader === 'string' && it.uploader) ||
    'Unknown artist'
  const rawArtwork =
    (typeof it.thumbnail === 'string' && it.thumbnail) ||
    (typeof it.thumbnailUrl === 'string' && it.thumbnailUrl) ||
    ''
  const views = typeof it.views === 'number' ? it.views : undefined
  const durRaw = it.duration
  const id = extractId(it)
  const artwork = ytThumbUrl(id) ?? rawArtwork
  return {
    id,
    title,
    artist,
    artwork,
    duration: toDuration(durRaw),
    views,
  }
}

// ---------- title cleaning (server-local copy, mirrors src/lib/format.ts cleanTitle) ----------
export function cleanTitle(title: string): string {
  return title
    .replace(/\((?:[^()]*(?:official|video|audio|lyric|lyrics|hd|hq|mv|visualizer|remix|full)[^()]*)\)/gi, '')
    .replace(/\[(?:[^\[\]]*(?:official|video|audio|lyric|lyrics|hd|hq|4k|mv)[^\[\]]*)\]/gi, '')
    .replace(/\s*[-–]\s*(official|lyric|audio|video|hd|hq|4k).*$/i, '')
    .replace(/\|.*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
