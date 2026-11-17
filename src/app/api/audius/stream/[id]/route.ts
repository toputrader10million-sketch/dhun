import { NextRequest, NextResponse } from 'next/server'
import { resolveAudiusStreamUrl } from '@/lib/audius'
import { proxyMediaResponse } from '@/lib/streams'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → streaming proxy for Audius tracks (CDN mp3), Range-aware, piped through.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing track id' }, { status: 400 })

  try {
    const streamUrl = await resolveAudiusStreamUrl(id)
    const response = await proxyMediaResponse(
      streamUrl,
      req.headers.get('range'),
      'audio/mpeg',
      req.signal
    )
    return response
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Audius stream failed' },
      { status: 502 }
    )
  }
}
