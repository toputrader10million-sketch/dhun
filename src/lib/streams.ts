// Shared YouTube audio-stream resolver — server-only.
// Extracted from src/app/api/streams/[id]/route.ts so /api/audio/[id] can reuse it.
import type { AudioStream } from '@/lib/types'
import { PIPED_INSTANCES } from '@/lib/piped'

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

/** Try /streams/{id} on every instance, 6s timeout each, return first success. */
export async function resolveStreams(id: string): Promise<ResolvedStreams> {
  const errors: string[] = []

  for (const base of PIPED_INSTANCES) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    try {
      const res = await fetch(`${base}/streams/${encodeURIComponent(id)}`, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) {
        errors.push(`${base} → HTTP ${res.status}`)
        continue
      }
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
        .sort((a, b) => b.bitrate - a.bitrate)

      if (audio.length === 0) {
        errors.push(`${base} → no audio streams`)
        continue
      }

      return {
        title: data.title ?? '',
        duration: typeof data.duration === 'number' ? data.duration : 0,
        audioStreams: audio,
        instance: base,
      }
    } catch (err) {
      errors.push(`${base} → ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      clearTimeout(timer)
    }
  }

  throw new AggregateError(
    errors.map((e) => new Error(e)),
    `All Piped instances failed for /streams/${id}`
  )
}

function isM4a(mimeType: string): boolean {
  return /mp4a|m4a|audio\/mp4/i.test(mimeType)
}

/**
 * Pick the best audio-only stream.
 * - explicit maxBitrate (kbps, or bps when > 1000): highest stream at/below it
 * - otherwise prefer m4a/mp4a closest to ~144 kbps (128–160 sweet spot)
 * - fall back to the highest-bitrate stream of any codec (webm/opus plays fine)
 */
export function pickAudioStream(
  streams: AudioStream[],
  maxBitrate?: number | null
): AudioStream | null {
  if (streams.length === 0) return null

  if (typeof maxBitrate === 'number' && Number.isFinite(maxBitrate) && maxBitrate > 0) {
    const cap = maxBitrate > 1000 ? maxBitrate : maxBitrate * 1000 // accept bps or kbps
    const below = streams.filter((s) => s.bitrate <= cap)
    return (below.length > 0 ? below : streams).reduce((best, s) =>
      s.bitrate > best.bitrate ? s : best
    )
  }

  const m4a = streams.filter((s) => isM4a(s.mimeType))
  if (m4a.length > 0) {
    // closest to 144 kbps
    return m4a.reduce((best, s) =>
      Math.abs(s.bitrate - 144_000) < Math.abs(best.bitrate - 144_000) ? s : best
    )
  }
  return streams[0] // pre-sorted desc by bitrate
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
