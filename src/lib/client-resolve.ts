'use client'
/* Dhun — client-assisted YouTube audio resolution (Day-1 offline repair).
 *
 * 2025 reality: server-side extraction (Vercel datacenter IP) is blocked —
 * every public Piped instance returns audioStreams=[] and innertube demands
 * PO tokens. BUT the user's own device (residential/mobile IP) sometimes
 * still succeeds, and Piped APIs send permissive CORS headers.
 *
 * So the DOWNLOAD flow races Piped instances from the browser first. When one
 * wins, the page hands its googlevideo/proxy URL to our own server proxy via
 * `/api/audio/<id>?upstream=<url>` (host-validated there) — same-origin for
 * the service worker, no CORS problem for the media bytes.
 *
 * Returns null when nothing works → caller falls back to the plain server
 * route, which fails with an honest machine-readable reason.
 */

const CLIENT_INSTANCES: string[] = [
  'https://api.piped.private.coffee',
  'https://pipedapi.ducks.party',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.drgns.space',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.nosebs.ru',
]

export interface ClientResolved {
  upstreamUrl: string // absolute URL for /api/audio to proxy
  bitrate: number
  mimeType: string
  instance: string
}

interface PipedAudio {
  url?: string
  bitrate?: number
  mimeType?: string
  quality?: string
  codec?: string
}

interface PipedStreams {
  audioStreams?: PipedAudio[]
}

const RACE_TIMEOUT_MS = 7000

function isM4a(mimeType: string): boolean {
  return /mp4a|m4a|audio\/mp4/i.test(mimeType)
}

async function tryInstance(base: string, id: string): Promise<ClientResolved> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RACE_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}/streams/${encodeURIComponent(id)}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      // no-store: stream URLs are single-use-ish; never poison them
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`${base} → HTTP ${res.status}`)
    const data = (await res.json()) as PipedStreams
    const usable = (data.audioStreams ?? []).filter(
      (s) => typeof s.url === 'string' && s.url.startsWith('https://') && typeof s.bitrate === 'number' && s.bitrate > 0
    )
    if (usable.length === 0) throw new Error(`${base} → no audio streams`)
    // Prefer AAC ≥128k (plays everywhere incl. Safari offline), else highest bitrate.
    const sorted = [...usable].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
    const bestM4a = sorted.find((s) => isM4a(s.mimeType ?? '') && (s.bitrate ?? 0) >= 120_000)
    const best = bestM4a ?? sorted.find((s) => isM4a(s.mimeType ?? '')) ?? sorted[0]
    return {
      upstreamUrl: best.url as string,
      bitrate: best.bitrate as number,
      mimeType: best.mimeType || 'audio/mp4',
      instance: base,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Race every known Piped instance from the user's device.
 * Resolves with the best stream or null (never throws).
 */
export async function clientResolveAudio(id: string): Promise<ClientResolved | null> {
  if (typeof window === 'undefined') return null
  try {
    const results = await Promise.allSettled(CLIENT_INSTANCES.map((base) => tryInstance(base, id)))
    const wins = results
      .filter((r): r is PromiseFulfilledResult<ClientResolved> => r.status === 'fulfilled')
      .map((r) => r.value)
    if (wins.length === 0) return null
    // Prefer m4a winners first, then highest bitrate.
    wins.sort((a, b) => {
      const am = isM4a(a.mimeType) ? 0 : 1
      const bm = isM4a(b.mimeType) ? 0 : 1
      if (am !== bm) return am - bm
      return b.bitrate - a.bitrate
    })
    return wins[0]
  } catch {
    return null
  }
}
