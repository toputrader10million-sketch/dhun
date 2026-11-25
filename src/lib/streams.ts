// Shared YouTube audio-stream resolver — server-only.
// Extracted from src/app/api/streams/[id]/route.ts so /api/audio/[id] can reuse it.
//
// 2025 reality: Piped instances frequently fail (YouTube blocks anonymous
// server-side extraction from datacenter IPs). Strategy:
//   - resolve ALL instances in PARALLEL (Promise.any) with a short timeout —
//     worst-case wall time ≈ timeout, not timeout × instance-count
//   - cache successful resolutions (stream URLs live ~6h, we keep 40 min)
//   - pick the highest-quality compatible audio stream
import type { AudioStream } from '@/lib/types'
import { PIPED_INSTANCES } from '@/lib/piped'
import { withBreaker } from '@/lib/circuit-breaker'

export interface PipedAudioStream {
  url?: string
  bitrate?: number
  mimeType?: string
  quality?: string
  codec?: string
}

interface StreamsResponse {
  title?: string
  duration?: number
  audioStreams?: PipedAudioStream[]
}

export interface ResolvedStreams {
  title: string
  duration: number
  audioStreams: AudioStream[]
  instance: string
}

// ---------- resolved-streams cache (global singleton survives HMR) ----------
const globalForStreams = globalThis as unknown as {
  __dhunStreamCache?: Map<string, { data: ResolvedStreams; expires: number }>
}
const streamCache: Map<string, { data: ResolvedStreams; expires: number }> =
  globalForStreams.__dhunStreamCache ?? new Map()
globalForStreams.__dhunStreamCache = streamCache

const RESOLVE_TIMEOUT_MS = 4500
const RESOLVE_TTL_MS = 40 * 60 * 1000 // stream URLs typically expire ~6h

// track the last healthy instance index (module-level, survives within a lambda)
let preferredInstance = 0

async function tryInstance(base: string, id: string): Promise<ResolvedStreams> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/streams/${encodeURIComponent(id)}`, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`${base} → HTTP ${res.status}`)
    const data = (await res.json()) as StreamsResponse
    const audio: AudioStream[] = (data.audioStreams ?? [])
      .filter((s) => typeof s.url === 'string' && s.url && typeof s.bitrate === 'number')
      .map((s) => ({
        url: s.url as string,
        bitrate: s.bitrate as number,
        mimeType: s.mimeType ?? 'audio/mp4',
        quality: s.quality ?? `${Math.round((s.bitrate ?? 0) / 1000)} kbps`,
        codec: s.codec,
      }))
    if (audio.length === 0) throw new Error(`${base} → no audio streams`)
    return {
      title: data.title ?? '',
      duration: typeof data.duration === 'number' ? data.duration : 0,
      audioStreams: sortStreamsDesc(audio),
      instance: base,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function resolveStreams(id: string, maxInstances = 3): Promise<ResolvedStreams> {
  const cached = streamCache.get(id)
  if (cached && cached.expires > Date.now()) return cached.data

  // Q1.3 — the resolve race sits behind the "streams" breaker: when every
  // instance is failing, further resolves fail fast instead of burning
  // RESOLVE_TIMEOUT_MS per attempt (stale stream URLs are never served —
  // they expire server-side within minutes).
  return withBreaker('streams', async () => {
    // Rotate through instances starting from the last healthy one; race in parallel.
    const start = PIPED_INSTANCES[preferredInstance] ? preferredInstance : 0
    const order: string[] = []
    for (let i = 0; i < Math.min(maxInstances, PIPED_INSTANCES.length); i++) {
      order.push(PIPED_INSTANCES[(start + i) % PIPED_INSTANCES.length])
    }

    const results = await Promise.allSettled(order.map((base) => tryInstance(base, id)))
    const fulfilled = results.find((r) => r.status === 'fulfilled') as
      | { status: 'fulfilled'; value: ResolvedStreams }
      | undefined
    if (fulfilled) {
      const resolved = fulfilled.value
      // remember which slot worked so the next resolve starts there
      const idx = PIPED_INSTANCES.indexOf(resolved.instance)
      if (idx >= 0) preferredInstance = idx
      streamCache.set(id, { data: resolved, expires: Date.now() + RESOLVE_TTL_MS })
      if (streamCache.size > 300) {
        for (const [k, v] of streamCache) if (v.expires < Date.now()) streamCache.delete(k)
      }
      return resolved
    }

    const errors = results.map((r) =>
      r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : 'skipped'
    )
    throw new AggregateError(
      errors.map((e) => new Error(e)),
      `All Piped instances failed for /streams/${id}`
    )
  })
}

function sortStreamsDesc(streams: AudioStream[]): AudioStream[] {
  return [...streams].sort((a, b) => b.bitrate - a.bitrate)
}

function isM4a(mimeType: string): boolean {
  return /mp4a|m4a|audio\/mp4/i.test(mimeType)
}

/**
 * Pick the best audio-only stream for BROWSER playback.
 * - explicit maxBitrate (kbps, or bps when > 1000): highest stream at/below it
 * - otherwise prefer the highest-bitrate m4a/AAC (universally playable, best
 *   quality ≥128 kbps); when only opus/webm exists, take the highest one
 */
export function pickAudioStream(
  streams: AudioStream[],
  maxBitrate?: number | null
): AudioStream | null {
  if (streams.length === 0) return null
  const sorted = sortStreamsDesc(streams)

  if (typeof maxBitrate === 'number' && Number.isFinite(maxBitrate) && maxBitrate > 0) {
    const cap = maxBitrate > 1000 ? maxBitrate : maxBitrate * 1000 // accept bps or kbps
    const below = sorted.filter((s) => s.bitrate <= cap)
    const pool = below.length > 0 ? below : sorted
    const m4a = pool.filter((s) => isM4a(s.mimeType))
    return m4a[0] ?? pool[0]
  }

  const m4a = sorted.filter((s) => isM4a(s.mimeType))
  // AAC ≥128k is the sweet spot: full quality + plays everywhere (incl. Safari)
  const bestM4a = m4a.find((s) => s.bitrate >= 120_000)
  return bestM4a ?? m4a[0] ?? sorted[0]
}

/**
 * Forward-proxy an upstream media URL, piping the body through (no buffering).
 * `externalSignal` (the incoming request's signal) aborts upstream when the
 * client disconnects; no hard timeout here — body streaming must not be cut off.
 */
export async function proxyMediaResponse(
  upstreamUrl: string,
  rangeHeader: string | null,
  fallbackContentType: string,
  externalSignal?: AbortSignal
): Promise<Response> {
  const upstream = await fetch(upstreamUrl, {
    headers: rangeHeader ? { Range: rangeHeader } : undefined,
    redirect: 'follow',
    cache: 'no-store',
    signal: externalSignal,
  })

  if (!upstream.ok && upstream.status !== 206) {
    throw new Error(`Upstream media fetch failed: HTTP ${upstream.status}`)
  }

  const out = new Headers()
  out.set('Content-Type', upstream.headers.get('content-type') || fallbackContentType)
  out.set('Accept-Ranges', 'bytes')
  out.set('Cache-Control', 'public, max-age=604800')
  const len = upstream.headers.get('content-length')
  if (len) out.set('Content-Length', len)
  const contentRange = upstream.headers.get('content-range')
  if (contentRange) out.set('Content-Range', contentRange)

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers: out,
  })
}
