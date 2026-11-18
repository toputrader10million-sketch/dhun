import { NextRequest, NextResponse } from 'next/server'
import { resolveJamendoStreamUrl } from '@/lib/jamendo'
import { proxyMediaResponse } from '@/lib/streams'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → same-origin Jamendo audio proxy (mp3 from Jamendo storage / CDN).
// ?download=1 prefers the track's legal audiodownload link (CC-licensed full
// file, usually higher bitrate) — used by the offline download flow.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing track id' }, { status: 400 })
  const key = req.nextUrl.searchParams.get('key')?.trim() || ''

  try {
    const { url } = await resolveJamendoStreamUrl(id, key, req.nextUrl.searchParams.get('download') === '1')
    return await proxyMediaResponse(url, req.headers.get('range'), 'audio/mpeg', req.signal)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Jamendo stream failed'
    const reason = msg.startsWith('jamendo-') ? msg : 'jamendo-stream-failed'
    return NextResponse.json({ error: msg, reason }, { status: msg === 'jamendo-key-required' || msg === 'jamendo-key-invalid' ? 400 : 502 })
  }
}
