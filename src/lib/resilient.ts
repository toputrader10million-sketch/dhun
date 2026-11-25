/**
 * Q1.3 — resilient route helper: fresh cache → upstream → stale cache.
 *
 * Content routes follow a common pattern (cacheGet → fetch → cacheSet).
 * serveResilient() wraps that pattern with circuit-breaker awareness:
 *
 * 1. Fresh cache hit  → returned as-is (fast path, no change).
 * 2. Breaker open     → upstream is NOT called; stale cache is served with a
 *                       `degraded` banner, or the error propagates honestly
 *                       when nothing is cached.
 * 3. Upstream success → cached and returned.
 * 4. Upstream failure → stale cache + `degraded` banner, or rethrow.
 *
 * The `degraded` field is surfaced by the client as an honest amber notice
 * ("showing cached data — upstream unreachable").
 */
import { cacheGet, cacheGetStale, cacheSet } from '@/lib/piped'
import { BreakerOpenError, isOpen } from '@/lib/circuit-breaker'

/** Human labels for breaker names — used in honest degraded banners. */
export const UPSTREAM_LABELS: Record<string, string> = {
  piped: 'Piped',
  ytmusic: 'YouTube Music',
  audius: 'Audius',
  streams: 'Piped streams',
  lrclib: 'LRCLIB',
  chartlyrics: 'ChartLyrics',
  itunes: 'iTunes',
  openmeteo: 'Open-Meteo',
  jamendo: 'Jamendo',
  llm: 'AI service',
  oembed: 'YouTube oEmbed',
}

/** First OPEN breaker among `names`, or null when all are healthy. */
export function openBreaker(names: string[]): string | null {
  for (const n of names) if (isOpen(n)) return n
  return null
}

/**
 * Post-build guard for content routes: when the freshly-built payload is
 * EMPTY and an upstream breaker is open, serve the last cached payload with
 * a degraded banner instead of caching the empty result (which would lock
 * the view into an empty state for a full TTL).
 *
 * Returns { data, degraded?, cacheable } — routes return `data` (adding
 * `degraded` to the JSON when present) and only cache when cacheable.
 */
export function emptyResultFallback<T>(opts: {
  cacheKey: string
  out: T
  isEmpty: (v: T) => boolean
  /** Breaker names responsible for this route's data (checked in order). */
  candidates: string[]
}): { data: T; degraded?: DegradedNotice; cacheable: boolean } {
  const { cacheKey, out, isEmpty, candidates } = opts
  if (!isEmpty(out)) return { data: out, cacheable: true }

  const open = openBreaker(candidates)
  if (!open) return { data: out, cacheable: true } // genuinely empty — cache honestly

  const stale = cacheGetStale<T>(cacheKey)
  if (stale !== undefined) {
    return { data: stale, degraded: degradedNotice(UPSTREAM_LABELS[open] ?? open), cacheable: false }
  }
  return { data: out, degraded: degradedNotice(UPSTREAM_LABELS[open] ?? open), cacheable: false }
}

export interface DegradedNotice {
  upstream: string
  notice: string
  stale: true
}

export interface ResilientResult<T> {
  data: T
  degraded?: DegradedNotice
}

export function degradedNotice(upstream: string): DegradedNotice {
  return {
    upstream,
    stale: true,
    notice: `Upstream "${upstream}" is unreachable — showing the last cached data`,
  }
}

export interface ServeResilientOptions<T> {
  cacheKey: string
  ttlMs: number
  /** Breaker name registered for the upstream behind fetchFresh. */
  breaker?: string
  /** Human label used in the degraded banner (e.g. "Piped", "YouTube Music"). */
  upstreamLabel: string
  fetchFresh: () => Promise<T>
}

export async function serveResilient<T>(opts: ServeResilientOptions<T>): Promise<ResilientResult<T>> {
  const { cacheKey, ttlMs, breaker, upstreamLabel, fetchFresh } = opts

  // 1. fresh path
  const fresh = cacheGet<T>(cacheKey)
  if (fresh !== undefined) return { data: fresh }

  // 2. breaker open → stale only, never touch the upstream
  if (breaker && isOpen(breaker)) {
    const stale = cacheGetStale<T>(cacheKey)
    if (stale !== undefined) return { data: stale, degraded: degradedNotice(upstreamLabel) }
    throw new BreakerOpenError(breaker, 0)
  }

  // 3. upstream
  try {
    const data = await fetchFresh()
    cacheSet(cacheKey, data, ttlMs)
    return { data }
  } catch (err) {
    // 4. failure → stale if we have it
    const stale = cacheGetStale<T>(cacheKey)
    if (stale !== undefined) return { data: stale, degraded: degradedNotice(upstreamLabel) }
    throw err
  }
}
