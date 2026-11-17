import { NextRequest, NextResponse } from 'next/server'
import { pickAudioStream, proxyMediaResponse, resolveStreams } from '@/lib/streams'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → same-origin YouTube audio proxy. Resolves an audio-only stream via the
// shared Piped resolver, forwards the client's Range header upstream and pipes
// the body straight through (no buffering). ?maxBitrate=<kbps> caps the stream.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing stream id' }, { status: 400 })

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
      { error: `Failed to resolve audio for ${id}`, detail },
      { status: 502 }
    )
  }
}
