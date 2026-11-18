import { NextRequest, NextResponse } from 'next/server'
import { pickAudioStream, proxyMediaResponse, resolveStreams } from '@/lib/streams'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Allow-list for client-assisted upstream media URLs (?upstream=).
 * The browser-side resolver (src/lib/client-resolve.ts) races Piped instances
 * from the user's device and hands the winning googlevideo / instance-proxy
 * URL here; we only proxy media hosts we know — never an arbitrary SSRF target.
 */
function isAllowedUpstream(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return false
    const h = u.hostname
    return (
      h.endsWith('.googlevideo.com') ||
      h.includes('pipedproxy') ||
      h.startsWith('proxy.piped') ||
      h.endsWith('.odycdn.com')
    )
  } catch {
    return false
  }
}

// GET → same-origin YouTube audio proxy.
//  Mode 1 (default): resolve an audio-only stream via the shared resolver and
//                    pipe it through (?maxBitrate=<kbps> caps the stream).
//  Mode 2 (?upstream=https://…): proxy a client-resolved media URL directly —
//                    used by the offline download flow when server-side
//                    extraction is blocked but the user's device succeeded.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing stream id' }, { status: 400 })

  const upstreamRaw = req.nextUrl.searchParams.get('upstream')
  if (upstreamRaw) {
    if (!isAllowedUpstream(upstreamRaw)) {
      return NextResponse.json(
        { error: 'Upstream host not allowed', reason: 'upstream-not-allowed' },
        { status: 400 }
      )
    }
    const contentType = req.nextUrl.searchParams.get('ct') || 'audio/mp4'
    try {
      return await proxyMediaResponse(
        upstreamRaw,
        req.headers.get('range'),
        contentType,
        req.signal
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Expired signed URLs (~6h) land here — the client should re-resolve.
      return NextResponse.json(
        { error: `Upstream fetch failed: ${msg}`, reason: 'upstream-expired' },
        { status: 502 }
      )
    }
  }

  try {
    const resolved = await resolveStreams(id)

    const maxBitrateRaw = req.nextUrl.searchParams.get('maxBitrate')
    const maxBitrate = maxBitrateRaw ? parseFloat(maxBitrateRaw) : null
    const best = pickAudioStream(resolved.audioStreams, maxBitrate)
    if (!best) {
      return NextResponse.json({ error: 'No audio streams available' }, { status: 502 })
    }

    return await proxyMediaResponse(
      best.url,
      req.headers.get('range'),
      best.mimeType || 'audio/mp4',
      req.signal
    )
  } catch (err) {
    const detail = err instanceof AggregateError
      ? err.errors.map((e) => (e instanceof Error ? e.message : String(e)))
      : [err instanceof Error ? err.message : String(err)]
    return NextResponse.json(
      {
        error: `Failed to resolve audio for ${id}`,
        // Machine-readable reason — the service worker surfaces it to the
        // offline download UI so we can give an honest, specific message.
        reason: 'youtube-download-blocked',
        detail,
      },
      { status: 502 }
    )
  }
}
